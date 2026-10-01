/**
 * Advisor model invocation.
 *
 * Resolves the configured advisor, streams the built conversation, forwards
 * text deltas to the caller for progressive display, and maps the final
 * response onto a tool result. Transient stream failures are retried with the
 * shared agent retry policy before giving up; success and cancellation keep
 * their details; unavailable results return a generic message while the
 * detailed reason is sent as a UI notification.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { retryAssistantCall } from "@earendil-works/pi-ai";
import type {
  AssistantMessage,
  Message,
  StopReason,
  TextContent,
  ModelThinkingLevel,
  Usage,
} from "@earendil-works/pi-ai";
import type { AdvisorConfig } from "./config.ts";
import { buildAdvisorMessages } from "./context.ts";
import {
  ABORTED_MESSAGE,
  ADVISOR_SYSTEM_PROMPT,
  ADVISOR_UNAVAILABLE_MESSAGE,
  EMPTY_RESPONSE_MESSAGE,
} from "./prompt.ts";

export type AdvisorDetails = {
  advisorModel?: string;
  effort?: ModelThinkingLevel;
  usage?: Usage;
  stopReason?: StopReason;
  errorMessage?: string;
};

type SimpleStreamOptions = NonNullable<
  Parameters<ExtensionContext["modelRegistry"]["streamSimple"]>[2]
>;

function result(
  text: string,
  details: AdvisorDetails,
): AgentToolResult<AdvisorDetails> {
  return {
    content: [{ type: "text", text }],
    details,
    ...(details.usage ? { usage: details.usage } : {}),
  };
}

function textFromResponse(response: AssistantMessage): string {
  return response.content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function advisorUnavailable(
  ctx: ExtensionContext,
  config: AdvisorConfig,
  reason: string,
): AgentToolResult<AdvisorDetails> {
  ctx.ui.notify(`${ADVISOR_UNAVAILABLE_MESSAGE} ${reason}`, "error");
  return result(ADVISOR_UNAVAILABLE_MESSAGE, { effort: config.effort });
}

function responseResult(
  response: AssistantMessage,
  ctx: ExtensionContext,
  config: AdvisorConfig,
  advisorLabel: string,
): AgentToolResult<AdvisorDetails> {
  const details: AdvisorDetails = {
    advisorModel: advisorLabel,
    effort: config.effort,
    usage: response.usage,
    stopReason: response.stopReason,
  };

  if (response.stopReason === "aborted") {
    return result(ABORTED_MESSAGE, {
      ...details,
      errorMessage: response.errorMessage ?? "aborted",
    });
  }

  if (response.stopReason === "error") {
    const message = response.errorMessage ?? "unknown error";
    return advisorUnavailable(ctx, config, `Advisor call failed: ${message}`);
  }

  const text = textFromResponse(response);
  if (!text) {
    return advisorUnavailable(ctx, config, EMPTY_RESPONSE_MESSAGE);
  }

  return result(text, details);
}

function buildStreamOptions(
  signal: AbortSignal | undefined,
  effort: ModelThinkingLevel | undefined,
  sessionId: string | undefined,
): SimpleStreamOptions {
  // Passing the pi session id keeps prompt-cache routing stable across advisor
  // calls: Responses emits prompt_cache_key plus session_id and
  // x-client-request-id affinity headers when sessionId is set. The provider-
  // neutral `reasoning` level replaces the former per-API branching so the
  // resolved provider maps it to whatever it accepts.
  const options: SimpleStreamOptions = { signal, sessionId };
  // "off" means no reasoning effort is requested; let the provider decide.
  if (effort === undefined || effort === "off") return options;
  return { ...options, reasoning: effort };
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(
  error: unknown,
  signal: AbortSignal | undefined,
): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function executeAdvisor(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  config: AdvisorConfig,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<AdvisorDetails> | undefined,
): Promise<AgentToolResult<AdvisorDetails>> {
  const effort = config.effort;
  if (signal?.aborted) {
    return result(ABORTED_MESSAGE, {
      effort,
      stopReason: "aborted",
      errorMessage: "aborted",
    });
  }

  if (config.errorMessage) {
    return advisorUnavailable(
      ctx,
      config,
      `Invalid advisor configuration: ${config.errorMessage}`,
    );
  }
  if (!config.provider) {
    return advisorUnavailable(ctx, config, "advisor.provider is not configured.");
  }
  if (!config.model) {
    return advisorUnavailable(ctx, config, "advisor.model is not configured.");
  }

  let advisor;
  try {
    advisor = ctx.modelRegistry.find(config.provider, config.model);
  } catch (error) {
    return advisorUnavailable(
      ctx,
      config,
      `Could not resolve advisor model: ${errorText(error)}`,
    );
  }
  if (!advisor) {
    return advisorUnavailable(
      ctx,
      config,
      `Advisor model "${config.provider}/${config.model}" is not available.`,
    );
  }

  const advisorLabel = `${advisor.provider}:${advisor.id}`;

  let messages: Message[];
  try {
    messages = buildAdvisorMessages(ctx, pi);
  } catch (error) {
    return advisorUnavailable(
      ctx,
      config,
      `Could not build advisor conversation context: ${errorText(error)}`,
    );
  }

  // One advisor attempt: stream the response, forward text deltas for
  // progressive display, and return the complete message. Streamed text resets
  // on every attempt so partial output from a retried failure is never shown
  // twice or carried into the final result.
  const attemptAdvisor = async (): Promise<AssistantMessage> => {
    let streamedText = "";
    onUpdate?.({
      content: [{ type: "text", text: "" }],
      details: { advisorModel: advisorLabel, effort },
    });

    const stream = ctx.modelRegistry.streamSimple(
      advisor,
      {
        systemPrompt: ADVISOR_SYSTEM_PROMPT,
        messages,
        tools: [],
      },
      buildStreamOptions(signal, effort, ctx.sessionManager.getSessionId()),
    );

    // Only text deltas are forwarded: partials are display-only, and the final
    // tool result is still built from the complete response below.
    for await (const event of stream) {
      if (event.type !== "text_delta") continue;
      streamedText += event.delta;
      onUpdate?.({
        content: [{ type: "text", text: streamedText }],
        details: { advisorModel: advisorLabel, effort },
      });
    }

    return stream.result();
  };

  try {
    // Retry transient stream failures with the same policy the agent loop and
    // summarization use (settings.retry). Deterministic errors fail fast and
    // aborts are terminal; aborts during backoff resolve to an aborted message.
    const response = await retryAssistantCall(
      attemptAdvisor,
      config.retry,
      signal,
    );

    return responseResult(response, ctx, config, advisorLabel);
  } catch (error) {
    const message = errorText(error);
    if (isAbortError(error, signal)) {
      return result(ABORTED_MESSAGE, {
        advisorModel: advisorLabel,
        effort,
        stopReason: "aborted",
        errorMessage: message || "aborted",
      });
    }

    return advisorUnavailable(ctx, config, `Advisor call failed: ${message}`);
  }
}

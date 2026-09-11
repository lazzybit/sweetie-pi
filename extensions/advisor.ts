import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";
import {
  convertToLlm,
  sessionEntryToContextMessages,
} from "@earendil-works/pi-coding-agent";
import type {
  AssistantMessage,
  Message,
  OpenAICompletionsOptions,
  OpenAIResponsesOptions,
  StopReason,
  TextContent,
  ThinkingLevel,
  Usage,
} from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// Change these values to select the reviewer used by advisor().
const ADVISOR_PROVIDER = "openai-proxy";
const ADVISOR_MODEL_ID = "gpt-6-astra";
const ADVISOR_EFFORT: ThinkingLevel | undefined = "xhigh";

const ADVISOR_TOOL_NAME = "advisor";
const ADVISOR_DISPLAY_LABEL = `[advisor] ${ADVISOR_MODEL_ID} (${ADVISOR_PROVIDER})`;
const ADVISOR_SYSTEM_PROMPT = [
  "You are the reviewer in an advisor-strategy workflow.",
  "Read the executor's complete conversation and return exactly one of:",
  "- a concrete plan,",
  "- a correction to the current approach, or",
  "- a stop signal when the executor should ask the user before continuing.",
  "Be concise, directive, and grounded in the files, tool results, and decisions in the conversation.",
  "Advise on the executor's situation described in the conversation.",
  "Never call tools and never write user-facing prose for the executor.",
].join("\n");

const ADVISOR_DESCRIPTION =
  "Ask a stronger reviewer model for guidance. The full conversation and executor tool inventory are forwarded automatically. Takes no parameters.";
const ADVISOR_PROMPT_SNIPPET =
  "Ask a stronger reviewer for a plan, correction, or stop signal when judgment is needed";
const ADVISOR_PROMPT_GUIDELINES = [
  "Call advisor before substantive work, before writing, or before committing to an uncertain interpretation.",
  "Call advisor again when stuck, when evidence conflicts, or when considering a change of approach.",
  "Before calling advisor at the end, make the deliverable durable and run the relevant validation.",
  "After advisor returns, restate its key guidance in the next visible reply before continuing.",
];

const NO_MODEL_MESSAGE =
  "Advisor model is not available. Check ADVISOR_PROVIDER and ADVISOR_MODEL_ID in extensions/advisor.ts.";
const ABORTED_MESSAGE = "Advisor call was cancelled before it completed.";
const EMPTY_RESPONSE_MESSAGE = "Advisor returned no text content.";

type CompletionOptions = NonNullable<
  Parameters<ExtensionContext["modelRegistry"]["complete"]>[2]
>;

type AdvisorDetails = {
  advisorModel?: string;
  effort?: ThinkingLevel;
  usage?: Usage;
  stopReason?: StopReason;
  errorMessage?: string;
};

type AdvisorRenderState = {
  startedAt?: number;
  endedAt?: number;
  interval?: ReturnType<typeof setInterval>;
};

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function resultText(toolResult: AgentToolResult<AdvisorDetails>): string {
  return toolResult.content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

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

function responseResult(
  response: AssistantMessage,
  advisorLabel: string,
  effort: ThinkingLevel | undefined,
): AgentToolResult<AdvisorDetails> {
  const details: AdvisorDetails = {
    advisorModel: advisorLabel,
    effort,
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
    return result(`Advisor call failed: ${message}`, {
      ...details,
      errorMessage: message,
    });
  }

  const text = textFromResponse(response);
  if (!text) {
    return result(EMPTY_RESPONSE_MESSAGE, {
      ...details,
      errorMessage: "empty response",
    });
  }

  return result(text, details);
}

function buildCompletionOptions(
  api: string,
  signal: AbortSignal | undefined,
  effort: ThinkingLevel | undefined,
): CompletionOptions {
  if (effort === undefined) return { signal };

  if (api === "openai-responses") {
    const options: OpenAIResponsesOptions = {
      signal,
      reasoningEffort: effort,
    };
    return options;
  }

  if (api === "openai-completions") {
    const options: OpenAICompletionsOptions = {
      signal,
      reasoningEffort: effort,
    };
    return options;
  }

  return { signal };
}

function errorText(error: unknown): string {
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

function stripInflightAdvisorCall(messages: Message[]): Message[] {
  if (messages.length === 0) return messages;

  const last = messages[messages.length - 1];
  if (last.role !== "assistant") return messages;

  const content = last.content.filter(
    (part) => !(part.type === "toolCall" && part.name === ADVISOR_TOOL_NAME),
  );
  if (content.length === last.content.length) return messages;
  if (content.length === 0) return messages.slice(0, -1);

  return [...messages.slice(0, -1), { ...last, content }];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (item === undefined ? "null" : stableStringify(item)))
      .join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function buildToolInventory(tools: ToolInfo[]): Message | undefined {
  if (tools.length === 0) return undefined;

  const inventory = [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (tool) =>
        `### ${tool.name}\n${tool.description}\n\nParameters: ${stableStringify(tool.parameters)}`,
    )
    .join("\n\n---\n\n");

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `## Available Executor Tools\n\n${inventory}`,
      },
    ],
    timestamp: Date.now(),
  };
}

function buildAdvisorMessages(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Message[] {
  const sessionMessages = ctx.sessionManager
    .buildContextEntries()
    .flatMap(sessionEntryToContextMessages);
  const branch = stripInflightAdvisorCall(convertToLlm(sessionMessages));
  const inventory = buildToolInventory(pi.getAllTools());

  return inventory ? [inventory, ...branch] : branch;
}

async function executeAdvisor(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<AdvisorDetails> | undefined,
): Promise<AgentToolResult<AdvisorDetails>> {
  const effort = ADVISOR_EFFORT;
  if (signal?.aborted) {
    return result(ABORTED_MESSAGE, {
      effort,
      stopReason: "aborted",
      errorMessage: "aborted",
    });
  }

  const advisor = ctx.modelRegistry.find(ADVISOR_PROVIDER, ADVISOR_MODEL_ID);
  if (!advisor) {
    return result(NO_MODEL_MESSAGE, {
      effort,
      errorMessage: "model not found",
    });
  }

  const advisorLabel = `${advisor.provider}:${advisor.id}`;

  let messages: Message[];
  try {
    messages = buildAdvisorMessages(ctx, pi);
  } catch (error) {
    const message = errorText(error);
    return result(`Advisor could not build conversation context: ${message}`, {
      advisorModel: advisorLabel,
      effort,
      errorMessage: message,
    });
  }

  onUpdate?.({
    content: [{ type: "text", text: "" }],
    details: { advisorModel: advisorLabel, effort },
  });

  try {
    const response = await ctx.modelRegistry.complete(
      advisor,
      {
        systemPrompt: ADVISOR_SYSTEM_PROMPT,
        messages,
        tools: [],
      },
      buildCompletionOptions(advisor.api, signal, effort),
    );

    return responseResult(response, advisorLabel, effort);
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

    return result(`Advisor call failed: ${message}`, {
      advisorModel: advisorLabel,
      effort,
      errorMessage: message,
    });
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: ADVISOR_TOOL_NAME,
    label: ADVISOR_DISPLAY_LABEL,
    renderCall: (_args, theme, context) => {
      const state = context.state as AdvisorRenderState;
      if (context.executionStarted && state.startedAt === undefined) {
        state.startedAt = Date.now();
        state.endedAt = undefined;
      }

      const displayLabel =
        theme.fg("customMessageLabel", theme.bold("[advisor] ")) +
        theme.fg(
          "toolTitle",
          theme.bold(`${ADVISOR_MODEL_ID} (${ADVISOR_PROVIDER})`),
        );

      return new Text(displayLabel, 0, 0);
    },
    renderResult: (toolResult, options, theme, context) => {
      const state = context.state as AdvisorRenderState;
      if (state.startedAt !== undefined && options.isPartial && !state.interval) {
        state.interval = setInterval(() => context.invalidate(), 1000);
      }
      if (!options.isPartial || context.isError) {
        state.endedAt ??= Date.now();
        if (state.interval) {
          clearInterval(state.interval);
          state.interval = undefined;
        }
      }

      const output = resultText(toolResult);
      const styledOutput = output
        .split("\n")
        .map((line) => theme.fg("toolOutput", line))
        .join("\n");
      let text = output ? `\n${styledOutput}\n` : "";
      if (state.startedAt !== undefined) {
        const endTime = state.endedAt ?? Date.now();
        text += `\n${theme.fg("muted", `Took ${formatDuration(endTime - state.startedAt)}`)}`;
      }

      return new Text(text, 0, 0);
    },
    description: ADVISOR_DESCRIPTION,
    promptSnippet: ADVISOR_PROMPT_SNIPPET,
    promptGuidelines: ADVISOR_PROMPT_GUIDELINES,
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, onUpdate, ctx) {
      return executeAdvisor(ctx, pi, signal, onUpdate);
    },
  });
}

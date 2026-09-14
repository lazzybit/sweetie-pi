import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";
import {
  convertToLlm,
  getAgentDir,
  sessionEntryToContextMessages,
  SettingsManager,
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

type AdvisorSettingsFile = {
  advisor?: unknown;
};

type AdvisorConfig = {
  enabled: boolean;
  provider?: string;
  model?: string;
  effort?: ThinkingLevel;
  errorMessage?: string;
};

const THINKING_LEVELS: readonly ThinkingLevel[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

const ADVISOR_TOOL_NAME = "advisor";
const ADVISOR_DISPLAY_LABEL = "[advisor]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return (
    typeof value === "string" && THINKING_LEVELS.includes(value as ThinkingLevel)
  );
}

function loadAdvisorConfig(ctx: ExtensionContext): AdvisorConfig {
  const settingsManager = SettingsManager.create(ctx.cwd, getAgentDir(), {
    projectTrusted: ctx.isProjectTrusted(),
  });
  const globalSettings = settingsManager.getGlobalSettings() as AdvisorSettingsFile;
  const projectSettings = settingsManager.getProjectSettings() as AdvisorSettingsFile;
  const errors = settingsManager.drainErrors().map(({ scope, path, error }) => {
    const location = path ? ` (${path})` : "";
    return `Failed to load ${scope} settings${location}: ${error.message}`;
  });
  const advisorSettings = (value: unknown): Record<string, unknown> => {
    if (value === undefined) return {};
    if (!isRecord(value)) {
      errors.push("advisor must be an object.");
      return {};
    }
    return value;
  };
  const globalAdvisor = advisorSettings(globalSettings.advisor);
  const projectAdvisor = advisorSettings(projectSettings.advisor);
  const settings = { ...globalAdvisor, ...projectAdvisor };

  let enabled = false;
  if (settings.enabled !== undefined) {
    if (typeof settings.enabled === "boolean") {
      enabled = settings.enabled;
    } else {
      errors.push("advisor.enabled must be a boolean.");
    }
  }

  let provider: string | undefined;
  if (settings.provider !== undefined) {
    if (typeof settings.provider === "string" && settings.provider.length > 0) {
      provider = settings.provider;
    } else {
      errors.push("advisor.provider must be a non-empty string.");
    }
  }

  let model: string | undefined;
  if (settings.model !== undefined) {
    if (typeof settings.model === "string" && settings.model.length > 0) {
      model = settings.model;
    } else {
      errors.push("advisor.model must be a non-empty string.");
    }
  }

  let effort: ThinkingLevel | undefined;
  if (settings.effort !== undefined) {
    if (isThinkingLevel(settings.effort)) {
      effort = settings.effort;
    } else {
      errors.push(
        "advisor.effort must be one of: minimal, low, medium, high, xhigh, max.",
      );
    }
  }

  return {
    enabled,
    provider,
    model,
    effort,
    errorMessage: errors.length > 0 ? errors.join(" ") : undefined,
  };
}

const ADVISOR_UNAVAILABLE_MESSAGE = "Advisor is not available.";

function advisorDisplayName(config: AdvisorConfig): string {
  return config.model ?? "unconfigured";
}

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

function resultText<TDetails>(toolResult: AgentToolResult<TDetails>): string {
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

function buildCompletionOptions(
  api: string,
  signal: AbortSignal | undefined,
  effort: ThinkingLevel | undefined,
  sessionId: string | undefined,
): CompletionOptions {
  // Passing the pi session id keeps prompt-cache routing stable across advisor
  // calls: Responses emits prompt_cache_key plus session_id and
  // x-client-request-id affinity headers when sessionId is set.
  const base = { signal, sessionId };
  if (effort === undefined) return base;

  if (api === "openai-responses") {
    const options: OpenAIResponsesOptions = {
      ...base,
      reasoningEffort: effort,
    };
    return options;
  }

  if (api === "openai-completions") {
    const options: OpenAICompletionsOptions = {
      ...base,
      reasoningEffort: effort,
    };
    return options;
  }

  return base;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function advisorUnavailable(
  ctx: ExtensionContext,
  config: AdvisorConfig,
  reason: string,
): AgentToolResult<AdvisorDetails> {
  ctx.ui.notify(`${ADVISOR_UNAVAILABLE_MESSAGE} ${reason}`, "error");
  return result(ADVISOR_UNAVAILABLE_MESSAGE, { effort: config.effort });
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
      buildCompletionOptions(
        advisor.api,
        signal,
        effort,
        ctx.sessionManager.getSessionId(),
      ),
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

function registerAdvisorTool(
  pi: ExtensionAPI,
  config: AdvisorConfig,
): void {
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
        theme.fg("toolTitle", theme.bold(ADVISOR_TOOL_NAME)) +
        " " +
        theme.fg("accent", advisorDisplayName(config));

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
      return executeAdvisor(ctx, pi, config, signal, onUpdate);
    },
  });
}

export default function (pi: ExtensionAPI) {
  let advisorToolRegistered = false;

  pi.on("session_start", (_event, ctx) => {
    let config: AdvisorConfig;
    try {
      config = loadAdvisorConfig(ctx);
    } catch (error) {
      ctx.ui.notify(
        `${ADVISOR_UNAVAILABLE_MESSAGE} Could not load advisor settings: ${errorText(error)}`,
        "error",
      );
      return;
    }

    if (config.enabled !== true || advisorToolRegistered) return;

    advisorToolRegistered = true;
    registerAdvisorTool(pi, config);
  });
}

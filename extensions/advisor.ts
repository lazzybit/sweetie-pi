import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { convertToLlm } from "@earendil-works/pi-coding-agent";
import type {
  AssistantMessage,
  Message,
  StopReason,
  TextContent,
  ThinkingLevel,
  Usage,
} from "@earendil-works/pi-ai";
import { Type } from "typebox";

// Change these values to select the reviewer used by advisor().
const ADVISOR_PROVIDER = "deepseek";
const ADVISOR_MODEL_ID = "deepseek-v4-pro";
const ADVISOR_EFFORT: ThinkingLevel | undefined = "high";

const ADVISOR_TOOL_NAME = "advisor";
const ADVISOR_SYSTEM_PROMPT = [
  "You are the reviewer in an advisor-strategy workflow.",
  "Read the executor's complete conversation and return exactly one of:",
  "- a concrete plan,",
  "- a correction to the current approach, or",
  "- a stop signal when the executor should ask the user before continuing.",
  "Be concise, directive, and grounded in the files, tool results, and decisions in the conversation.",
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

const ADVISOR_NUDGE = "Please advise on the executor's situation above.";
const NO_MODEL_MESSAGE =
  "Advisor model is not available. Check ADVISOR_PROVIDER and ADVISOR_MODEL_ID in extensions/advisor.ts.";
const NO_API_KEY_MESSAGE = "Advisor model has no usable authentication.";
const ABORTED_MESSAGE = "Advisor call was cancelled before it completed.";
const EMPTY_RESPONSE_MESSAGE = "Advisor returned no text content.";

type CompleteSimple = typeof import("@earendil-works/pi-ai/compat").completeSimple;

type AdvisorDetails = {
  advisorModel?: string;
  effort?: ThinkingLevel;
  usage?: Usage;
  stopReason?: StopReason;
  errorMessage?: string;
};

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

function ensureUserTail(messages: Message[]): Message[] {
  if (messages.length > 0 && messages[messages.length - 1].role === "user") {
    return messages;
  }

  return [
    ...messages,
    {
      role: "user",
      content: [{ type: "text", text: ADVISOR_NUDGE }],
      timestamp: Date.now(),
    },
  ];
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

function buildAdvisorMessages(ctx: ExtensionContext, pi: ExtensionAPI): Message[] {
  const sessionContext = ctx.sessionManager.buildSessionContext();
  const branch = ensureUserTail(
    stripInflightAdvisorCall(convertToLlm(sessionContext.messages)),
  );
  const inventory = buildToolInventory(pi.getAllTools());

  return inventory ? [inventory, ...branch] : branch;
}

function getRuntimeCompleteSimple(
  modelRegistry: unknown,
): CompleteSimple | undefined {
  if (modelRegistry === null || typeof modelRegistry !== "object") {
    return undefined;
  }

  const runtime = (modelRegistry as { runtime?: unknown }).runtime;
  if (runtime === null || typeof runtime !== "object") return undefined;

  const completeSimple = (runtime as { completeSimple?: unknown }).completeSimple;
  if (typeof completeSimple !== "function") return undefined;

  return completeSimple.bind(runtime) as CompleteSimple;
}

const MODULE_NOT_FOUND_CODES = new Set([
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_MODULE_NOT_FOUND",
  "MODULE_NOT_FOUND",
]);

function isModuleNotFound(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 16; depth++) {
    if (
      typeof current === "object" &&
      MODULE_NOT_FOUND_CODES.has(
        (current as { code?: unknown }).code as string,
      )
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function loadCompleteSimple(): Promise<CompleteSimple> {
  let module: { completeSimple?: CompleteSimple };

  try {
    module = (await import("@earendil-works/pi-ai/compat")) as {
      completeSimple?: CompleteSimple;
    };
  } catch (error) {
    if (!isModuleNotFound(error)) throw error;
    module = (await import("@earendil-works/pi-ai")) as {
      completeSimple?: CompleteSimple;
    };
  }

  if (typeof module.completeSimple !== "function") {
    throw new Error(
      "pi-ai does not expose completeSimple on /compat or the package root",
    );
  }

  return module.completeSimple;
}

async function executeAdvisor(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<AdvisorDetails> | undefined,
): Promise<AgentToolResult<AdvisorDetails>> {
  const effort = ADVISOR_EFFORT;
  const advisor = ctx.modelRegistry.find(ADVISOR_PROVIDER, ADVISOR_MODEL_ID);

  if (!advisor) {
    return result(NO_MODEL_MESSAGE, { effort, errorMessage: "model not found" });
  }

  const advisorLabel = `${advisor.provider}:${advisor.id}`;
  let auth: Awaited<
    ReturnType<ExtensionContext["modelRegistry"]["getApiKeyAndHeaders"]>
  >;

  try {
    auth = await ctx.modelRegistry.getApiKeyAndHeaders(advisor);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return result(`Advisor (${advisorLabel}) is misconfigured: ${message}`, {
      advisorModel: advisorLabel,
      effort,
      errorMessage: message,
    });
  }

  if (!auth.ok) {
    return result(`Advisor (${advisorLabel}) is misconfigured: ${auth.error}`, {
      advisorModel: advisorLabel,
      effort,
      errorMessage: auth.error,
    });
  }

  const runtimeCompleteSimple = getRuntimeCompleteSimple(ctx.modelRegistry);
  if (!runtimeCompleteSimple && !auth.apiKey) {
    return result(`${NO_API_KEY_MESSAGE} (${advisorLabel})`, {
      advisorModel: advisorLabel,
      effort,
      errorMessage: `no API key for ${advisor.provider}`,
    });
  }

  if (signal?.aborted) {
    return result(ABORTED_MESSAGE, {
      advisorModel: advisorLabel,
      effort,
      stopReason: "aborted",
      errorMessage: "aborted",
    });
  }

  let messages: Message[];
  try {
    messages = buildAdvisorMessages(ctx, pi);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return result(`Advisor could not build conversation context: ${message}`, {
      advisorModel: advisorLabel,
      effort,
      errorMessage: message,
    });
  }

  onUpdate?.({
    content: [{ type: "text", text: `Consulting advisor (${advisorLabel})...` }],
    details: { advisorModel: advisorLabel, effort },
  });

  try {
    const completeSimple = runtimeCompleteSimple ?? (await loadCompleteSimple());
    const requestOptions = runtimeCompleteSimple
      ? { signal, reasoning: effort }
      : {
          apiKey: auth.apiKey,
          headers: auth.headers,
          signal,
          reasoning: effort,
        };
    const response = await completeSimple(
      advisor,
      {
        systemPrompt: ADVISOR_SYSTEM_PROMPT,
        messages,
        tools: [],
      },
      requestOptions,
    );

    if (response.stopReason === "aborted") {
      return result(ABORTED_MESSAGE, {
        advisorModel: advisorLabel,
        effort,
        usage: response.usage,
        stopReason: response.stopReason,
        errorMessage: response.errorMessage ?? "aborted",
      });
    }

    if (response.stopReason === "error") {
      const message = response.errorMessage ?? "unknown error";
      return result(`Advisor call failed: ${message}`, {
        advisorModel: advisorLabel,
        effort,
        usage: response.usage,
        stopReason: response.stopReason,
        errorMessage: message,
      });
    }

    const text = textFromResponse(response);
    if (!text) {
      return result(EMPTY_RESPONSE_MESSAGE, {
        advisorModel: advisorLabel,
        effort,
        usage: response.usage,
        stopReason: response.stopReason,
        errorMessage: "empty response",
      });
    }

    return result(text, {
      advisorModel: advisorLabel,
      effort,
      usage: response.usage,
      stopReason: response.stopReason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return result(ABORTED_MESSAGE, {
        advisorModel: advisorLabel,
        effort,
        stopReason: "aborted",
        errorMessage: message || "aborted",
      });
    }

    return result(`Advisor call threw: ${message}`, {
      advisorModel: advisorLabel,
      effort,
      errorMessage: message,
    });
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: ADVISOR_TOOL_NAME,
    label: "Advisor",
    description: ADVISOR_DESCRIPTION,
    promptSnippet: ADVISOR_PROMPT_SNIPPET,
    promptGuidelines: ADVISOR_PROMPT_GUIDELINES,
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, onUpdate, ctx) {
      return executeAdvisor(ctx, pi, signal, onUpdate);
    },
  });
}

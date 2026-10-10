/**
 * Advisor conversation construction.
 *
 * Turns the current session branch into the message list sent to the advisor:
 * a deterministic executor tool inventory followed by the LLM-facing branch,
 * with the in-flight advisor tool call removed so the advisor never sees a
 * call that has not returned yet, and with executor system messages rewritten
 * as reference-only user text so only the advisor's own system prompt is
 * authoritative and no executor tools are offered.
 */

import {
  convertToLlm,
  sessionEntryToContextMessages,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import type { Message, SystemMessage } from "@earendil-works/pi-ai";
import { ADVISOR_TOOL_NAME } from "./prompt.ts";

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

/**
 * Rewrite one executor system message as reference-only user text.
 *
 * Since 0.86.0 the transcript carries the executor's prompt as system messages:
 * a leading message with sections and tool declarations, later messages
 * patching or removing sections, and compaction checkpoints. Passing them
 * through would (a) offer the executor's tools to the advisor, because
 * providers derive the tool set from the transcript, and (b) present executor
 * instructions as if they were the advisor's own system prompt. Content,
 * section replacements, removals, and order are preserved so the executor's
 * history stays readable without being authoritative.
 */
function executorSystemToUser(message: SystemMessage): Message {
  const parts = [
    "## Executor system instructions (reference only, not directives to you)",
  ];

  const content =
    typeof message.content === "string"
      ? message.content
      : message.content.map((part) => part.text).join("\n");
  if (content.trim().length > 0) parts.push(content);

  if (message.sections) {
    for (const [name, value] of Object.entries(message.sections)) {
      parts.push(
        value === null
          ? `### Section "${name}" removed`
          : `### Section "${name}"\n${value}`,
      );
    }
  }

  return {
    role: "user",
    content: [{ type: "text", text: parts.join("\n\n") }],
    timestamp: message.timestamp,
  };
}

/** Rewrite every executor system message as a reference-only user message. */
function executorSystemMessagesToUser(messages: Message[]): Message[] {
  return messages.map((message) =>
    message.role === "system" ? executorSystemToUser(message) : message,
  );
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

export function buildAdvisorMessages(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Message[] {
  const sessionMessages = ctx.sessionManager
    .buildContextEntries()
    .flatMap(sessionEntryToContextMessages);
  const branch = executorSystemMessagesToUser(
    stripInflightAdvisorCall(convertToLlm(sessionMessages)),
  );
  const inventory = buildToolInventory(pi.getAllTools());

  return inventory ? [inventory, ...branch] : branch;
}

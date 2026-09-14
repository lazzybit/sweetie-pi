/**
 * Advisor conversation construction.
 *
 * Turns the current session branch into the message list sent to the reviewer:
 * a deterministic executor tool inventory followed by the LLM-facing branch,
 * with the in-flight advisor tool call removed so the reviewer never sees a
 * call that has not returned yet.
 */

import {
  convertToLlm,
  sessionEntryToContextMessages,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import type { Message } from "@earendil-works/pi-ai";
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
  const branch = stripInflightAdvisorCall(convertToLlm(sessionMessages));
  const inventory = buildToolInventory(pi.getAllTools());

  return inventory ? [inventory, ...branch] : branch;
}

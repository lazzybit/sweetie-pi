/**
 * Advisor TUI rendering.
 *
 * Owns the per-call render state, the elapsed-time ticker, and the text shown
 * for the tool call and its result. No model or settings logic lives here.
 */

import type {
  AgentToolResult,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { TextContent } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import type { TSchema } from "typebox";
import type { AdvisorConfig } from "./config.ts";
import type { AdvisorDetails } from "./execute.ts";
import { ADVISOR_TOOL_NAME } from "./prompt.ts";

export type AdvisorRenderState = {
  startedAt?: number;
  endedAt?: number;
  interval?: ReturnType<typeof setInterval>;
};

type AdvisorToolDefinition = ToolDefinition<
  TSchema,
  AdvisorDetails,
  AdvisorRenderState
>;

export type AdvisorRenderers = {
  renderCall: NonNullable<AdvisorToolDefinition["renderCall"]>;
  renderResult: NonNullable<AdvisorToolDefinition["renderResult"]>;
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

function advisorDisplayName(config: AdvisorConfig): string {
  return config.model ?? "unconfigured";
}

export function createAdvisorRenderers(
  getConfig: () => AdvisorConfig,
): AdvisorRenderers {
  return {
    renderCall(_args, theme, context) {
      const state = context.state;
      if (context.executionStarted && state.startedAt === undefined) {
        state.startedAt = Date.now();
        state.endedAt = undefined;
      }

      const displayLabel =
        theme.fg("toolTitle", theme.bold(ADVISOR_TOOL_NAME)) +
        " " +
        theme.fg("accent", advisorDisplayName(getConfig()));

      return new Text(displayLabel, 0, 0);
    },
    renderResult(toolResult, options, theme, context) {
      const state = context.state;
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
  };
}

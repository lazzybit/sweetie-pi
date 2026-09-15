/**
 * advisor - ask a stronger reviewer model for guidance.
 *
 * Folder-plugin entry point. Owns the extension lifecycle and tool
 * registration; config lives in config.ts, conversation building in
 * context.ts, model invocation in execute.ts, TUI rendering in render.ts, and
 * all copy in prompt.ts. The tool is registered at most once per extension
 * factory instance and only when advisor.enabled is true; the registered tool
 * captures its configuration and later session_start events keep it as is.
 * Unavailable results return a generic message while the detailed reason is
 * sent as a UI notification.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadAdvisorConfig, type AdvisorConfig } from "./config.ts";
import { errorText, executeAdvisor } from "./execute.ts";
import {
  ADVISOR_DESCRIPTION,
  ADVISOR_DISPLAY_LABEL,
  ADVISOR_TOOL_NAME,
  ADVISOR_UNAVAILABLE_MESSAGE,
} from "./prompt.ts";
import { createAdvisorRenderers } from "./render.ts";

function registerAdvisorTool(pi: ExtensionAPI, config: AdvisorConfig): void {
  pi.registerTool({
    name: ADVISOR_TOOL_NAME,
    label: ADVISOR_DISPLAY_LABEL,
    ...createAdvisorRenderers(config),
    description: ADVISOR_DESCRIPTION,
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

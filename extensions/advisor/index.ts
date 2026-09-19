/**
 * advisor - ask a stronger reviewer model for guidance.
 *
 * Folder-plugin entry point. Owns the extension lifecycle, tool registration,
 * and the `/settings-advisor` settings command; config lives in config.ts,
 * settings UI in command.ts, conversation building in context.ts, model
 * invocation in execute.ts, TUI rendering in render.ts, and all copy in
 * prompt.ts.
 *
 * The tool is registered once and its active state follows `advisor.enabled`
 * via pi.setActiveTools(), so toggling from `/settings-advisor` takes effect
 * without a reload. Rendering and execution read the latest config, which the
 * settings command updates after each change.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { registerAdvisorCommand } from "./command.ts";
import {
  loadAdvisorConfig,
  updateAdvisorSettings,
  type AdvisorConfig,
} from "./config.ts";
import { errorText, executeAdvisor } from "./execute.ts";
import {
  ADVISOR_DESCRIPTION,
  ADVISOR_DISPLAY_LABEL,
  ADVISOR_TOOL_NAME,
  ADVISOR_UNAVAILABLE_MESSAGE,
} from "./prompt.ts";
import { createAdvisorRenderers } from "./render.ts";

export default function (pi: ExtensionAPI) {
  let advisorToolRegistered = false;
  let config: AdvisorConfig = { enabled: false };

  const syncAdvisorTool = (): void => {
    const active = pi
      .getActiveTools()
      .filter((name) => name !== ADVISOR_TOOL_NAME);
    pi.setActiveTools(
      config.enabled === true ? [...active, ADVISOR_TOOL_NAME] : active,
    );
  };

  const applyConfig = (next: AdvisorConfig): void => {
    config = next;
    syncAdvisorTool();
  };

  // Settings were just written to disk; re-read them so validation errors and
  // project overrides are reflected instead of guessed.
  const reloadConfig = (ctx: ExtensionContext): void => {
    try {
      applyConfig(loadAdvisorConfig(ctx));
    } catch (error) {
      ctx.ui.notify(
        `${ADVISOR_UNAVAILABLE_MESSAGE} Could not reload advisor settings: ${errorText(error)}`,
        "error",
      );
    }
  };

  const registerAdvisorTool = (): void => {
    if (advisorToolRegistered) return;
    advisorToolRegistered = true;
    pi.registerTool({
      name: ADVISOR_TOOL_NAME,
      label: ADVISOR_DISPLAY_LABEL,
      ...createAdvisorRenderers(() => config),
      description: ADVISOR_DESCRIPTION,
      parameters: Type.Object({}),
      async execute(_toolCallId, _params, signal, onUpdate, ctx) {
        return executeAdvisor(ctx, pi, config, signal, onUpdate);
      },
    });
  };

  pi.on("session_start", (_event, ctx) => {
    let loaded: AdvisorConfig;
    try {
      loaded = loadAdvisorConfig(ctx);
    } catch (error) {
      ctx.ui.notify(
        `${ADVISOR_UNAVAILABLE_MESSAGE} Could not load advisor settings: ${errorText(error)}`,
        "error",
      );
      return;
    }

    registerAdvisorTool();
    applyConfig(loaded);
  });

  registerAdvisorCommand(pi, {
    getConfig: () => config,
    setEnabled: (ctx, enabled) => {
      updateAdvisorSettings({ enabled });
      reloadConfig(ctx);
    },
    setModel: (ctx, provider, model) => {
      updateAdvisorSettings({ provider, model });
      reloadConfig(ctx);
    },
    setThinkingLevel: (ctx, level) => {
      updateAdvisorSettings({ thinkingLevel: level });
      reloadConfig(ctx);
    },
  });
}

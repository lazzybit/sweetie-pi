/**
 * Advisor settings loading and validation.
 *
 * Reads the advisor block from global and project settings, merges project
 * over global, and reports invalid fields as one combined message. Nothing
 * here talks to a model or the UI.
 */

import {
  getAgentDir,
  SettingsManager,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";

type AdvisorSettingsFile = {
  advisor?: unknown;
};

export type AdvisorConfig = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return (
    typeof value === "string" && THINKING_LEVELS.includes(value as ThinkingLevel)
  );
}

export function loadAdvisorConfig(ctx: ExtensionContext): AdvisorConfig {
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

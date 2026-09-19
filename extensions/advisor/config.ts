/**
 * Advisor settings loading, validation, and persistence.
 *
 * Reads the advisor block from global and project settings, merges project
 * over global, and reports invalid fields as one combined message. Updates are
 * written back to the global settings file, merging into whatever is already
 * there so unrelated settings survive. Nothing here talks to a model or the
 * UI.
 */

import {
  getAgentDir,
  SettingsManager,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type AdvisorSettingsFile = {
  advisor?: unknown;
};

export type AdvisorConfig = {
  enabled: boolean;
  provider?: string;
  model?: string;
  effort?: ModelThinkingLevel;
  errorMessage?: string;
};

export type AdvisorSettingsUpdate = {
  enabled?: boolean;
  provider?: string;
  model?: string;
  thinkingLevel?: ModelThinkingLevel;
};

const THINKING_LEVELS: readonly ModelThinkingLevel[] = [
  "off",
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

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Persist advisor fields to the global settings file, merging into whatever is
 * already there. The file is written in place so a symlinked settings.json
 * keeps pointing at its target. Throws when the file cannot be parsed, so the
 * caller can surface the problem instead of clobbering the file.
 */
export function updateAdvisorSettings(update: AdvisorSettingsUpdate): void {
  const settingsPath = join(getAgentDir(), "settings.json");
  let settings: Record<string, unknown> = {};
  let raw: string | undefined;
  try {
    raw = readFileSync(settingsPath, "utf-8");
  } catch {
    raw = undefined;
  }
  if (raw !== undefined) {
    const parsed: unknown = JSON.parse(stripBom(raw));
    if (!isRecord(parsed)) {
      throw new Error("settings.json must contain a JSON object.");
    }
    settings = parsed;
  }

  const advisor = isRecord(settings.advisor) ? settings.advisor : {};
  settings.advisor = { ...advisor, ...update };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

function isThinkingLevel(value: unknown): value is ModelThinkingLevel {
  return (
    typeof value === "string" &&
    THINKING_LEVELS.includes(value as ModelThinkingLevel)
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

  let effort: ModelThinkingLevel | undefined;
  if (settings.thinkingLevel !== undefined) {
    if (isThinkingLevel(settings.thinkingLevel)) {
      effort = settings.thinkingLevel;
    } else {
      errors.push(
        "advisor.thinkingLevel must be one of: off, minimal, low, medium, high, xhigh, max.",
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

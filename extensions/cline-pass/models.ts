/**
 * ClinePass model catalog and thinking-level mappings.
 *
 * Model IDs and pricing are adapted from `pi-clinepass-provider` by Huynh Duc
 * Dung (MIT License, https://github.com/jellydn/pi-clinepass-provider) and the
 * ClinePass reference table at
 * https://docs.cline.bot/getting-started/clinepass. Reasoning-effort maps are
 * corrected against vendor docs (Z.AI, Moonshot, DeepSeek, Qwen) and
 * https://models.dev/providers/cline-pass, the source Cline generates its
 * live catalog from.
 *
 * The endpoint speaks OpenAI Chat Completions, so pi's built-in
 * `openai-completions` implementation handles SSE parsing, tool calls, and
 * usage accounting. The only compatibility override ClinePass needs is
 * `supportsDeveloperRole: false`: it accepts classic roles only, while pi-ai
 * defaults reasoning models to the `developer` role.
 *
 * Reference prices are estimates for usage tracking, not billing. ClinePass is
 * a flat subscription.
 */

import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/** Cline's OpenAI-compatible API root (chat completions lives at `<base>/chat/completions`). */
export const CLINEPASS_BASE_URL = "https://api.cline.bot/api/v1";

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

/**
 * Maps every pi thinking level to a provider-specific `reasoning_effort`
 * value, or `null` when the level is unsupported. Levels are declared
 * explicitly so pi never invents a default for an unsupported tier.
 */
export type ThinkingLevelMap = Record<ThinkingLevel, string | null>;

/** pi-ai openai-completions compatibility overrides for ClinePass. */
const CLINEPASS_COMPAT = {
  supportsDeveloperRole: false,
} as const;

/**
 * Curated ClinePass coding models.
 *
 * `id` is the value Cline expects in the `model` field (the `cline-pass/`
 * slug). All models are text-only through this subscription.
 *
 * Reasoning maps follow vendor docs (Z.AI, Moonshot, DeepSeek, Qwen) and
 * models.dev, which Cline itself uses to generate its live catalog, plus the
 * values Cline's client actually puts on the wire: effort "max" is sent as
 * "xhigh" (sdk/packages/llms/src/providers/routing/portable-reasoning.ts), and
 * a reasoning toggle that is merely "on" is sent as "medium". Qwen3.7 Max/Plus,
 * MiMo-V2.5/Pro, and MiniMax M3 are `toggle` models, so every "on" level sends
 * "medium".
 */
export const CLINEPASS_MODELS: ProviderModelConfig[] = [
  {
    id: "cline-pass/glm-5.3",
    name: "GLM-5.3 (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    // GLM-5.3 always reasons; enum is low/high/max with no "medium". Cline
    // sends "max" as "xhigh" on the wire.
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: "xhigh",
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/glm-5.3-flash",
    name: "GLM-5.3-Flash (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.15, output: 0.5, cacheRead: 0.03, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    // Same always-on low/high/max enum as GLM-5.3; Cline sends "max" as "xhigh".
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: "xhigh",
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/kimi-k3",
    name: "Kimi K3 (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    // Moonshot: low/high/max (default max), thinking always on, so only
    // off/minimal/medium are unsupported. Cline sends "max" as "xhigh".
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: "xhigh",
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/muse-spark-1.3-contributor",
    name: "Muse Spark 1.3 Contributor (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 943_718,
    // Always reasons; Meta's effort enum maps 1:1 to pi's levels.
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/deepseek-v4-pro",
    name: "DeepSeek V4 Pro (Cline Pass)",
    reasoning: true,
    input: ["text"],
    // ClinePass reference pricing (peak): $1.32 / $3.96 / $0.044 per 1M
    // tokens; off-peak is half. https://docs.cline.bot/getting-started/clinepass
    cost: { input: 1.32, output: 3.96, cacheRead: 0.044, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    // DeepSeek: "none" disables thinking; effort is high/max, and Cline sends
    // "max" as "xhigh".
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: "xhigh",
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    // DeepSeek: "none" disables thinking; effort is low/high/max, and Cline
    // sends "max" as "xhigh".
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: "xhigh",
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/mimo-v2.5",
    name: "MiMo-V2.5 (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
    contextWindow: 262_144,
    maxTokens: 131_072,
    // models.dev: toggle only (no effort tiers); Cline sends "medium" when on.
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "medium",
      medium: "medium",
      high: "medium",
      xhigh: null,
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/mimo-v2.5-pro",
    name: "MiMo-V2.5-Pro (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 1.74, output: 3.48, cacheRead: 0.0145, cacheWrite: 0 },
    contextWindow: 262_144,
    maxTokens: 131_072,
    // models.dev: toggle only (no effort tiers); Cline sends "medium" when on.
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "medium",
      medium: "medium",
      high: "medium",
      xhigh: null,
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/minimax-m3",
    name: "MiniMax M3 (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    // models.dev: toggle only (no effort tiers); Cline sends "medium" when on.
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "medium",
      medium: "medium",
      high: "medium",
      xhigh: null,
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/qwen3.7-max",
    name: "Qwen3.7 Max (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 3.125 },
    contextWindow: 262_144,
    maxTokens: 131_072,
    // models.dev: toggle only (no effort tiers); Cline sends "medium" when on.
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "medium",
      medium: "medium",
      high: "medium",
      xhigh: null,
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/qwen3.7-plus",
    name: "Qwen3.7 Plus (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.4, output: 1.6, cacheRead: 0.04, cacheWrite: 0.5 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    // models.dev: toggle only (no effort tiers); Cline sends "medium" when on.
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "medium",
      medium: "medium",
      high: "medium",
      xhigh: null,
    },
    compat: CLINEPASS_COMPAT,
  },
  {
    id: "cline-pass/qwen3.8-max",
    name: "Qwen3.8 Max (Cline Pass)",
    reasoning: true,
    input: ["text"],
    cost: { input: 2, output: 6, cacheRead: 0.25, cacheWrite: 2.5 },
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    // Qwen3.8: effort enum is low/medium/xhigh; "none" disables thinking.
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: null,
      xhigh: "xhigh",
    },
    compat: CLINEPASS_COMPAT,
  },
];

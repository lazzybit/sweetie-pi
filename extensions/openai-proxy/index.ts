/**
 * Generic openai-compatible Responses API provider for pi.
 *
 * The API base URL is defined in openai-proxy.const.ts. The committed default
 * is an intentionally invalid placeholder; change it locally for the endpoint.
 * pi appends /models for discovery and /responses for inference.
 *
 * Auth: pi's built-in /login flow. Run `/login openai-proxy` in interactive
 * mode and enter your API key. pi stores and resolves the credential itself
 * (auth.json); this provider does NOT use environment variables for auth.
 *
 * Models:
 *   Registers the built-in GPT-5.6 family (luna / sol / terra) and GPT-6
 *   Astra with the exact parameters from pi's OpenAI catalog. On startup,
 *   GET /models is probed and supported GPT-5.6 variants plus GPT-6 Astra
 *   are registered, so new GPT-5.6 variants served by the endpoint are
 *   picked up automatically.
 */

import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { OPENAI_PROXY_BASE_URL } from "./openai-proxy.const.ts";

const OPENAI_PROVIDER_ID = "openai-proxy";

// Model parameters copied from pi's built-in OpenAI catalog
// (packages/ai/src/providers/data/openai.json).
const BUILTIN_MODELS: Record<string, ProviderModelConfig> = {
  "gpt-5.6-luna": {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.2,
      output: 1.2,
      cacheRead: 0.02,
      cacheWrite: 0.25,
      tiers: [
        { inputTokensAbove: 272000, input: 0.4, output: 1.8, cacheRead: 0.04, cacheWrite: 0.5 },
      ],
    },
    contextWindow: 272000,
    maxTokens: 128000,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    compat: {
      supportsStrictMode: true,
      supportsOpenAIGrammarTools: true,
      supportsAdditionalTools: true,
      supportsToolSearch: true,
    },
  },
  "gpt-5.6-sol": {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 5,
      output: 30,
      cacheRead: 0.5,
      cacheWrite: 6.25,
      tiers: [
        { inputTokensAbove: 272000, input: 10, output: 45, cacheRead: 1, cacheWrite: 12.5 },
      ],
    },
    contextWindow: 272000,
    maxTokens: 128000,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    compat: {
      supportsStrictMode: true,
      supportsOpenAIGrammarTools: true,
      supportsAdditionalTools: true,
      supportsToolSearch: true,
    },
  },
  "gpt-5.6-terra": {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 2,
      output: 12,
      cacheRead: 0.2,
      cacheWrite: 2.5,
      tiers: [
        { inputTokensAbove: 272000, input: 4, output: 18, cacheRead: 0.4, cacheWrite: 5 },
      ],
    },
    contextWindow: 272000,
    maxTokens: 128000,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    compat: {
      supportsStrictMode: true,
      supportsOpenAIGrammarTools: true,
      supportsAdditionalTools: true,
      supportsToolSearch: true,
    },
  },
  "gpt-6-astra": {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 10,
      output: 50,
      cacheRead: 1,
      cacheWrite: 12.5,
      tiers: [
        { inputTokensAbove: 272000, input: 20, output: 75, cacheRead: 2, cacheWrite: 25 },
      ],
    },
    contextWindow: 272000,
    maxTokens: 128000,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: null,
    },
    compat: {
      supportsStrictMode: true,
      supportsOpenAIGrammarTools: true,
      supportsAdditionalTools: true,
      supportsToolSearch: true,
    },
  },
};

const FALLBACK_MODELS: ProviderModelConfig[] = Object.values(BUILTIN_MODELS);

// Defaults for gpt-5.6 variants discovered at runtime but absent from the built-in catalog.
function genericGpt56Model(id: string, name?: string): ProviderModelConfig {
  return {
    id,
    name: name ?? id,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    compat: {
      supportsStrictMode: true,
      supportsOpenAIGrammarTools: true,
      supportsAdditionalTools: true,
      supportsToolSearch: true,
    },
  };
}

export default async function (pi: ExtensionAPI) {
  const baseUrl = OPENAI_PROXY_BASE_URL.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error(`Missing OPENAI_PROXY_BASE_URL; provider "${OPENAI_PROVIDER_ID}" was not registered.`);
  }

  let models = FALLBACK_MODELS;

  // Probe the openai-compatible /models endpoint and register supported
  // GPT-5.6 variants plus GPT-6 Astra. No credentials are attached; on
  // failure (auth required, unreachable) fall back to the built-in models.
  try {
    const response = await fetch(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        data?: Array<{ id: string; name?: string }>;
      };

      const discovered = (payload.data ?? [])
        .map((m) => m.id)
        .filter((id) => id.startsWith("gpt-5.6") || id === "gpt-6-astra");

      if (discovered.length > 0) {
        models = discovered.map((id) => BUILTIN_MODELS[id] ?? genericGpt56Model(id));
      }
    }
  } catch {
    // Endpoint unreachable — keep built-in models.
  }

  // No `apiKey` is configured: pi supplies its built-in API-key auth method
  // (/login openai-proxy) and resolves the key from stored credentials at
  // request time.
  pi.registerProvider(OPENAI_PROVIDER_ID, {
    name: "openai-compatible proxy",
    baseUrl,
    api: "openai-responses",
    models,
  });
}

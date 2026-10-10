/**
 * Channel preference for ClinePass requests.
 *
 * Cline's gateway chooses an upstream provider ("channel") behind each model.
 * A client can steer that choice by putting a routing preference on the
 * request body. Which field the gateway reads depends on the pipeline serving
 * the model:
 *
 *   - planner pipeline: `providerOptions.gateway.only = ["<slug>"]`
 *   - direct pipeline:  `provider.only = ["<slug>"]`
 *
 * Both are written because the pipeline is decided by the gateway, not the
 * client, and whichever pipeline is active ignores the other field. This
 * mirrors `InjectPrefs` in
 * https://github.com/Hxjcc/cline-pass-switcher-go.
 *
 * Caveat: Cline's gateway may ignore a preference for some models and route
 * on its own (the switcher project reports this for the DeepSeek series). The
 * field is still sent; the gateway decides whether it is honoured.
 */

/** Model ids with this prefix prefer the DeepSeek channel. */
const DEEPSEEK_MODEL_PREFIX = "cline-pass/deepseek";

/** Channel slug the Cline gateway uses for DeepSeek. */
const DEEPSEEK_CHANNEL = "deepseek";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
}

/**
 * Pins DeepSeek models to the DeepSeek channel, leaving every other request
 * untouched. Returns the payload unchanged when no preference applies.
 */
export function preferDeepSeekChannel(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }
  const body = payload as JsonRecord;
  if (typeof body.model !== "string" || !body.model.startsWith(DEEPSEEK_MODEL_PREFIX)) {
    return payload;
  }
  const providerOptions = asRecord(body.providerOptions);
  const gateway = asRecord(providerOptions.gateway);
  return {
    ...body,
    providerOptions: {
      ...providerOptions,
      gateway: { ...gateway, only: [DEEPSEEK_CHANNEL] },
    },
    provider: { ...asRecord(body.provider), only: [DEEPSEEK_CHANNEL] },
  };
}

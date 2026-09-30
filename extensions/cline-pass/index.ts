/**
 * ClinePass Provider Extension (API key only)
 *
 * Registers Cline's ClinePass subscription as a pi provider using only an API
 * key. ClinePass exposes an OpenAI-compatible Chat Completions API, so pi's
 * built-in `openai-completions` streaming handles SSE, tool calls, and usage;
 * this extension only supplies the endpoint, the model catalog, and the key.
 *
 * Authentication (API key only, no OAuth):
 *   Run `/login cline-pass` and paste a static API key.
 *
 * Create a key at https://app.cline.bot → Settings → API Keys. See
 * https://docs.cline.bot/getting-started/clinepass for the subscription.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CLINEPASS_BASE_URL, CLINEPASS_MODELS } from "./models.ts";

const PROVIDER_NAME = "cline-pass";

export default function (pi: ExtensionAPI) {
  pi.registerProvider(PROVIDER_NAME, {
    name: "Cline Pass",
    baseUrl: CLINEPASS_BASE_URL,
    api: "openai-completions",
    // No `apiKey` and no `oauth`: pi registers only the default API-key login
    // method, so the key comes exclusively from `/login`.
    authHeader: true,
    models: CLINEPASS_MODELS,
  });
}

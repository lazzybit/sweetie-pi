import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { OPENAI_PROXY_BASE_URL } from "./config.ts";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("openai", { baseUrl: OPENAI_PROXY_BASE_URL });
}

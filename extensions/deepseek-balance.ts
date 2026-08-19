import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("deepseek-balance", {
    description: "Check DeepSeek API account balance",
    handler: async (_args, ctx) => {
      try {
        const authResult = await ctx.modelRegistry.getProviderAuth("deepseek");
        const apiKey = authResult?.auth?.apiKey;

        if (!apiKey) {
          ctx.ui.notify(
            "DeepSeek API key not found. Use /login deepseek or configure auth.json.",
            "error",
          );
          return;
        }

        const response = await fetch(DEEPSEEK_BALANCE_URL, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`API error (${response.status}): ${body}`);
        }

        const data = await response.json();
        const infos: Array<{ currency: string; total_balance: string }> = data.balance_infos ?? [];

        if (infos.length === 0) {
          ctx.ui.notify("DeepSeek Balance: no balance info", "warning");
          return;
        }

        const parts = infos.map((info) => {
          const symbol = info.currency === "USD" ? "$" : "¥";
          return `${symbol}${info.total_balance} ${info.currency}`;
        });

        ctx.ui.notify(`DeepSeek Balance: ${parts.join(", ")}`, "info");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`DeepSeek Balance: ${message}`, "error");
      }
    },
  });
}

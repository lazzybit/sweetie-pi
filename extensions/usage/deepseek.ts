/**
 * usage/deepseek.ts - DeepSeek account balance lookup for the usage report.
 *
 * Never throws: the caller renders whatever short status string comes back so a
 * missing key or a network failure does not break the rest of the report.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const TIMEOUT_MS = 5000;

interface BalanceInfo {
	currency?: string;
	total_balance?: string;
}

interface BalanceResponse {
	balance_infos?: BalanceInfo[];
}

export async function fetchDeepSeekBalance(ctx: ExtensionContext): Promise<string> {
	try {
		const authResult = await ctx.modelRegistry.getProviderAuth("deepseek");
		const apiKey = authResult?.auth?.apiKey;
		if (!apiKey) return "not configured";

		const response = await fetch(DEEPSEEK_BALANCE_URL, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) return `error (${response.status})`;

		const data = (await response.json()) as BalanceResponse;
		const infos = data.balance_infos ?? [];
		if (infos.length === 0) return "no balance info";

		return infos
			.map((info) => {
				const symbol = info.currency === "USD" ? "$" : "¥";
				return `${symbol}${info.total_balance ?? "?"} ${info.currency ?? ""}`.trim();
			})
			.join(", ");
	} catch {
		return "unavailable";
	}
}

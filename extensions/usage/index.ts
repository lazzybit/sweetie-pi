/**
 * usage - `/usage` prints cumulative conversation stats.
 *
 * Unlike the footer's `CH:` (which reports the cache hit rate of the latest
 * assistant turn only), this aggregates every LLM call on the active branch.
 * It also appends the DeepSeek account balance, folding in what used to be the
 * separate `/deepseek-balance` command.
 *
 * Output is a plain `Label: value` list via a single `ctx.ui.notify()`.
 * Labels are capitalized, there are no section headers, and blank lines
 * separate logical blocks. The DeepSeek balance is fetched after the stats are
 * already on screen and folded into an in-place notify update, so a slow or
 * failing API never delays the rest of the report.
 *
 *   Token Read       - everything the model read (prompt tokens, cached or not)
 *   Token Cache Read - the cached share of those reads, with cumulative hit %
 *   Token Write      - the model's output tokens
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { fetchDeepSeekBalance } from "./deepseek.ts";
import { computeDashboardStats, type DashboardStats } from "./stats.ts";

const BAR_WIDTH = 10;
const BALANCE_PENDING = "[checking]";

const numberFormat = new Intl.NumberFormat("en-US");

function formatCount(value: number): string {
	return numberFormat.format(Math.round(value));
}

function formatPercent(ratio: number): string {
	return `${(ratio * 100).toFixed(1)}%`;
}

/** Unicode meter: filled for the ratio, empty for the remainder. */
function renderBar(ratio: number, width: number): string {
	const clamped = Math.max(0, Math.min(1, ratio));
	const filled = Math.round(clamped * width);
	return "█".repeat(filled) + "░".repeat(width - filled);
}

function contextEntry(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	if (!usage || usage.percent === null) return "Context: --";
	return `Context: ${usage.percent.toFixed(1)}% ${renderBar(usage.percent / 100, BAR_WIDTH)}`;
}

export function buildUsageReport(
	stats: DashboardStats,
	ctx: ExtensionContext,
	balance?: string,
): string {
	const cacheRead = formatCount(stats.totals.cacheRead);
	const cacheSuffix = stats.cacheRate === undefined ? "" : ` (${formatPercent(stats.cacheRate)})`;

	const body = [
		`Token Read: ${formatCount(stats.promptTokens)}`,
		`Token Cache Read: ${cacheRead}${cacheSuffix}`,
		`Token Write: ${formatCount(stats.completionTokens)}`,
		"",
		contextEntry(ctx),
		"",
		`Assistant Turns: ${stats.assistantTurns}`,
		`User Turns: ${stats.userMessages}`,
		`Tool Calls: ${stats.toolCalls}`,
	];
	if (balance !== undefined) {
		body.push("", `DeepSeek Balance: ${balance}`);
	}

	return body.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description: "Show cumulative conversation usage (tokens, cache rate, context)",
		handler: async (_args, ctx) => {
			const stats = computeDashboardStats(ctx.sessionManager.getBranch());
			// Show stats immediately with a placeholder; the balance arrives in a
			// follow-up notify that replaces this status block in place.
			ctx.ui.notify(buildUsageReport(stats, ctx, BALANCE_PENDING), "info");
			const balance = await fetchDeepSeekBalance(ctx);
			ctx.ui.notify(buildUsageReport(stats, ctx, balance), "info");
		},
	});
}

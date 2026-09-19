/**
 * usage - `/usage` prints cumulative conversation stats.
 *
 * Unlike the footer's `CH:` (which reports the cache hit rate of the latest
 * assistant turn only), this aggregates every LLM call on the active branch.
 *
 * Output is a plain `Label: value` list via `ctx.ui.notify()`, matching the
 * deepseek-balance style. Labels are capitalized, there are no section headers,
 * and blank lines separate logical blocks.
 *
 *   Token Read       - everything the model read (prompt tokens, cached or not)
 *   Token Cache Read - the cached share of those reads, with cumulative hit %
 *   Token Write      - the model's output tokens
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { computeDashboardStats, type DashboardStats } from "./stats.ts";

const BAR_WIDTH = 10;

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

export function buildUsageReport(stats: DashboardStats, ctx: ExtensionContext): string {
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

	return body.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description: "Show cumulative conversation usage (tokens, cache rate, context)",
		handler: async (_args, ctx) => {
			const stats = computeDashboardStats(ctx.sessionManager.getBranch());
			ctx.ui.notify(buildUsageReport(stats, ctx), "info");
		},
	});
}

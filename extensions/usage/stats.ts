/**
 * usage/stats.ts - cumulative usage accounting for the active branch.
 *
 * Reads the branch (root -> current leaf) instead of every entry in the session
 * file, so a forked or re-navigated session only counts the LLM calls that
 * actually happened on the active path.
 *
 * Every call is counted, not just visible assistant turns:
 * - assistant messages (the conversation itself)
 * - compaction and branch summaries (summarization overhead)
 */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

/** Token and cost totals for one or more LLM calls. */
export interface UsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	reasoning: number;
	cost: number;
	calls: number;
}

export interface ModelUsage {
	key: string;
	totals: UsageTotals;
}

export interface DashboardStats {
	/** Every LLM call on the branch: assistant turns plus summaries. */
	totals: UsageTotals;
	/** Assistant turns only. */
	assistant: UsageTotals;
	/** Compaction / branch-summary calls only. */
	summaries: UsageTotals;
	byModel: ModelUsage[];
	assistantTurns: number;
	userMessages: number;
	toolCalls: number;
	compactions: number;
	branchSummaries: number;
	/** input + cacheRead + cacheWrite, i.e. everything the model read. */
	promptTokens: number;
	/** Assistant output tokens. */
	completionTokens: number;
	/** promptTokens + completionTokens. */
	totalTokens: number;
	/** cacheRead / promptTokens, or undefined when no prompt tokens were seen. */
	cacheRate: number | undefined;
}

/** Bucket key for summarization calls, which carry no provider/model. */
export const SUMMARY_MODEL_KEY = "(summaries)";

/** Structural view of a provider usage record; avoids importing pi-ai types. */
interface UsageLike {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	reasoning?: number;
	cost?: { total?: number };
}

interface MessageLike {
	role?: string;
	provider?: string;
	model?: string;
	usage?: UsageLike;
	content?: unknown;
}

export function createUsageTotals(): UsageTotals {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		reasoning: 0,
		cost: 0,
		calls: 0,
	};
}

export function addUsage(totals: UsageTotals, usage: UsageLike | undefined): void {
	if (!usage) return;
	totals.input += usage.input ?? 0;
	totals.output += usage.output ?? 0;
	totals.cacheRead += usage.cacheRead ?? 0;
	totals.cacheWrite += usage.cacheWrite ?? 0;
	totals.reasoning += usage.reasoning ?? 0;
	totals.cost += usage.cost?.total ?? 0;
	totals.calls += 1;
}

export function getPromptTokens(totals: UsageTotals): number {
	return totals.input + totals.cacheRead + totals.cacheWrite;
}

export function getTotalTokens(totals: UsageTotals): number {
	return getPromptTokens(totals) + totals.output;
}

/** Cumulative cache hit rate: cacheRead / (input + cacheRead + cacheWrite). */
export function getCacheHitRate(totals: UsageTotals): number | undefined {
	const prompt = getPromptTokens(totals);
	return prompt > 0 ? totals.cacheRead / prompt : undefined;
}

function countToolCalls(content: unknown): number {
	if (!Array.isArray(content)) return 0;
	let count = 0;
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		if ((block as { type?: string }).type === "toolCall") count += 1;
	}
	return count;
}

function modelKey(message: MessageLike): string {
	if (message.provider && message.model) {
		return `${message.provider}/${message.model}`;
	}
	return message.model ?? "unknown model";
}

export function computeDashboardStats(entries: SessionEntry[]): DashboardStats {
	const totals = createUsageTotals();
	const assistant = createUsageTotals();
	const summaries = createUsageTotals();
	const byModel = new Map<string, UsageTotals>();

	let assistantTurns = 0;
	let userMessages = 0;
	let toolCalls = 0;
	let compactions = 0;
	let branchSummaries = 0;

	const bucket = (key: string): UsageTotals => {
		let modelTotals = byModel.get(key);
		if (!modelTotals) {
			modelTotals = createUsageTotals();
			byModel.set(key, modelTotals);
		}
		return modelTotals;
	};

	for (const entry of entries) {
		if (entry.type === "compaction" || entry.type === "branch_summary") {
			if (entry.type === "compaction") compactions += 1;
			else branchSummaries += 1;
			addUsage(summaries, entry.usage);
			addUsage(totals, entry.usage);
			addUsage(bucket(SUMMARY_MODEL_KEY), entry.usage);
			continue;
		}

		if (entry.type !== "message") continue;

		const message = entry.message as unknown as MessageLike;
		if (message.role === "user") {
			userMessages += 1;
			continue;
		}
		if (message.role !== "assistant") continue;

		assistantTurns += 1;
		toolCalls += countToolCalls(message.content);
		addUsage(assistant, message.usage);
		addUsage(totals, message.usage);
		addUsage(bucket(modelKey(message)), message.usage);
	}

	const models = [...byModel.entries()]
		.map(([key, modelTotals]) => ({ key, totals: modelTotals }))
		// Summarization entries may carry no usage; drop empty buckets.
		.filter((model) => model.totals.calls > 0)
		.sort((a, b) => getTotalTokens(b.totals) - getTotalTokens(a.totals));

	return {
		totals,
		assistant,
		summaries,
		byModel: models,
		assistantTurns,
		userMessages,
		toolCalls,
		compactions,
		branchSummaries,
		promptTokens: getPromptTokens(totals),
		completionTokens: totals.output,
		totalTokens: getTotalTokens(totals),
		cacheRate: getCacheHitRate(totals),
	};
}

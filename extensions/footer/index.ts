/**
 * footer - minimal single-line footer.
 *
 * Layout:
 *   {model} ({thinking})          CTX:{context%}．CH:{cache%}
 *
 * Two states, like the built-in footer:
 * - No assistant message yet: model label only, no stats.
 * - After the first reply: right-aligned context usage and cache hit rate.
 *
 * No provider, cwd, token totals, cost, window size, or extra status rows.
 * Unknown context usage and cache rate render as `CTX:--%` / `CH:--%` rather than 0.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const UNKNOWN_CONTEXT = "CTX:--%";
const UNKNOWN_CACHE = "CH:--%";

function modelLabel(ctx: ExtensionContext): string {
	const model = ctx.model;
	if (!model) {
		return "no-model";
	}
	if (!model.reasoning) {
		return model.id;
	}
	return `${model.id} (${ctx.thinkingLevel ?? "off"})`;
}

/** Latest assistant on the active branch: whether one exists and its cache hit rate. */
function conversationStats(ctx: ExtensionContext): {
	hasAssistant: boolean;
	cachePercent: number | undefined;
} {
	const branch = ctx.sessionManager.getBranch();
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type !== "message" || entry.message.role !== "assistant") {
			continue;
		}
		const usage = entry.message.usage;
		const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
		return {
			hasAssistant: true,
			cachePercent: promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : undefined,
		};
	}
	return { hasAssistant: false, cachePercent: undefined };
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") {
			return;
		}

		ctx.ui.setFooter((_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				const modelPlain = modelLabel(ctx);
				const modelStyled = theme.fg("dim", modelPlain);
				const modelWidth = visibleWidth(modelPlain);
				const { hasAssistant, cachePercent } = conversationStats(ctx);

				// Fresh session: model label only on the left until the first reply arrives.
				if (!hasAssistant) {
					return [truncateToWidth(modelStyled, width, "…")];
				}

				const usage = ctx.getContextUsage();
				const percent = usage?.percent ?? null;

				let contextText: string;
				let contextStyled: string;
				if (percent === null) {
					contextText = UNKNOWN_CONTEXT;
					contextStyled = theme.fg("dim", contextText);
				} else {
					contextText = `CTX:${percent.toFixed(1)}%`;
					contextStyled =
						percent > 90
							? theme.fg("error", contextText)
							: percent > 70
								? theme.fg("warning", contextText)
								: theme.fg("dim", contextText);
				}

				const cacheText =
					cachePercent === undefined ? UNKNOWN_CACHE : `CH:${cachePercent.toFixed(1)}%`;

				const statsPlain = `${contextText}．${cacheText}`;
				const statsStyled = `${contextStyled}${theme.fg("dim", `．${cacheText}`)}`;
				const statsWidth = visibleWidth(statsPlain);

				// Fits: model left, stats right-aligned.
				if (modelWidth + 1 + statsWidth <= width) {
					const padding = width - modelWidth - statsWidth;
					return [`${modelStyled}${" ".repeat(padding)}${statsStyled}`];
				}

				// Too narrow: keep the stats, truncate the model first.
				const maxModelWidth = width - statsWidth - 1;
				if (maxModelWidth >= 1) {
					const modelText = truncateToWidth(modelStyled, maxModelWidth, "…");
					const padding = width - visibleWidth(modelText) - statsWidth;
					return [`${modelText}${" ".repeat(padding)}${statsStyled}`];
				}

				// Extremely narrow: stats only.
				return [truncateToWidth(statsStyled, width, "…")];
			},
		}));
	});
}

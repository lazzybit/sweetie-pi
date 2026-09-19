/**
 * Advisor instructions and user-facing copy for the advisor tool.
 *
 * Kept separate from behavior so the prompt and the diagnostics shown in the
 * UI can be reviewed and edited without touching execution or rendering code.
 */

export const ADVISOR_TOOL_NAME = "advisor";
export const ADVISOR_DISPLAY_LABEL = "[advisor]";

export const ADVISOR_UNAVAILABLE_MESSAGE = "Advisor is not available.";

export const ABORTED_MESSAGE = "Advisor call was cancelled before it completed.";
export const EMPTY_RESPONSE_MESSAGE = "Advisor returned no text content.";

export const ADVISOR_SYSTEM_PROMPT = [
  "You are the advisor in an advisor-strategy workflow.",
  "Read the executor's complete conversation and return exactly one of:",
  "- a concrete plan,",
  "- a correction to the current approach, or",
  "- a stop signal when the executor should ask the user before continuing.",
  "Be concise, directive, and grounded in the files, tool results, and decisions in the conversation.",
  "Advise on the executor's situation described in the conversation.",
  "Never call tools and never write user-facing prose for the executor.",
].join("\n");

export const ADVISOR_DESCRIPTION =
  "Ask a stronger advisor model for guidance. The full conversation and executor tool inventory are forwarded automatically. Takes no parameters.";
export const ADVISOR_PROMPT_SNIPPET =
  "Ask a stronger advisor for long-task planning, architecture design, corrections, and a way forward when stuck";
export const ADVISOR_PROMPT_GUIDELINES = [
  "Call advisor when planning a long task, before starting substantive work.",
  "Call advisor before committing to architecture or design decisions.",
  "Call advisor for a correction when the approach or an interpretation is uncertain.",
  "Call advisor when stuck, blocked, or no longer making progress.",
  "After advisor returns, restate its key guidance in the next visible reply before continuing.",
];

export const ADVISOR_COMMAND_NAME = "settings-advisor";
export const ADVISOR_COMMAND_DESCRIPTION = "Configure the advisor tool";
export const ADVISOR_TUI_ONLY_MESSAGE =
  "Advisor settings require interactive TUI mode.";

export const ADVISOR_ENABLED_LABEL = "Enabled";
export const ADVISOR_ENABLED_DESCRIPTION =
  "Expose the advisor tool to the agent";
export const ADVISOR_MODEL_LABEL = "Model";
export const ADVISOR_MODEL_DESCRIPTION = "Model used by the advisor tool";
export const ADVISOR_MODEL_SUBMENU_TITLE = "Advisor Model";
export const ADVISOR_MODEL_SUBMENU_HINT =
  "  Type to filter \u00b7 Enter to select \u00b7 Esc to go back";
export const ADVISOR_NO_MODELS_LABEL = "No models available";
export const ADVISOR_NO_MODELS_DESCRIPTION =
  "Log in to a provider or configure an API key first";
export const ADVISOR_NOT_SET = "none";
export const ADVISOR_SAVE_ERROR_MESSAGE = "Could not save advisor settings";

export const ADVISOR_THINKING_LABEL = "Thinking Level";
export const ADVISOR_THINKING_DESCRIPTION =
  "Thinking level requested from the advisor model";
export const ADVISOR_THINKING_SUBMENU_TITLE = "Thinking Level";
export const ADVISOR_THINKING_SUBMENU_HINT =
  "  Type to filter \u00b7 Enter to select \u00b7 Esc to go back";
export const ADVISOR_THINKING_DEFAULT = "default";
export const ADVISOR_THINKING_LEVEL_DESCRIPTIONS: Record<string, string> = {
  off: "No reasoning",
  minimal: "Very brief reasoning (~1k tokens)",
  low: "Light reasoning (~2k tokens)",
  medium: "Moderate reasoning (~8k tokens)",
  high: "Deep reasoning (~16k tokens)",
  xhigh: "Extra-high reasoning (~32k tokens)",
  max: "Maximum reasoning",
};

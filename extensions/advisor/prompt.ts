/**
 * Reviewer instructions and user-facing copy for the advisor tool.
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
  "You are the reviewer in an advisor-strategy workflow.",
  "Read the executor's complete conversation and return exactly one of:",
  "- a concrete plan,",
  "- a correction to the current approach, or",
  "- a stop signal when the executor should ask the user before continuing.",
  "Be concise, directive, and grounded in the files, tool results, and decisions in the conversation.",
  "Advise on the executor's situation described in the conversation.",
  "Never call tools and never write user-facing prose for the executor.",
].join("\n");

export const ADVISOR_DESCRIPTION =
  "Ask a stronger reviewer model for guidance. The full conversation and executor tool inventory are forwarded automatically. Takes no parameters.";
export const ADVISOR_PROMPT_SNIPPET =
  "Ask a stronger reviewer for a plan, correction, or stop signal when judgment is needed";
export const ADVISOR_PROMPT_GUIDELINES = [
  "Call advisor before substantive work, before writing, or before committing to an uncertain interpretation.",
  "Call advisor again when stuck, when evidence conflicts, or when considering a change of approach.",
  "Before calling advisor at the end, make the deliverable durable and run the relevant validation.",
  "After advisor returns, restate its key guidance in the next visible reply before continuing.",
];

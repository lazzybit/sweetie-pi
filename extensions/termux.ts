import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function getTermuxNotificationCommand(): string | undefined {
  if (!process.env.TERMUX_VERSION || !process.env.PREFIX) return;

  const command = join(process.env.PREFIX, "bin", "termux-notification");
  return existsSync(command) ? command : undefined;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!process.env.TERMUX_VERSION) return;

    pi.sendMessage(
      {
        customType: "termux",
        content: "The user environment is Termux.",
        display: false,
      },
      { deliverAs: "nextTurn" },
    );

    ctx.ui.notify("termux prompt injected.", "info");
  });

  pi.on("agent_settled", async () => {
    const command = getTermuxNotificationCommand();
    if (!command) return;

    try {
      await pi.exec(command, ["--title", "Pi", "--content", "Ready for input"]);
    } catch {
      // Notifications are optional and should not affect the agent lifecycle.
    }
  });
}

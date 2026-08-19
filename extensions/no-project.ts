import { homedir } from "node:os";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (resolve(ctx.cwd) !== resolve(homedir())) return;

    pi.sendMessage(
      {
        customType: "no-project",
        content:
          "The current working directory is the home directory. Use `git`, `rg`, and other broad tools sparingly.",
        display: false,
      },
      { deliverAs: "nextTurn" },
    );

    ctx.ui.notify("no-project prompt injected.", "info");
  });
}

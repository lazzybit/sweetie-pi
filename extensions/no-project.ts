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
          "當前目錄是家目錄，克制使用 git 與搜索工具。",
        display: false,
      }
    );
  });
}

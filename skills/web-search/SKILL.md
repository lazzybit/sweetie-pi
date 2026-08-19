---
name: web-search
description: "Use when you need to discover URLs or current information from a web search query rather than retrieve a known URL."
---

## DuckDuckGo

```bash
scripts/duckduckgo.sh "QUERY" [--page N] [--time d|w|m|y] [--region xx-xx]
```

- `--page`、`-p`：結果頁碼，預設為 `1`。
- `--time`、`-t`：時間篩選，可用 `d`、`w`、`m` 或 `y`。
- `--region`、`-r`：DuckDuckGo 地區代碼，預設為 `us-en`。
- 每次請求回傳約 10 筆文字結果，腳本使用帶有瀏覽器風格 HTTP 與 TLS 設定的 `curl`。

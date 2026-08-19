---
name: web-search
description: "use when you need to search a topic on internet"
---

## DuckDuckGo

```bash
scripts/duckduckgo.sh <query> [-p N] [-t d|w|m|y] [-r xx-xx]
```

- `-p`：結果頁碼，預設為 `1`。
- `-t`：時間篩選，可用 `d`、`w`、`m` 或 `y`。
- `-r`：DuckDuckGo 地區代碼，預設為 `us-en`。

每次請求回傳約 10 筆文字結果。

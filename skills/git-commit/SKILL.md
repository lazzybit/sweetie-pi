---
name: git-commit
description: "use when you need to commit change"
---

## 原則

優先遵循項目的既有的 commit message 風格，如果沒有固定的模式則使用推薦風格。

## 推薦風格

使用一行首字母小寫的英文祈使句：

```
extract validation into separate module 
```

在提交複雜變更時，可以在空一行後，以相同方式列出對應的子項：

```
refactor payment processing pipeline

- extract validation into separate module
- add retry logic for transient failures
- update unit tests to cover edge cases
```

在提交前，你應該結合變更內容理解用戶的意圖，並在 message 中體現。

## 禁忌

- 單行超過 72 字符
- 太具體，如「add dark mode toggle in settings with CSS variables」
- 太模糊，如「remove some stuff」

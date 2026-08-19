---
name: git-commit
description: "use when you need to commit change"
---

## 原則

優先遵循項目的既有的 commit message 風格，如果沒有固定的模式則使用推薦風格。

## 簡單變動的推薦風格

僅包含單一變動項：

```
extract validation into separate module 
```

## 複雜變動的推薦風格

先以一個大變動項概括整體變更，空一行，之後再列出小變動項：

```
refactor payment processing pipeline

- extract validation into separate module
- add retry logic for transient failures
- update unit tests to cover edge cases
```

## 變動項

- 首字母小寫
- 祈使語氣
- 英文
- 單行

## 禁忌

- 單行超過 72 字符
- 太具體，如「add dark mode toggle in settings with CSS variables」
- 太模糊，如「remove some stuff」

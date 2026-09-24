# P5 — Changelog（续）

- 大纲闪烁：`setHeadings` 在 paint 前算好 `activeLine`，链接 HTML 直接带 `.active`；`updateOutline` 同步传 `caretLine`；去掉 CM6 延迟 rAF 恢复。
- 纯加粗行末回车：`planExitTrailingMarksBreak` / `handleInlineMarkBreakEnter`，换行插到闭定界符后。
- 单测 + e2e：`inline-mark-break.test.ts`、`enter-outline-bold.spec.ts`

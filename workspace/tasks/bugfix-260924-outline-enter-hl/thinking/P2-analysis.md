# P2 — 根因分析

**depth**: focused

## 调用链

CM6 `onChange` → 250ms 后 `parseAndRender(..., { cm6Live: true })` → `updateOutline` → `outlinePanel.setHeadings`。

## 根因

1. `outline-panel.js` 的 `setHeadings` **无条件** `activeLine = null` 后 `paint()`，DOM 重建后无 `.active`。
2. 2.0 HTML 预览路径在 `renderMarkdownContent` 的 rAF 里会 `updateOutlineActiveFromLine(caretLine)` 恢复高亮。
3. CM6 分支只走 `renderPanel()`，**没有**对称的光标行恢复 → 任意触发 `parseAndRender` 的编辑（含回车）都会丢高亮。

## 修复方向

- `setHeadings`：若旧 `activeLine` 仍在新标题列表中，保留并 `refreshActiveHighlight`（行号未变时的兜底）。
- `parseAndRender` 的 CM6 `cm6Live` 路径：按当前光标行 `updateOutlineActiveFromLine(..., { expandAncestors: false })`（与滚动同步一致；覆盖标题行号因插入下移的情况）。

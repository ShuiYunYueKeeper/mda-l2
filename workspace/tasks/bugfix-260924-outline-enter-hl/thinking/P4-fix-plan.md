# P4 — 修复方案

## 改动

1. `outline-panel.js` `setHeadings`：保留仍存在的 `activeLine` 并重绘后刷新高亮。
2. `app.js` `parseAndRender`：CM6 `cm6Live` 时按光标行恢复大纲高亮（`expandAncestors: false`）。

## 验收

- 正文回车、标题行回车后大纲高亮仍在（或正确落到 ≤ 光标的最近标题）。
- 滚动同步高亮行为不变；不展开用户手动折叠的祖先。

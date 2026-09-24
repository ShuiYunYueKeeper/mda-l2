# P2 根因 — 文档后半跨行选区溢出

depth: focused

## 技术根因

`tight-selection.js` 的 `tightMarkersForRange` **纯依赖** `view.coordsAtPos` 逐字采样再按纵向重叠并成行矩形。长文档靠后、上方有块 widget（图/表/Mermaid）时，CM6 高度图失真，`coordsAtPos` 返回的 left/right 常退化为「整行」量级；同行选区片段的 `min(left)/max(right)` 遂铺满整行，过高的 bottom 还会盖住下一软折行（如 `levelSeverity`）。

同仓库已有先例：`context-selection.js` 注释写明「coordsAtPos 在块 widget 下方不可靠，优先走 DOM Range」。

## 证据

- 现象：靠前正常、靠后溢出 → 与 widget 下方坐标失真一致
- `charCoordsAt` / 行合并逻辑在坐标「系统性偏宽」时无法自检（`rangeHasUnreliableCoords` 只查纵向大跳）
- `selectionSegmentBoundsDom` 已用 `domAtPos` + `getClientRects` 做右键命中

## 置信度

高（~85%）

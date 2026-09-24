# P4 方案 — DOM Range 优先绘制紧致选区

## 修改计划

1. `tight-selection.js`：新增 `markersFromDomRange(view, from, to)`，用 `domAtPos` + `Range.getClientRects()` 生成 `RectangleMarker`；过滤近零宽高与超视口 2× 矩形。
2. `tightMarkersForRange`：**优先** DOM 矩形；失败再回退现有 `coordsAtPos` 逐字路径（单测 mock 无 DOM 时仍绿）。
3. 单测：mock `domAtPos` + `getClientRects` 断言多折行多矩形、宽度不铺满。
4. e2e（可选）：打开含前缀 widget 的长文，程序化设跨行选区，断言 `.mda-cm-tight-sel` 宽度显著小于行宽。

## 预死亡分析

1. hide-mark / 零宽装饰产生碎矩形 → 过滤 `w<1 || h<1`
2. 超大选区 `getClientRects` 偏慢 → 仅 viewport 裁剪后的 `[from,to)`（已有）
3. `domAtPos` 落在 widget 内抛错 → catch 后回退 coords 路径

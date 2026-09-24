# P4 修复方案 — 表格拖拽粘鼠标

## 修改计划

1. **`table-resize.js`**
   - 拖拽中禁止 `rebuildHandles`；仅就地更新当前手柄位置
   - 改用 Pointer Events：`setPointerCapture` + `pointerup`/`pointercancel`/`lostpointercapture`
   - `pointermove`/`mousemove` 若 `buttons===0` 则强制结束
   - 暴露 `isDragging()`；`dispose` 时强制 `endDrag`
2. **`table-chrome.js`**
   - `ResizeObserver` / `scroll`：若 `resizeCtl.isDragging()` 则跳过 `rebuildHandles`
3. **e2e** `tests/e2e/gui/table-col-resize.spec.ts`
   - 拖列宽 → `mouseup` → 断言无 `body.mda-cm-table-resizing*`
   - 再移动鼠标 → 列宽不变

## 预死亡分析

1. 若仍在拖拽中因其它路径 `dispose` 整表：须在 dispose 清 body class（已有 endDrag）
2. 若只修 capture 仍 rebuild：捕获目标被毁，问题复发 → 必须禁止拖拽中 rebuild

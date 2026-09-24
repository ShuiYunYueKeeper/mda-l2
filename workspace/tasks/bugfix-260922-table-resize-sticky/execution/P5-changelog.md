# P5 Changelog

## 改动

- `src/gui/renderer/editor/widgets/table-resize.js`
  - 拖拽中禁止 `rebuildHandles` 销毁手柄；改为 `syncActiveHandleGeometry`
  - Pointer capture + `pointerup`/`pointercancel`/`lostpointercapture`/`blur`/`buttons===0` 收尾
  - 暴露 `isDragging()`；`dispose` 强制结束
- `src/gui/renderer/editor/widgets/table-chrome.js`
  - scroll / ResizeObserver 在拖拽中跳过 `rebuildHandles`
- `tests/e2e/gui/table-col-resize.spec.ts`（新增）

## 构建

`npm run build:editor` + `build:gui` 已跑通。

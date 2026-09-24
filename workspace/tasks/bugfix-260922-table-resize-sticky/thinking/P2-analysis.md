# P2 根因分析 — 表格拖拽粘鼠标

depth: focused

## 技术根因

1. **拖拽中销毁手柄 DOM**：`onMove` 每次调用 `rebuildHandles()`（`overlay.innerHTML = ''`），销毁 `mousedown` 落点元素；`activeHandle` 变成游离节点，拖拽高亮加在旧节点上。Chromium/Electron 在按下目标被移除时，后续 `mouseup` 偶发丢失。
2. **ResizeObserver 二次重建**：`applyTableLayout` 改 wrap 尺寸 → `table-chrome` 的 `ResizeObserver` 再调 `rebuildHandles()`，放大上述风险。
3. **结束事件面过窄**：只监听 `document.mouseup`，无 `pointerup` / `pointercancel` / `lostpointercapture` / `buttons===0` 兜底；一旦 `mouseup` 丢失，`body.mda-cm-table-resizing-col`（`cursor: col-resize !important`）永久残留 → 用户感知「粘鼠标」。

## 证据

- `table-resize.js` `onMove`：`applyTableLayout` + `rebuildHandles` + 对可能已脱离的 `activeHandle` 加 class
- `table-chrome.js`：`ResizeObserver` / `scroll` 无条件 `rebuildHandles`
- `index.html`：`body.mda-cm-table-resizing-col { cursor: col-resize !important }`

## 置信度

高（~90%）。机制与「拖拽中销毁按下目标 → 丢 mouseup → CSS 光标粘住」一致；用 e2e 拖拽后断言 body class 与二次移动不改宽验证。

# P1 Bug 信息 — 表格列宽拖拽粘鼠标

## 现象

表格单元格边界拖拽调整列宽/行高后，松开鼠标仍呈「粘鼠标」：光标保持 `col-resize`/`row-resize`，或宽度继续跟随鼠标移动。

## 环境

- MDA GUI / CM6 预览编辑模式
- Windows；可经 Playwright Electron e2e 复现
- 相关模块：`src/gui/renderer/editor/widgets/table-resize.js`、`table-chrome.js`

## 复现步骤

1. 打开含 GFM 表格的 Markdown
2. Hover 表格 → 列边界出现 resize 手柄
3. 按下左键拖拽改变列宽
4. 松开鼠标
5. 再移动鼠标 → 光标/宽度仍像在拖

## 期望

`mouseup`/`pointerup` 后立即结束拖拽：清除 `body.mda-cm-table-resizing*`，后续 `mousemove` 不再改列宽。

## 影响

拖拽后无法正常编辑/点选，需刷新或关窗，体验阻断。

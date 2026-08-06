# Prompt 33 — widget 内文字拖选与表格拖选卡死

> 日期：2026-08-06  
> 阶段：P4 / M8-C3–C4 选区回归  
> 状态：✅ 用户验收通过

## 背景

预览模式在表格单元格内拖选文字后出现：

1. 紧致选区层高亮错位（飞到正文其他位置）
2. 无法切换侧栏文件、无法关闭窗口（渲染进程卡死）
3. 修复尝试中对 widget `contenteditable` 使用 `domEventHandlers` `return true` → CM6 调用 `preventDefault()`，导致表格格 / 代码块 / 流程图源码内**完全无法拖选**

## 实现

| 模块 | 职责 |
|------|------|
| `widget-editable-guard.js` | `transactionFilter` 坍缩 CM6 选区；`attachWidgetEditablePointerIsolation` 隔离指针冒泡 |
| `view/tight-selection.js` | widget 聚焦 / 不可靠坐标时跳过；矩形超视口 2 倍丢弃 |
| `index.html` | 预览模式 widget `::selection` 高于 `.cm-content *` 透明规则 |
| `table-chrome.js` / `code.js` / `mermaid.js` / `math.js` | 挂载指针隔离 |
| `live-preview.js` | `.concat(createWidgetEditableGuardExtension())` 正确展开扩展 |

## 验收要点

- [x] 表格单元格内拖选文字，浅蓝高亮位置正确
- [x] 围栏代码块 `contenteditable` 内可拖选
- [x] Mermaid 源码 `contenteditable` 内可拖选
- [x] 表格内拖选后可切换侧栏文件、可关闭窗口

## 测试

```bash
npm test -- tests/gui/editor/tight-selection.test.ts
npm run build
npm run gui -- samples/all-features.md
```

## 遗留

- **SEL-1** 正文拖选着色仍 ❌（用户要求先搁置）
- 可选补录屏：表格格内拖选 + 切文件（`docs/screenshots/README.md` 待补项，非阻塞）

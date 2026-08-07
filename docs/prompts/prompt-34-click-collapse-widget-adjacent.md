# Prompt 34 — 块 widget 邻接行指针校准（单击/拖选/多击）

> 日期：2026-08-07  
> 阶段：P4 / M8-C0 指针  
> 状态：✅ 用户验收通过

## 背景

`samples/mermaid-diagrams.md` 在首个大块 Mermaid（Gantt）之后，**第 181 行起**单击/拖选/多击落点错位：

1. CM6 `posAtCoords` 在 widget 上方/下方邻接行落到下一行行首
2. 单击先闪到下一行再恢复；拖选长期停在错误行
3. 双击/三击仍走 CM6 默认路径，校准落点与 `selection.head` 不一致
4. 拖选在编辑区外松手后 `mouseDown` 未清，移动鼠标仍扩展选区

## 根因

- 块 widget 撑高后高度图失真：`coordsAtPos` 横向大偏、纵向接近 → 旧 `refineIfFar` 误触发邻行重选
- 仅 `mouseup` 校准拦不住 CM6 `mousedown` 抢先写入的错误选区
- 三击 `line.to + 1` + `adjustSelectionForHiddenMarks` 吃进下一行列表标记
- 拖选会话无 document `mouseup` / `event.buttons` 收尾

## 实现

| 模块 | 职责 |
|------|------|
| `click-collapse.js` | `posAtClick` 优先 `.cm-line` DOM；`mousedown` 抢先 `setSelectionAtClick`；拖选自管 `applyDragSelectionAt`；双击 `wordAt`、三击 `docLineAtClick`+`lineSelectionRange`；`finalizePointerUp`+document `mouseup` |
| `caret-syntax-adjust.js` | `clampEmptyLineSelectionBleed` 拖选不吃下一空行行首 |
| `mermaid.js` / `index.html` | 源码模式保留块拖拽手柄（删隐藏 CSS；进入源码 `selectFrame`） |

## 验收要点

- [x] Gantt 下方 `## 7. Pie`：单击/拖选/双击/三击落点正确
- [x] 文末列表项：三击仅当前行，不含下一行 `2.`
- [x] 编辑区外松手后移入：选区不再随鼠标扩展
- [x] Mermaid 源码模式块手柄可用

## 测试

```bash
npm test -- tests/gui/editor/click-collapse.test.ts tests/gui/editor/caret-syntax-adjust.test.ts
npm run build:editor
npm run gui -- samples/mermaid-diagrams.md
```

## 遗留

- ~~**SEL-1** 正文选区着色~~ → **2026-08-07 用户复验 ✅**
- Shift+点击延伸选区仍走 CM6 默认（widget 下方可能偏行，低优先级）

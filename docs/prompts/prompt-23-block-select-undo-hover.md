# P4 迭代记录 — 表格单击无蓝底 / 块删除撤销恢复选中 / 悬停菜单 200ms

> 日期：2026-08-03  
> 阶段：P4 / M8 块 widget 打磨  
> 用户实机：✅ 三项均已验证通过

## 本轮改动

| # | 需求 | 结论 |
|---|------|------|
| 1 | 点击表格单元格、未选取文字时去掉整格蓝底 | ✅ |
| 2 | 图片/流程图/代码块/表格/引用/高亮块/分割线：删除并撤销后恢复选中态与光标 | ✅ |
| 3 | 代码块语言下拉子菜单移出后 200ms 消失；同类悬停关闭统一 200ms | ✅ |

## 实现要点

1. **表格单击**：`applySelectionHighlight` 对 `kind === 'cell'` 不铺 `mda-cm-table-cell-selected`；`:focus` 仅细边框。
2. **删除撤销**：删前钉选区且 `addToHistory.of(false)`；删时保留内存选中；`block-selection` / 图片 / Mermaid sync plugin 按 `source` reconcile。
3. **悬停**：`HOVER_LEAVE_MS = 200`（`widget-common.js`）；语言子菜单补 mouseleave 延迟关闭；块手柄主/子菜单与手柄隐藏共用该常量。

## 文档

- `AGENTS.md` §9.4m / **4n**
- `quality.md` §5 人工审核点
- `docs/M8-acceptance-checklist.md` 闸门补充本轮打磨项（SEL-1 仍 ❌）

## 遗留

- **SEL-1** 正文拖选仍阻塞（见 `prompt-22-sel1-prose-selection-fail.md`）
- M8-C5 公式阶段仍为实现中，待下一轮

# P4 迭代记录 — 格内加粗叠套斜体/下划线/删除线

> 日期：2026-09-28  
> 档位：T1  
> 用户实机：✅ 已验证

## 现象

单元格内加粗再叠斜体 / 下划线 / 删除线时，内层定界符当可见字露出，或样式层缺失。

## 根因

`setCellMarkdownContent` 用 `pickNonOverlapping` 只保留最外层语法节点，嵌套 `Strikethrough` / `Underline` / `Emphasis` 被丢弃；可见偏移也按外层 content（含内层定界符）计算。

## 修复

- `fillCellInlineWindow` / `appendCellInlineRange`：在 content 窗口内递归渲染
- `collectCellDelimiterExclusions`：可见偏移跳过全部定界符层
- 序列化支持嵌套子 span 再包本层定界符

## 测试

- 单测：`table-cell-format` / `table-cell-nested-marks`
- e2e：`cell-nested-marks.spec.ts`（E-CELL-NEST-1–4）

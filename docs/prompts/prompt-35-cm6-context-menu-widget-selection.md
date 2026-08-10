# P4 迭代记录 — CM6 右键菜单与 widget 内选区

> 日期：2026-08-10  
> 阶段：P4 / M8-E4 右键菜单  
> 用户实机：✅ 已通过（README 运行指引段及靠后代码块/表格）

## 本轮改动

| # | 需求 | 结论 |
|---|------|------|
| 1 | CM6 统一右键菜单（剪贴板 / 链接编辑 / AI 占位） | ✅ |
| 2 | 正文 / 链接选区右键保留 | ✅ |
| 3 | 代码块 / 表格单元格拖选后右键保留 | ✅ |
| 4 | 长文档多表场景不丢选区 | ✅ |

## 根因（widget 右键丢选区）

每个表格 `onDocPointer`（document 捕获）在表外点击时调用 `clearTableInteraction()`，其中全局 `removeAllRanges()` 先于 context-menu 快照执行；文档越靠后表格越多，复现概率越高。

## 实现要点

- `table-chrome.js`：`onDocPointer` 跳过 button 2；`clearTableInteraction` 仅清本表内 DOM 选区
- `context-menu.js` + `context-selection.js`：document 捕获 mousedown 快照；contextmenu 恢复；代码块逻辑偏移
- `widget-context-menu-guard.js`：菜单期暂缓 code blur
- `media-outside-click.js`：右键跳过块外清除

## 文档

- `AGENTS.md` §9.4o、关键文件索引
- `quality.md` CM6 右键菜单人工审核点
- `docs/few-shot-examples.md` §28

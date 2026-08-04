# P4 迭代记录 — 引用插入 / 空块手柄；暂不做高亮块

> 日期：2026-08-04  
> 阶段：P4 / M8 块手柄插入  
> 用户实机：✅ 引用插入已验证

## 本轮改动

| # | 需求 | 结论 |
|---|------|------|
| 1 | 块菜单插入引用：光标落在可输入处 | ✅ |
| 2 | 空引用可悬停显手柄、可点选（无选中蓝框） | ✅ |
| 3 | 暂不做高亮块：移除菜单项 / 片段 / callout 样式与分支 | ✅（按用户要求） |

## 实现要点

- `insertSnippetNearBlock`：caret 落在 snippet 可输入位置；引用插入后短暂 `block-handle-show`（不自动蓝框）
- 空引用行保留 `> ` 后空格，避免整行 atomic hide
- `attachBlockDragHandle`：toDOM 后 rAF 绑定块内各行悬停（修复 closest 为 null）
- 引用选中不画 outline 蓝框；仅手柄
- 删除高亮：`INSERT_ITEMS` / snippets / `quoteKind: highlight` / callout hide / 浅黄框 CSS / i18n

## 文档

- 本文件；`docs/M8-acceptance-checklist.md` 闸门行

## 遗留

- **SEL-1** 正文拖选仍阻塞
- 高亮块（callout）明确推迟，勿再加插入入口除非用户重开

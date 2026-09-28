# P4 迭代记录 — README 加粗段拷贝 / 删除线 / 下划线叠套 / 单元格粘贴

> 日期：2026-09-28  
> 档位：T1 缺陷修复（收敛于已有定界符/剪贴板/单元格模块）  
> 用户实机：✅ 已验证（README.md:6）

## 现象（加粗前提下）

1. 拷贝「能打开」贴到正文/单元格 → 丢失加粗  
2. 选「能打开」点删除线 → 整段加粗被拆坏  
3. 选「能批注」下划线再删除线 → 无删除线；再取消会毁定界符  
4. 整段加粗贴进单元格 → 先露 `**…**`，失焦才渲染  

## 根因与修复

| # | 根因 | 修复 |
|---|------|------|
| 1 | 预览选可见字校准后常含开定界符、不含闭；挖 hide-mark 后无补壳 | `wrapClipboardWithCoveringMarks`（`selInside` / `coversAllFromMark` / `openPlusPartialContent`） |
| 2 | 校准选区含开 `**`，直接包 `~~` → `~~**…~~**` | 格式前 `snapIntoMarkContent` |
| 3 | 朴素叠 `~`+`~~` 与 Lezer/CSS 冲突 | `~~~text~~~` + `planCombinedTildeToggle`；`build-specs` 拆层；CSS `underline line-through` |
| 4 | 格内 paste 当纯文本 | `pasteMarkdownIntoTableCell` 立刻 `setCellMarkdownContent` |

## 测试

- 单测：`syntax-clipboard` / `inline-delimiter-ops` / `inline-delimiters` / `inline-string-ops`
- e2e：`readme-bold-ops.spec.ts`（E-RB-1–4）、`copy-delim-and-mix.spec.ts`（E-COPY / E-MIX）
- e2e 剪贴板：断言 `sliceSelectionForClipboard`；格内合成 `ClipboardEvent`（勿依赖系统剪贴板）

## 沉淀

- `AGENTS.md` §9.4l2 / 4l4 / 4m2b  
- `docs/few-shot-examples.md` §12  
- `quality.md` §5 人工审核点  

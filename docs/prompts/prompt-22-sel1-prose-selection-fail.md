# P4 迭代记录 — 正文选取（SEL-1）不过关

> 日期：2026-08-03  
> 阶段：P4 / M8 坐标与选区  
> 结论：**正文拖选着色用户判定不过关**；文档与闸门已回退，代码侧停损（撤自绘选区）。

## 结论

| 项 | 状态 |
|----|------|
| M8 **SEL-1**（正文/内联装饰拖选） | ❌ 不过关（原 2026-07-31 ✅ 签收作废） |
| SEL-2 / SEL-3 / SEL-4（表格、Mermaid/代码块源码） | ✅ 仍有效（widget `contenteditable` 路径） |
| M8 总验收 | 阻塞：SEL-1 未过不得总签 |

## 用户反馈摘要

- 只选一部分却像整行发蓝（含行尾空白）
- 选区出现双色 / 双高度
- 行内 `` `npm run dist:win` `` 等漏画，像没选中
- 单击尚未拖选就像选中；拖选闪烁、光标不一致
- 行内 code 灰底易与选区蓝混淆

## 已尝试（均未闭环，部分引入回归）

1. 关 `highlightActiveLine`、调 CSS `::selection` / `.cm-selectionBackground`
2. 自绘「紧致选区层」——行内 code/粗体处漏画、双高度；`class` 含空格致 `classList.add` 崩溃
3. 强制原生 `::selection`、隐藏默认 `cm-selectionLayer`——contenteditable 仍会铺行尾
4. `click-collapse` 为防闪烁「非空不坍缩」→ 单击 atomic 误选残留

**停损（2026-08-03）**：移除自绘选区挂载，恢复 CM6 默认 `drawSelection`；点击诊断默认关。**不宣称**整行铺底已修。

## 文档更新

- [`docs/M8-acceptance-checklist.md`](../M8-acceptance-checklist.md)：SEL-1 ❌ +「正文选取不过关说明」
- [`AGENTS.md`](../../AGENTS.md) §9.4m：验收现状与再改约束

## 后续（待单独小步方案，需用户确认后再动代码）

- 正文路径与代码块路径差异：CM6 文档选区 + hide-mark atomic vs 独立 contenteditable
- 再改须先过 SEL-1 实机清单；禁止再叠多层选区绘制

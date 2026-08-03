# P4 迭代记录 — 行内公式选中 / 复制剪切删除撤销

> 日期：2026-08-03  
> 阶段：P4 / M8-C5 公式打磨  
> 用户实机：✅ 已验证通过

## 本轮改动

| # | 需求 | 结论 |
|---|------|------|
| 1 | 正文行内公式点击出现选中框 | ✅ |
| 2 | 支持复制 / 剪切 / 删除 / 撤销 | ✅ |

## 实现要点

- `inline-math-selection.js`：内存选中态 + 蓝框 class；Delete/Backspace/Mod-c/Mod-x
- 删除用精确区间（勿 `deleteBlockRange` 吞行尾换行）；`findNearestInlineMathRange` 供撤销后 reconcile
- 与图 / 代码 / 表等互斥清选中

## 文档

- 本文件；`docs/M8-acceptance-checklist.md` 闸门行

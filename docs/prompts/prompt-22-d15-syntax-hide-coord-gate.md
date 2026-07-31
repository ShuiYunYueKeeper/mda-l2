# Prompt 22 — D15 全程隐藏语法与坐标闸门重整

**日期**：2026-07-30  
**触发**：用户要求全程隐藏语法（竞品对齐）、质量优先、调试开关统一配置、文档与废弃代码清理。

## 裁决

| 项 | 结论 |
|----|------|
| P0 D15 | 预览编辑默认 **never** 显露语法；块编辑走 widget / 源码模式 |
| P1-D12 | 废止为长期方案（M8-A 原型仅作验证） |
| M8-B8 / B8b | **坐标闸门**阻塞 B7 签收与 M8-C1 |
| hide 临时代码 | 移除 `font-size:0`、零宽 replace、透明占宽等过渡方案 |

## 代码

| 文件 | 变更 |
|------|------|
| `editor/config.js` | 统一 `clickDebug` / `blockWidgets` / `logDecoBuild`；`MDA_EDITOR_RELEASE` |
| `editor/click-debug.js` | 改读 config；默认仅开发构建 |
| `editor/index.js` | 移除 `CM6_EXPERIMENT_LOCKED_OFF` |
| `widgets/hidden-line.js` | 移除废弃 `HideMarkWidget` |
| `model/reveal.js` | 默认 `never` |
| `scripts/bundle-editor.js` | `define __MDA_EDITOR_RELEASE__` |
| `app.js` | reveal 默认 `never` |

## 文档

- P0 v1.10、P1 v1.6、P2 v1.4、P3 v1.3、M8 清单、`competitor-product/README.md`

## 下一步（M8-B8b）

1. ~~实现 `EditorView.atomicRanges` + `hide-mark` replace 零宽 widget~~ ✅ 2026-07-30  
2. ~~单测 B8b-1–4~~ ✅  
3. ~~**COORD-1–4 实机 HUD Δ≤2px**~~ ✅ 用户签收 2026-07-30  
4. ~~通过后签收 M8-B7~~ ✅；**下一步：M8-C1**（`blockWidgets` 联调 + COORD-5）

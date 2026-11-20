# P4 迭代记录 — HTML 块源码态可选区 / 右键复制剪切可用

> 日期：2026-11-19  
> 档位：T1  
> 用户实机：✅ 已验证（用户指示整理入库）

## 需求

① 用户「html块内代码模式无法选区」；② 用户「可以选区了，但是选区后，右键的复制和剪切功能是置灰的」。

## 方案

- 选区其实是**选上了但看不见**：预览模式统一把 `.cm-content *::selection` 刷透明，代码块 / 流程图 /
  公式 / 表格源码框都在例外名单里，HTML 源码框漏了 → 三处 selector 同步补齐。
- CM6 侧同样不认识这个编辑区：`widget-editable-guard.js` 的 `WIDGET_EDIT_SELECTOR` 缺它，
  `focusInWidgetInlineEditable()` 恒 false，`Ctrl+A` 还会落到 CM6 keymap 上全选整篇。
- 右键置灰同理：`context-menu.js` 的 `WIDGET_EDIT_SEL` 缺公式与 HTML 源码框 → 落到 `dom-collapsed`
  分支，把复制/剪切渲染成 disabled。
- 源码框自己兜住按键：只放行 `Ctrl/Cmd+F/H`，其余 `stopPropagation`；`Ctrl+A` 只 `selectNodeContents`；
  无选区 `Ctrl+C` 复制整块源码；`paste` 只取 `text/plain` 再 `insertText`。

## 改动

- `src/gui/renderer/index.html`、`editor/widget-editable-guard.js`、`editor/widgets/html-block.js`、
  `editor/context-menu.js`
- 测试：`tests/e2e/gui/html-block.spec.ts` 增 3 例（选区可见、`Ctrl+A` 只框选源码、右键不置灰）

## 测试

- `npm test`：90 suites / 743 tests 通过
- `npx playwright test tests/e2e/gui/html-block.spec.ts`：10/10；与 3 个 spec 合跑：17 passed
- 真机探针：`::selection` 背景由 `rgba(0,0,0,0)` 变 `rgb(184,212,254)`；右键三项 `disabled === false`

## 沉淀

- `AGENTS.md` §9 4b3 追加 ⑦：新增 widget 源码框时必须三处同步（`::selection` 例外、
  `WIDGET_EDIT_SELECTOR` + `classifyWidgetEditable`、`WIDGET_EDIT_SEL`）。

## 遗留

- 待补源码态选区截图（见任务 P6 清单）。

# P5 Changelog — HTML 块源码态可选区 / 右键复制剪切可用

> 档位：T1（两条独立缺陷：选区不可见、右键菜单置灰）
> 需求：① 用户「html块内代码模式无法选区」；② 用户「可以选区了，但是选区后，右键的复制和剪切
> 功能是置灰的」。

## 根因

- 选区**选了但看不见**：预览模式有一条 `.cm-content *::selection { background-color: transparent
  !important }`，其为代码块 / 流程图 / 公式 / 表格源码框开了例外，唯独漏了
  `.mda-cm-html-source-input`。
- CM6 不认它是 widget 编辑区：`widget-editable-guard.js` 的 `WIDGET_EDIT_SELECTOR` 同样缺这一类，
  于是 `focusInWidgetInlineEditable()` 恒 false，`Ctrl+A` 还会落到 CM6 keymap 上全选整篇。
- 右键置灰：`context-menu.js` 的 `WIDGET_EDIT_SEL` 只列了代码块 / 流程图 / 表格，缺公式与 HTML
  源码框 → `resolveMenuContext` 落到 `dom-collapsed` 分支，把复制/剪切渲染成 disabled。

## 方案

- 三处 selector 同步补齐（`index.html` 的 `::selection` 例外、`WIDGET_EDIT_SELECTOR` +
  `classifyWidgetEditable()` 的 `'html'` kind、`context-menu.js` 的 `WIDGET_EDIT_SEL`）。
- 源码框按键自己兜住：keydown 放行 `Ctrl/Cmd+F/H`，其余 `stopPropagation`（防 Backspace / 方向键
  改正文）；`Ctrl+A` 只 `selectNodeContents`；无选区 `Ctrl+C` 复制整块源码；`paste` 只取
  `text/plain` 再 `insertText`。

## 文件

- `src/gui/renderer/index.html`：三组 `::selection` 例外补 HTML 源码框
- `src/gui/renderer/editor/widget-editable-guard.js`：`WIDGET_EDIT_SELECTOR`、`classifyWidgetEditable`
- `src/gui/renderer/editor/widgets/html-block.js`：`selectSourceContent`、keydown 拦截、`paste`
- `src/gui/renderer/editor/context-menu.js`：`WIDGET_EDIT_SEL` 补 `.mda-cm-math-source-input` /
  `.mda-cm-html-source-input`
- `tests/e2e/gui/html-block.spec.ts`：选区可见、`Ctrl+A` 只框选源码、右键复制不置灰
- `AGENTS.md`：§9 4b3 追加 ⑦（三处同步清单）

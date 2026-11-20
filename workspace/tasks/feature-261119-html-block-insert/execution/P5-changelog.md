# P5 Changelog — 插入菜单新增 HTML 块 / 块内双击不进源码态

> 档位：T3（插入片段 → 菜单项 → 图标生成 → i18n → 落点聚焦，跨 5 个模块）
> 需求：① 用户「支持插入html块」；② 用户「双击html块内，会自动从预览模式切换成代码模式，解决它」。

## 方案

- 片段 `INSERT_SNIPPETS.html = '<div align="center">\n\n</div>'`，归入
  `INSIDE_TRAILING_BLANK_INSERT_TYPES`：块后补空白行，光标落在开标签后的空行里。
- 插入入口复用现有三处（工具栏「插入」、空白行「+」/ `/`、块手柄插入子菜单），
  只加一项 `{ id: 'html', key: 'insertMenuHtml', icon: 'html' }`。
- 图标走构建期生成：`scripts/generate-gui-icons.js` 的 `ICON_MAP` 加 `html: 'FileCode'`
  （lucide 没有 html 图标），`build:editor` 已包含该脚本，无需手工改生成文件。
- 落点聚焦：`scheduleFocusInsertedBlockEdit` 放开 `'html'`，双 rAF 后点该 widget 的
  `[data-action="source"]`，新块直接进源码态便于输入。
- 双击不再切源码态：删掉 `html-block.js` 的 `dblclick` 监听——块内双击是用户想选词/看图，
  突然变成源码框属于打断；源码态只由工具栏「代码」按钮进入。

## 文件

- `src/gui/renderer/editor/widgets/block-insert-snippets.js`：`html` 片段与光标偏移
- `src/gui/renderer/editor/widgets/insert-menu-items.js`：`INSERT_GENERAL_ITEMS` 增 `html`
- `src/gui/renderer/editor/widgets/block-handle-ops.js`：`scheduleFocusInsertedBlockEdit` 的 html 分支
- `src/gui/renderer/editor/widgets/block-menu-icons.js`：`BLOCK_KIND_ICON.html`
- `scripts/generate-gui-icons.js` / `src/gui/renderer/editor/lucide-icons.generated.js`：FileCode 图标
- `src/gui/renderer/editor/widgets/html-block.js`：移除 dblclick
- `src/gui/renderer/i18n.js`：`insertMenuHtml`（zh / en）
- `tests/gui/editor/block-insert-snippets.test.ts`、`tests/e2e/gui/html-block.spec.ts`
- `AGENTS.md`：§9 4b3 追加 ⑤（源码态入口）与 ⑥（插入入口）

## 坑

- 该插入能力曾在上一轮落地后**于工作树中丢失**（另一会话改了仓库状态），本轮按同方案重做，
  故 `P6` 的实机结论以本轮为准。
- e2e 曾用键盘 `Control+End` + `/` 开菜单，单独跑通过但与其他 spec 并行时因窗口焦点竞争失败；
  改为纯鼠标路径（`MDAEditor.findEditorView().dispatch` 定位文末空行 → 点工具栏「插入」）。

# P4 迭代记录 — 插入菜单新增 HTML 块 / 块内双击不进源码态

> 日期：2026-11-19  
> 档位：T3  
> 用户实机：✅ 已验证（用户指示整理入库）

## 需求

① 用户「支持插入html块」；② 用户「双击html块内，会自动从预览模式切换成代码模式，解决它」。

## 方案

- 片段 `'<div align="center">\n\n</div>'` 归入「块后补空白行、光标落块内」类型：插入后滚动到视野、
  光标落在开标签后的空行，直接可输入。
- 三个插入入口（工具栏「插入」、空白行「+」/ `/`、块手柄插入子菜单）共用
  `appendInsertMenuPanel`，只加一项 `{ id: 'html', key: 'insertMenuHtml', icon: 'html' }`；
  lucide 没有 html 图标，走构建期 `ICON_MAP` 的 `FileCode`。
- 插入落点聚焦：`scheduleFocusInsertedBlockEdit` 放开 `'html'`，双 rAF 后点该 widget 的
  `[data-action="source"]`，新块直接进源码态。
- 双击不再切源码态：块内双击是「选词/看图」的直觉动作，突然变源码框属于打断；源码态只由工具栏
  「代码」按钮进入。

## 改动

- `widgets/block-insert-snippets.js`、`widgets/insert-menu-items.js`、`widgets/block-handle-ops.js`、
  `widgets/block-menu-icons.js`、`widgets/html-block.js`、`scripts/generate-gui-icons.js`、
  `i18n.js`
- 测试：`tests/gui/editor/block-insert-snippets.test.ts` 增 1 例、`tests/e2e/gui/html-block.spec.ts` 增 2 例

## 测试

- `npm test`：90 suites / 742 tests 通过
- `npx playwright test tests/e2e/gui/html-block.spec.ts`：7/7；与 3 个 spec 合跑：14 passed
- 真机探针：插入后 `blockCount:1, sourceMode:true, focusedIsSource:true`，源码态来回切换 `stable:true`

## 沉淀

- `AGENTS.md` §9 4b3 追加 ⑤（源码态只由工具栏进入，禁止绑双击）与 ⑥（插入入口与落点聚焦）。

## 遗留

- 待补「插入菜单」与「插入后源码态」截图（见任务 P6 清单）。
- 源码框多行键入时 contenteditable 的 `<div>/<br>` 经 `innerText` 会多出空行；单行编辑无影响。

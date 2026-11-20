# P5 Changelog — 预览模式渲染原生 HTML 块

> 档位：T3（跨 core 渲染器 / CM6 编辑器 / GUI 预览，新增清洗器与块 widget）
> 需求：用户「README.md 这个文档前半部分显示不正确」——GitHub 风格居中 HTML 头部
> （`<p align="center">` + 徽章 `<img>` + `<h1 align="center">`）被当源码逐行显示。

## 方案

- core 开 `html: true`，`html_block` / `html_inline` 两条 renderer 规则都过 `sanitizeHtml`：
  白名单重建、无三方依赖；**不补闭合标签**（`<details>` 的开关标签常分属两个 token，
  补齐会破坏跨块嵌套）；结束标签即使栈空也照原样输出。
- CM6 侧新增块级 `HtmlBlockWidget`：整块源码交给 `renderMarkdown` 渲染（`createMdSurface`），
  块内 Markdown 与相对图片照常处理，`<details>` 天然可折叠。
- `htmlBlockRegion` 沿行扫标签深度把 CommonMark 截断的多行 HTML 收回成一块；围栏内的行不计深度，
  400 行内未配平则退回语法树那一块（避免脏文档吞掉整篇）。
- 相邻 HTML 块「只隔空行」时合并为一张卡（README 头部 8 段合成 1 张），并保证区间不重叠。
- CSP 图片放行 `https:`（shields.io 徽章），预览内容 `white-space: normal`（源码换行不再变硬换行）。

## 文件

- `src/core/html.ts`（新增）：`sanitizeHtml` 白名单清洗（标签/属性/协议/`data:` 仅图片）
- `src/core/renderer.ts`：`html: true` + `html_block`/`html_inline` 清洗规则
- `src/core/index.ts`：导出 `sanitizeHtml`
- `src/gui/renderer/editor/model/html-block.js`（新增）：`htmlBlockRegion`、`looksLikeHtmlLine`
- `src/gui/renderer/editor/model/build-specs.js`：`HTMLBlock` 节点采集与 `html-block` widget spec
- `src/gui/renderer/editor/widgets/html-block.js`（新增）：`HtmlBlockWidget`
- `src/gui/renderer/editor/live-preview.js`：块 widget 列表、`overlapsHide` 例外、widget 分支
- `src/gui/renderer/editor/config.js`：`WIDGET_MIN_PHASE['html-block']`
- `src/gui/renderer/editor/widgets/{widget-common,block-menu-icons}.js`：工具栏刷新、块图标
- `src/gui/renderer/editor/model/anno-add-context.js`：`BLOCK_ONLY_KINDS.html`
- `src/gui/renderer/app.js`：`onEditHtmlBlock` / `onMoveHtmlBlock`
- `src/gui/renderer/index.html`：CSP `img-src https:`、HTML 卡片样式
- `src/gui/renderer/i18n.js`：`widgetHtmlLabel` / `widgetHtmlCopy` / `widgetHtmlEdit`
- `tests/core/html.test.ts`（新增 17 用例）、`tests/gui/editor/html-block.test.ts`、
  `tests/e2e/gui/html-block.spec.ts`
- `AGENTS.md`：§9 4b 修订、新增 4b2 / 4b3、模块表与 core API

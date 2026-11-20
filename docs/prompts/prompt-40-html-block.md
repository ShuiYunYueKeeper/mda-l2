# P4 迭代记录 — 预览模式渲染原生 HTML 块

> 日期：2026-11-18  
> 档位：T3  
> 用户实机：✅ 已验证（用户指示整理入库）

## 需求

用户指出 `README.md` 前半部分显示不正确：GitHub 风格的居中 HTML 头部（`<p align="center">`、
shields.io 徽章、`<h1 align="center">`）在 MDA 里被当源码逐行显示。GitHub 上正常，故是 MDA 的渲染缺陷。

## 方案

- core 开 `html: true`，但**不是**直接把原生 HTML 吐出去：`html_block` / `html_inline` 两条规则都过
  `src/core/html.ts` 的白名单清洗（标签、属性、协议、`data:` 仅图片）；不补闭合标签——`<details>` 的
  开闭标签常分属两个 token，补齐会破坏跨块嵌套；结束标签即使栈空也照原样输出。
- CM6 预览模式此前**完全没有 HTML 渲染路径**（Lezer 的 `HTMLBlock` / `HTMLTag` 全仓库零命中），
  新增块级 `HtmlBlockWidget`：整块源码交给 `renderMarkdown` 渲染，块内 Markdown 与相对图片照常处理。
- `htmlBlockRegion` 沿行扫标签深度，把 CommonMark 截断的多行 HTML 收回成一块；相邻块只隔空行时合并
  （README 头部 8 段合成 1 张卡），并保证区间不重叠。
- CSP 图片放行 `https:`（徽章），预览内容 `white-space: normal`（源码换行不再变硬换行）。

## 改动

- core：`src/core/html.ts`（新增）、`renderer.ts`、`index.ts`
- CM6：`model/html-block.js`（新增）、`model/build-specs.js`、`widgets/html-block.js`（新增）、
  `live-preview.js`、`config.js`、`widgets/widget-common.js`、`widgets/block-menu-icons.js`、
  `model/anno-add-context.js`
- GUI：`app.js`（`onEditHtmlBlock` / `onMoveHtmlBlock`）、`index.html`、`i18n.js`
- 测试：`tests/core/html.test.ts`（17 例）、`tests/gui/editor/html-block.test.ts`（10 例）、
  `tests/e2e/gui/html-block.spec.ts`（5 例）

## 测试

- `npm test`：90 suites / 741 tests 通过
- `npx playwright test tests/e2e/gui/html-block.spec.ts`：5/5；回归 4 个 spec：8/8
- README 全篇滚动扫描：5 张卡 / 5 个 details / 泄漏 0

## 沉淀

- `AGENTS.md`：§9 4b 修订（注释在预处理阶段清空，不依赖 `html:true` 表现）、新增 4b2（原生 HTML 白名单
  放行四条硬约束）、4b3（HTML 块 widget）；模块职责表与 §5.2 core API 补 `html.ts` / `sanitizeHtml`。

## 遗留

- 待用户补 README 头部与 details 展开态截图（见任务 P6 清单）。

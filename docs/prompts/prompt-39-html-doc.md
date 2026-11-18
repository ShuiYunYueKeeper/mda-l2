# P4 迭代记录 — HTML 文档只读整页预览

> 日期：2026-11-18  
> 档位：T3  
> 用户实机：✅ 已验证（用户指示整理入库）

## 需求

用户提出「支持打开 html 文档」。澄清后确认：只读渲染预览（等价浏览器观感、保留内嵌 CSS、禁脚本），不做 HTML 批注，不进入 Markdown 编辑/大纲链路。

## 方案

- 扩展名单独声明 `htmlExtensions`，GUI 用 `isOpenablePath` 统一打开入口；CLI/MCP 的行为不变。
- `<iframe sandbox="allow-same-origin">` + `src=file://`：不由应用解析/改写 HTML，样式与相对资源天然生效；不带 `allow-scripts` 使页面脚本无法执行。
- 打开 HTML 时切换 `htmlDoc` 文档态：隐藏 Markdown 预览/CM6/大纲/编辑栏，禁用保存、编辑、查找、批注、导出、AI 等入口（保留入口，仅禁用）。
- 页内链接经 `handleLinkClick`：`.md` / `.html` 回本应用，其余交系统浏览器。

## 改动

- core：`HTML_FILE_EXTENSIONS` / `isHtmlPath` / `isOpenablePath`
- main：打开对话框、文件树、启动参数与单实例改用 `isOpenablePath`
- preload：暴露 `htmlExtensions` / `openableExtensions` / `isHtmlPath` / `isOpenablePath`
- renderer：`html-view.js`（新增）、`openHtmlDocument`、只读守卫、CSP 与样式
- 测试：`config.test.ts` 新增用例、`html-doc.spec.ts`（3 用例）

## 测试

- `npm test`：90 suites / 742 tests 通过
- `npx playwright test tests/e2e/gui/html-doc.spec.ts`：3/3
- 真实样例截图抽检：iframe 铺满、样式完整、脚本未执行、控制台无错误

## 沉淀

- `AGENTS.md` §9 新增 4r：HTML 只读整页预览规范（sandbox、CSP、文档态、入口禁用、切回恢复）。
- `quality.md` 增加「HTML 文档只读预览」人工审核点。

## 遗留

- 待用户补 HTML 预览截图（见任务 P6 清单）。

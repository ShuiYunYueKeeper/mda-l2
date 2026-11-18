# P5 Changelog — HTML 文档只读整页预览

> 档位：T3（跨 core / main / preload / renderer，新增配置项与 preload 能力）
> 需求：用户「支持打开 html 文档」；澄清结论：只读渲染预览，不做 HTML 批注。

## 方案

- 扩展名不改 `fileExtensions`（CLI/MCP 仍只扫 Markdown），新增 `htmlExtensions` 与 `isOpenablePath`。
- 渲染用 `src/gui/renderer/html-view.js` 的 `<iframe sandbox="allow-same-origin">` 直接加载 `file://`：
  - 不授权 `allow-scripts`，页面脚本被浏览器阻止；
  - 保留内嵌 `<style>`、相对路径图片/样式，无需改写 HTML 或注入 `<base>`；
  - 同源 `contentDocument` 只用于拦截页内链接，不向文档注入能力。
- 文档态 `htmlDoc` + body `mda-html-doc`：隐藏 Markdown 预览、CM6 编辑面、大纲与编辑栏；
  Markdown 专属入口保留但禁用（`htmlReadonly` 提示），`dirty` 恒 false、不自动保存。
- CSP 增加 `frame-src 'self' file:`。

## 文件

- `src/config/annotation-schema.json`：`htmlExtensions: ["html","htm"]`
- `src/core/model.ts`：`HTML_FILE_EXTENSIONS`、`isHtmlPath`、`isOpenablePath`
- `src/gui/main.js`：打开对话框/文件树/单实例与启动参数改用 `isOpenablePath`
- `src/gui/main/i18n.js`：`openMdTitle` →「打开文档」、新增 `filterDoc`
- `src/gui/preload.js`：暴露 `htmlExtensions` / `openableExtensions` / `isHtmlPath` / `isOpenablePath`
- `src/gui/renderer/html-view.js`（新增）：iframe 挂载、`show`/`hide`、链接拦截
- `src/gui/renderer/app.js`：`openHtmlDocument`、文档态切换、13 处只读守卫、工具栏/加批注按钮状态
- `src/gui/renderer/index.html`：CSP、HTML 文档视图样式、脚本引入
- `src/gui/renderer/i18n.js`：`alertMdOnly` 含 HTML、`htmlReadonly`、帮助正文
- `scripts/copy-gui.js`：拷贝 `html-view.js`
- `README.md` / `AGENTS.md`：能力说明、preload API、§9 4r 隐性规范
- `quality.md`：测试体系、用例数/覆盖率、人工审核点

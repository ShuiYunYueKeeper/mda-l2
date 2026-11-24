# Microsoft Store 文案与关键词

> 商店条目：**Markdown工作台**（商店 ID `9NHCDVGK8BVL`）。
> 提交流程、包身份、认证注意事项见 [docs/microsoft-store.md](../microsoft-store.md)，本文件只负责「搜索与转化」这一层。
> 字段上限以合作伙伴中心表单实时计数为准；下面每条都留了余量。

## 1. 现状与目标

| 项 | 现状 | 目标 |
|----|------|------|
| 商店名称 | Markdown工作台 | 保留（「MDA」已被占用） |
| 价格 | 免费 | 不变 |
| 搜索词 | Markdown、编辑器、批注、预览、笔记 | 补「导出 / 审阅 / 本地」等意图词 |
| 关键字 | Markdown、编辑器、批注、预览、笔记、本地、写作 | 换成「差异化 + 场景」组合 |
| 简介 | 通用描述 | 首句说清「批注写进文件、免费、文件留在本机」 |

商店搜索的权重集中在**应用名、搜索词、关键字、简短描述**。描述正文主要影响转化，不影响排序，所以别把关键词硬塞进正文。

## 2. 简体中文

| 字段 | 建议文案 | 说明 |
|------|----------|------|
| 短标题 | Markdown工作台 | 与保留名称一致，不改 |
| 搜索词（逐个输入） | Markdown、批注、Markdown编辑器、导出Word、审阅、本地、免费 | 7 条；覆盖「工具名 + 场景 + 差异点」 |
| 关键字 | Markdown、批注、审阅、导出Word、Markdown转PDF、本地、免费 | 7 条，每条 ≤40 字符 |
| 简短描述 | 本地优先的 Markdown 工作台：预览内直接编辑，批注写进文件本身，导出 Word / PDF / 公众号。完全免费，文件留在本机。 | ≤200 字符，首句给差异点 |
| 说明（首段） | 收到一个 Markdown 文件，想看懂、改几句、留下具体意见，再交付成对方要的格式——MDA 就是为这条链路做的。它把批注以标准注释写进 `.md` 文件本身：预览时不可见，随文件进 git，不需要额外的批注数据库。 | 先讲场景，再讲机制 |
| 说明（功能段） | · 打开即预览：CommonMark + GFM 表格、Mermaid 流程图、KaTeX 公式<br>· 预览内直接编辑，也可切源码模式<br>· 段落 / 选区批注，四级颜色，可标记 open / resolved / wontfix<br>· 导出 HTML、PDF、Word，复制为公众号富文本<br>· 文件树、大纲、查找替换、自动保存、深色模式、中英界面<br>· 附 CLI（mda-cli）与 MCP（mda-mcp），Agent 可读写批注 | 与产品事实一一对应，别加未实现项 |
| 说明（免费段） | 完全免费：没有账号、没有激活码、没有 AI 付费入口，也不会上传你的文档。 | 3.1.0 事实 |
| 此版本的新增功能 | 首个商店版本：完全免费，打开、预览、批注、导出与 MCP 全部可用。 | 按实际版本改 |
| 版权 | © 2026 MDA | |
| 许可条款 | 本应用按 MIT 许可证提供。文档归用户所有。 | |
| 隐私政策 URL | https://github.com/ShuiYunYueKeeper/mda-l2/blob/master/docs/privacy.md | 必须可公开访问 |

## 3. English (United States)

| Field | Copy | Note |
|-------|------|------|
| Short title | Markdown Workbench | Keep the reserved name |
| Search terms | Markdown, Markdown editor, annotation, comments, export to Word, offline, free | 7 terms |
| Keywords | Markdown, annotation, comments, review, export to Word, PDF, offline | 7 terms, ≤40 chars each |
| Short description | A local-first Markdown workbench: edit in preview, keep comments inside the file, export to Word / PDF / WeChat. Free, and your files stay on your PC. | ≤200 chars |
| Description (opening) | When someone sends you a Markdown file, you need to read it, make a few edits, leave specific comments, and return it in the format they asked for. MDA is built for that loop. Comments are written into the `.md` file itself as standard link-reference comments: invisible when rendered, versioned with git, no sidecar database. | Scenario first |
| Features | · CommonMark + GFM tables, Mermaid diagrams, KaTeX math<br>· Edit directly in preview, or switch to source mode<br>· Paragraph and selection comments with four severity levels and open / resolved / wontfix<br>· Export HTML, PDF, Word, or rich text for WeChat<br>· File tree, outline, find & replace, autosave, dark mode, Chinese/English UI<br>· CLI (`mda-cli`) and MCP (`mda-mcp`) for agent workflows | No unshipped claims |
| Free note | Completely free: no account, no activation key, no AI upsell, and your documents are never uploaded. | |
| What's new | First Store release: completely free, with opening, preview, comments, export, and MCP available out of the box. | |
| Copyright | © 2026 MDA | |
| License terms | Provided under the MIT License. Your documents remain yours. | |

## 4. 截图文案

商店最多可放 10 张，建议 5 张，顺序按「一眼看懂 → 差异点 → 交付」：

| # | 文件 | 画面 | 叠加文案（中 / 英） |
|---|------|------|---------------------|
| 1 | `docs/screenshots/v3/01-preview-edit.png` | 三栏预览 + 编辑 | 打开就能读，预览里直接改 / Read it, then edit it in place |
| 2 | `docs/screenshots/v3/02-anno-panel.png` | 批注面板与色条 | 批注写进文件，渲染看不见 / Comments live in the file, invisible when rendered |
| 3 | `docs/screenshots/v3/09-mermaid-code.png` | Mermaid + 代码块 | 流程图、公式、表格都能渲染 / Diagrams, math, and tables render natively |
| 4 | 导出现场截图（需补） | 导出 Word / PDF 对话框 | 交付成对方要的格式 / Export to Word, PDF, or WeChat |
| 5 | `docs/screenshots/v3/13-dark-mode.png` | 深色模式 | 深色模式，长时间读也不累 / Dark mode for long reviews |

截图要求：桌面截图 ≥1366×768，16:9 或更高；不要出现真实姓名、客户文档、未公开路径；每张只讲一件事。

## 5. 分类、定价、合规

- 分类：生产力（Productivity）；次分类可选「开发人员工具」，但不要两边都选。
- 定价：免费，所有市场同价，不填内购。
- 年龄分级：无用户生成内容、无社交、无广告，按问卷如实填写。
- 隐私：只读写用户主动打开的文件；不联网上传文档（导出与预览均在本机）。
- 系统要求：Windows 10 1809+ / Windows 11，x64。
- 支持语言：`zh-CN`、`en-US`。

## 6. 提交后检查

1. 在商店网页与客户端各搜一次：`Markdown工作台`、`Markdown 批注`、`Markdown 导出`。
2. 确认搜索结果里图标、短标题、简短描述没有被截断。
3. 用未登录账号看一次详情页（排除缓存）。
4. 记录 7 天 / 30 天获取量，回填到 [README.md](README.md) §6 的度量表。

# MDA 可发现性执行手册

> 目标：当有人用「Markdown 批注」「Markdown 导出 Word」「Markdown MCP」这类**具体需求**搜索时，
> 能在 GitHub、搜索引擎、AI 回答、软件商店里遇到 MDA，并愿意点进来。
>
> 本目录只放「怎么被找到」，不重复产品文档。改动记录随代码一起提交。

## 1. 先认清现实

- `markdown` 这个单词是红海：Typora、Obsidian、VS Code、Notion 等占据首页，新项目短期内抢不到，也不该把预算押在它上面。
- 能赢的是**长尾 + 场景词**：用户不是搜「markdown」，而是搜「markdown 怎么加批注」「markdown 转 word 排版乱」「有没有能审阅 md 的工具」。
- 可发现性不是单点，是**同一套事实在多个入口重复出现**：GitHub description/topics/README、Pages 落地页、商店条目、awesome list、AI 可读的 `llms.txt`。
- 所有文案必须与产品事实一致：本地优先、免费、MIT、批注写进文件、CLI/GUI/MCP、Windows 提供安装包（macOS/Linux 可源码构建）。夸大一次，长期信任就没了。

## 2. 关键词矩阵

按「意图明确度 × 竞争度」排序，优先级 P0 先做。

| 优先级 | 中文词 | 英文词 | 用户真正想解决的事 | 主要落点 |
|--------|--------|--------|--------------------|----------|
| P0 | markdown 批注、md 批注工具、markdown 审阅 | markdown annotation, annotate markdown, markdown comments, markdown review tool | 给 `.md` 留具体意见，且不想污染正文 | README 首段 + H2、GitHub topics、站点 title/H1/FAQ、awesome-markdown |
| P0 | markdown 导出 word、markdown 转 pdf、markdown 复制公众号 | markdown to docx, markdown to pdf, markdown to wechat | 写完要交付成对方要的格式 | README 功能表、站点功能卡、商店描述 |
| P0 | markdown mcp、markdown mcp server | markdown mcp server, model context protocol markdown | 让 Agent 读取/修改文档与批注 | README MCP 段、`llms.txt`、awesome-mcp-servers、MCP 目录 |
| P1 | markdown 编辑器 免费、本地 markdown 编辑器 | free markdown editor, local-first markdown editor, offline markdown editor | 不想订阅、不想上传 | 站点 FAQ、商店关键字、AlternativeTo |
| P1 | markdown 预览 编辑、所见即所得 markdown | markdown wysiwyg, edit markdown in preview | 预览里直接改，不来回切屏 | README 对比表、站点 hero |
| P1 | electron markdown 编辑器 | electron markdown editor | 找桌面端、跨平台 | GitHub topics、awesome-electron |
| P2 | markdown 编辑器（大词） | markdown editor | 泛需求 | 只做长期占位：README 标题、topics，不指望首页 |
| P2 | commonmark、gfm 预览 | commonmark viewer, gfm preview | 兼容性验证 | README 技术栈、FAQ |
| P2 | markdown 笔记、markdown 文档管理 | markdown notes | 泛需求，非核心 | 商店关键字（弱） |

使用规则：

- 一个页面只主打 1–2 个词，别把矩阵全塞进 title。
- GitHub topics 固定 20 个（见 `scripts/setup-github-discovery.mjs`），前 5 个是 `markdown`、`markdown-editor`、`markdown-viewer`、`markdown-preview`、`markdown-annotation`。
- 站点每页有唯一 `title`、`description`、唯一 H1；中英文页互相 `hreflang`。
- 不要在 README 里堆关键词列表，GitHub 会判低质；关键词要长在句子里。

## 3. 入口清单

| 入口 | 谁在维护 | 本仓库对应文件 | 状态 |
|------|----------|----------------|------|
| GitHub 仓库元数据（description / homepage / topics） | 维护者 | `scripts/setup-github-discovery.mjs` | 需 token 执行，见 §5 |
| GitHub README（中/英） | 维护者 | `README.md`、`README.en.md` | 已完成首版，随版本更新 |
| GitHub Pages 落地页 | 维护者 | `site/`、`.github/workflows/pages.yml` | 需在 Settings → Pages 启用 |
| 社交预览图 | 维护者 | `site/assets/og.png`（1280×640） | 需在 Settings → Social preview 上传 |
| AI / 爬虫可读摘要 | 维护者 | `site/llms.txt`、`site/robots.txt`、`site/sitemap.xml` | 已就绪 |
| awesome list | 社区 PR | 文案见 [awesome-lists.md](awesome-lists.md) | 待提交 |
| Microsoft Store | 维护者 | 文案见 [store-listing.md](store-listing.md)，流程见 `docs/microsoft-store.md` | 商店条目已存在（9NHCDVGK8BVL），文案待更新 |
| 社区发布 | 维护者 | 文案见 [launch-kit.md](launch-kit.md) | 待排期 |
| MCP 目录（Glama / mcp.so / Smithery / PulseMCP） | 维护者 | [launch-kit.md](launch-kit.md) §MCP 目录 | 待提交 |
| AlternativeTo | 维护者 | [launch-kit.md](launch-kit.md) | 待提交 |

## 4. 90 天计划

**第 1 周：地基**

1. 执行 `node scripts/setup-github-discovery.mjs --apply`（需 token），确认 topics 为 20 个、homepage 指向 Pages。
2. Settings → Pages → Source 选 **GitHub Actions**，手动跑一次 `Deploy site`，确认 `https://shuiyunyuekeeper.github.io/mda-l2/` 与 `/en/` 可访问。
3. Settings → Social preview 上传 `site/assets/og.png`。
4. 用无痕窗口检查分享卡片：GitHub、X/Twitter、微信、Slack 各贴一次链接看预览。

**第 2 周：目录与商店**

1. 按 [awesome-lists.md](awesome-lists.md) 依次提交 3–4 个 list（一次只提一个，等合并再下一个）。
2. 按 [store-listing.md](store-listing.md) 更新商店搜索词与描述，重新提交认证。
3. 提交 MCP 目录（Glama、mcp.so 优先），保证 `mcp` 配置示例可直接复制。

**第 3 周：内容首发**

1. 写一篇「为什么把批注写进 Markdown 文件本身」的技术文（CM6 装饰层 + 源文件保护），发掘金/少数派，而不是硬广。
2. V2EX「分享创造」发一次，附截图与免费说明。
3. Reddit：r/markdown 或 r/opensource 选一个，Show 帖；隔周再考虑第二个。

**第 4 周：复盘与长尾**

1. 看 GitHub Insights → Traffic：views / clones / referrers，记录到 §6。
2. 针对带来点击最多的 2 个词，补一条 FAQ 或一段 README 小标题。
3. 给 3 个真实使用场景各写 200 字（审阅 AI 方案、给同事留意见、公众号交付），放进站点或 README，供搜索命中。

**第 2–3 个月：稳定供给**

- 每两周一次「小更新」：Release notes、对比文档、常见问题。
- 每月检查一次 topics 与 description 是否仍匹配（版本、平台、免费策略变化时必改）。
- 有真实用户提问就当 FAQ 素材，不删问题。

## 5. 应用 GitHub 元数据

```powershell
# 只读预览（不会改仓库）
node scripts/setup-github-discovery.mjs

# 写入 description / homepage / topics
$env:GITHUB_TOKEN = "ghp_xxx"   # classic PAT，勾选 repo
node scripts/setup-github-discovery.mjs --apply
```

- description 已中英双语，控制在 350 字符内。
- topics 固定 20 个；GitHub 会把前几个用于「相关主题」推荐。
- 仓库主页右侧的 About 还支持填写 **Topics** 与 **Homepage**，脚本写入后刷新即可看到。
- 社交预览图必须在网页端上传，API 不提供该能力。

## 6. 度量与复盘

每月记录一次，连续三个月才能看出趋势：

| 指标 | 来源 | 基线 | 30 天 | 60 天 | 90 天 |
|------|------|------|-------|-------|-------|
| 仓库 views（unique） | Insights → Traffic | 待填 | | | |
| 仓库 clones（unique） | Insights → Traffic | 待填 | | | |
| Stars | 仓库首页 | 待填 | | | |
| Issues / Discussions 新增 | 仓库 | 待填 | | | |
| Pages 访问（如接入统计） | 自建统计或 Search Console | 待填 | | | |
| 商店获取量 | Partner Center | 待填 | | | |
| 搜索命中词（前 5） | Search Console / 商店后台 | 待填 | | | |

复盘只问三个问题：哪个入口带来的人最愿意留下（star/issue/下载）？哪个词带来了错误人群？下个月只改一件事，改什么？

## 7. 禁忌

- 不买 star、不刷下载、不群发「求 star」。
- 不在不相关的仓库/Issue 里贴链接（会被举报，也会毁掉后续 PR 的可信度）。
- 不堆关键词：description、README、商店描述都要像人话。
- 不承诺没有的能力（AI 改写、云同步、协作）；3.1.0 是免费版，没有 AI 与 Pro 入口。
- awesome list 一次只提一个，被拒先读 contributing，不反复骚扰维护者。

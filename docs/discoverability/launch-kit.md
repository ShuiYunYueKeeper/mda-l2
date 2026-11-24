# 发布与渠道工具包

> 用法：每个渠道只发一次，发之前读版规；同一周不要连发三个社区。
> 所有文案以「解决什么问题」开头，不以「我很努力做了个东西」开头。

## 0. 素材包（发之前先备齐）

- 一句话（中）：本地优先的 Markdown 工作台：预览内直接编辑，批注写进文件本身，导出 Word / PDF / 公众号，附 CLI 与 MCP。
- 一句话（英）：A local-first Markdown workbench that keeps review comments inside the `.md` file, edits in preview, and exports to Word / PDF / WeChat — with CLI and MCP.
- 三条差异点：
  1. 批注是标准 Markdown 注释，渲染不可见，随文件进 git，不需要 sidecar 或数据库。
  2. 预览里直接改，不用在「读」和「写」两个模式之间来回切。
  3. 交付链路完整：Word / PDF / 公众号，另附 CLI 与 MCP，Agent 能接手。
- 链接：仓库 `https://github.com/ShuiYunYueKeeper/mda-l2`，站点 `https://shuiyunyuekeeper.github.io/mda-l2/`，Releases `.../releases/latest`。
- 图：`site/assets/og.png`（分享卡）、`docs/screenshots/v3/01-preview-edit.png`（主图）、`02-anno-panel.png`（差异点）。
- 许可与价格：MIT、完全免费、无账号、无遥测上传。

## 1. 渠道与文案

### V2EX · 分享创造

- 受众：中文开发者、独立开发者，接受「自己做的工具」，反感硬广。
- 标题：`[分享] 做了一个把批注写进 Markdown 文件本身的工具`
- 正文骨架：

```markdown
做这个的起因很简单：同事发来一个 .md 让我提意见，我改完正文发回去，对方不知道我改了哪儿；
用 Word 批注又得先转格式，转完排版还乱。

所以做了 MDA：批注用标准 Markdown 注释写在段落上方，预览时不可见，文件本身就能带着意见走，
git diff 里也看得见。除了批注，还有预览内直接编辑、Mermaid/KaTeX、导出 Word/PDF/公众号，
以及 CLI 和 MCP（Agent 可以直接读写批注）。

完全免费、MIT、Windows 安装包（macOS/Linux 可源码构建）。截图和下载在 GitHub：
https://github.com/ShuiYunYueKeeper/mda-l2

想听两类反馈：批注的定位方式够不够用；导出 Word 的样式还缺什么。
```

- 注意：放在「分享创造」节点；附 2–3 张图；不要一上来贴下载直链；有人提问当天回。

### 掘金 / 少数派 · 技术文

- 不发产品广告，发**实现文章**，文末一句带过项目。
- 选题（选一个写透）：
  1. 「批注为什么必须写进 Markdown 文件：从 sidecar 到 link reference definition」
  2. 「在 CodeMirror 6 的预览模式里做块级 widget：表格、代码、Mermaid 的取舍」
  3. 「源文件保护：只允许改批注行的写入管线怎么设计」
- 结构：真实问题 → 失败方案 → 约束 → 最终设计 → 代价（没做什么）→ 项目链接。
- 掘金标题示例：`Markdown 批注工具的设计取舍：为什么把意见写进文件本身`
- 少数派偏体验与工作流，标题示例：`收到 Markdown 文件之后：读、改、批注、交付的一条链路`

### 知乎

- 只回答真实问题，不自己提问题自答。
- 可答类型：「有哪些好用的 Markdown 编辑器？」「Markdown 怎么加批注？」「Markdown 转 Word 排版乱怎么办？」
- 回答结构：先给通用结论（2–3 个客观选项），再说「如果你需要 X，我用的是 MDA」，最后放仓库链接。
- 必须声明是作者，不装普通用户。

### Reddit

- 先读目标 sub 的 self-promotion 规则；优先 `r/markdown`、`r/opensource`、`r/electronjs`，一次一个。
- 标题：`MDA – a local-first Markdown workbench that keeps review comments inside the .md file`
- 正文：

```markdown
I built this after too many rounds of "here's a Markdown file, please review it" where the comments
ended up in Slack or a separate doc.

MDA writes comments into the file as standard link-reference definitions, so they're invisible when
rendered, survive in git, and don't need a sidecar database. It also edits in preview, renders
Mermaid/KaTeX, exports to Word/PDF, and ships a CLI plus an MCP server.

Free, MIT, Windows installer (macOS/Linux build from source). Repo: https://github.com/ShuiYunYueKeeper/mda-l2

Happy to hear where the annotation model breaks down for your workflow.
```

- 注意：不要多个 sub 同天发；不要用新账号；被质疑「又一堆 AI 生成代码」时给具体提交/测试证据，不争吵。

### Hacker News · Show HN

- 一次性机会，挑工作日美西上午（北京时间 21:00–24:00）。
- 标题：`Show HN: MDA – Markdown comments that live inside the file`
- 正文：3 段以内，讲问题、机制、限制；链接直接给仓库或 Pages。
- 准备回答：为什么不用 CriticMarkup、怎么处理冲突、为什么 Electron、和 Obsidian 插件的关系。

### Product Hunt

- 需要 3 张以上高质量图、一句 tagline、一段 260 字以内描述、首个评论。
- Tagline：`Markdown review comments that stay inside the file`
- 首个评论讲动机与一个真实使用场景，不放折扣码（本来也免费）。

### MCP 目录

| 目录 | 提交入口 | 需要准备 |
|------|----------|----------|
| Glama | https://glama.ai/mcp/servers（提交仓库） | 可运行的 `mcp.json`、README 里的工具表 |
| mcp.so | https://mcp.so/submit | 名称、描述、仓库、安装命令 |
| Smithery | https://smithery.ai（提交 server） | `smithery.yaml` 或等价配置、启动命令 |
| PulseMCP | https://www.pulsemcp.com/submit | 同上 |

统一描述：

```text
MDA MCP server — scan, add, edit, and remove in-file Markdown annotations, read files, and export review prompts from a local workspace. stdio transport, six tools, no network calls.
```

提交前自测（干净目录）：

```bash
npm install
npm run build
MDA_WORKSPACE=/path/to/docs npx mda-mcp
```

确认 `mda_scan`、`mda_add`、`mda_edit`、`mda_remove`、`mda_read_file`、`mda_export_review_prompt` 六个工具都能列出。

### AlternativeTo

- 作为 Typora / Obsidian / VS Code 的替代品提交，选「Open Source」「Windows」「macOS」「Linux」。
- 描述只写差异：in-file comments、export、CLI/MCP。不要贬低竞品。

### 国内开源镜像

- Gitee 镜像仓库 +「开源中国」项目页，可提升中文搜索命中；同步 Releases 链接。
- 镜像只做只读同步，Issue 仍引导到 GitHub，避免两套问题追踪。

## 2. 发布节奏

| 周 | 动作 | 目的 |
|----|------|------|
| 1 | 元数据 + Pages + 社交预览图 | 让所有链接有落点 |
| 2 | awesome list 第 1 个 + 商店文案 | 拿到第一批稳定外链 |
| 3 | 技术文 1 篇 + V2EX | 中文圈首次曝光 |
| 4 | Reddit 或 HN（二选一）+ MCP 目录 | 英文圈与 Agent 用户 |
| 5+ | 每两周一篇小文 / 一次 Release note | 维持搜索新鲜度 |

同一个内容不要原样跨平台群发：V2EX 口语、掘金技术、Reddit 英文、知乎问答，各写各的。

## 3. 回应与复盘

- 24 小时内回复所有实质提问；「已读」也要回一句。
- 把重复问题写进 README FAQ 或站点 FAQ，下次直接给链接。
- 记录每个渠道带来的 GitHub referrer（Insights → Traffic），30 天后只保留前两名继续投入。
- 负评只回事实：不争论审美，不删帖，不组织控评。

## 4. 禁忌

- 不买 star / 下载 / 评论；不拉群刷「求 star」。
- 不在别人的 Issue、PR、视频评论区贴链接。
- 不冒充用户自问自答；不写「全网最好用」。
- 不承诺路线图里没有的能力（云同步、多人协作、AI 改写）。

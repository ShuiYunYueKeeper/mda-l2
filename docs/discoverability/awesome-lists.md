# Awesome List 提交清单

> 目标不是「进更多列表」，而是**被正确的人看到**。以下列表按优先级排序，一次只提一个。
> 条目格式以各仓库当时的 `contributing` 与相邻条目为准；本文件给的是可直接粘贴的底稿。

## 1. 提交顺序与状态

| 顺序 | 列表 | 目标章节 | 提交方式 | 状态 | 备注 |
|------|------|----------|----------|------|------|
| 1 | [mansucache/awesome-markdown](https://github.com/mansucache/awesome-markdown) | Markdown Editors and Readers | Issue（模板） | 待提交 | 活跃维护，最相关 |
| 2 | [sindresorhus/awesome-electron](https://github.com/sindresorhus/awesome-electron) | Apps → Open Source → Other | PR | 待提交 | 要求条目简洁，按字母序放入 |
| 3 | [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | 📂 File Systems | PR | 待提交 | 需要能跑通的 stdio 配置 |
| 4 | [mundimark/awesome-markdown-editors](https://github.com/mundimark/awesome-markdown-editors) | 待核实 | PR | 待核实 | 仓库路径/默认分支可能已变，先读 README 再动 |

提交后用这个表跟踪：`待提交 → 已提 PR/Issue（附链接）→ 已合并 / 被拒（原因）`。

## 2. awesome-markdown

**条目底稿（中文，放在 `### Markdown Editors and Readers`）：**

```markdown
- [MDA](https://github.com/ShuiYunYueKeeper/mda-l2) - 本地优先的 Markdown 工作台：预览内直接编辑，把结构化批注以标准注释写进文件本身（渲染不可见、可随 git 版本管理），导出 Word / PDF / 公众号，并提供 CLI 与 MCP。<br>
  <span>`Open source` · `Windows` · `macOS` · `Linux`</span>
```

**英文备选：**

```markdown
- [MDA](https://github.com/ShuiYunYueKeeper/mda-l2) - Local-first Markdown workbench: edit directly in preview, keep structured comments inside the `.md` file as standard link-reference comments (invisible when rendered, git-friendly), export to Word / PDF / WeChat, with CLI and MCP.<br>
  <span>`Open source` · `Windows` · `macOS` · `Linux`</span>
```

**提交时：**

- 先读仓库根目录 `contributing.md`（或 `.github/CONTRIBUTING.md`）与已有条目格式，确认是否要求英文、是否允许 `<br>` 与平台标签。
- 描述只写**差异点**，不要写「功能强大、体验优秀」这类空话。
- PR 标题：`Add MDA — local-first Markdown workbench with in-file comments`。
- PR 正文一句话说明「为什么它不同于列表里已有的编辑器」，附仓库链接与许可证（MIT）。

## 3. awesome-electron

**条目底稿（英文，放在 `### Other`，按字母序）：**

```markdown
- [MDA](https://github.com/ShuiYunYueKeeper/mda-l2) - Local-first Markdown workbench with in-preview editing, in-file annotations, Word/PDF/WeChat export, CLI and MCP.
```

**注意：**

- 该列表只收**开源**且确实基于 Electron 的应用；MDA 满足（MIT、Electron ^31.1）。
- 条目通常只有一行，不要加徽章、截图或第二行。
- 放进 `## Apps` → `### Open Source` → `###### Other`，不要放进 `### Closed Source`。
- 若维护者要求先有 Release 安装包，确认 Releases 里已有 3.1.0 的 Windows 产物；macOS / Linux 目前需源码构建，条目里不要暗示有现成安装包。

## 4. awesome-mcp-servers

**条目底稿（英文，放在 `📂 File Systems` 或 `🛠️ Developer Tools`）：**

```markdown
- [ShuiYunYueKeeper/mda-l2](https://github.com/ShuiYunYueKeeper/mda-l2) 📇 🏠 🍎 🪟 🐧 - Markdown workbench MCP server: scan, add, edit, and remove in-file annotations; read and export review prompts from a local workspace.
```

**可选徽章（仅当目录确实收录后再加）：**

```markdown
[![MDA MCP server](https://glama.ai/mcp/servers/ShuiYunYueKeeper/mda-l2/badge)](https://glama.ai/mcp/servers/ShuiYunYueKeeper/mda-l2)
```

- 图例：`📇` = TypeScript，`🏠` = Local，`🍎/🪟/🐧` = macOS/Windows/Linux。
- 该列表对「能本地跑通」要求较严：提交前用干净环境按 README 的 MCP 配置启动一次，确认六个工具都列得出来。
- 若被要求提供 `glama.json` 或 `server.json`，先补到仓库再提。

## 5. mundimark/awesome-markdown-editors

先确认三件事再写条目：

1. 默认分支是 `master` 还是 `main`；
2. 列表是 `README.md` 还是 `readme.md`（大小写敏感）；
3. 条目是否要求「免费/开源/跨平台」三列标记。

确认后按相邻条目格式追加，描述一句话即可。若仓库已归档或长期不维护，跳过，不要浪费 PR。

## 6. PR / Issue 模板

**标题：**

```
Add MDA — local-first Markdown workbench with in-file annotations
```

**正文：**

```markdown
### What

MDA is a local-first Markdown workbench (MIT, Electron + TypeScript) that writes structured review comments into the `.md` file itself as standard link-reference comments, so they stay invisible when rendered and travel with the file in git. It also exports to Word / PDF / WeChat and ships a CLI and an MCP server.

- Repo: https://github.com/ShuiYunYueKeeper/mda-l2
- Site: https://shuiyunyuekeeper.github.io/mda-l2/
- Platforms: Windows / macOS / Linux
- License: MIT

### Why it fits this list

It is not another notes app or a cloud editor: it targets the "someone sent me a Markdown file, I need to read it, leave specific comments, and return a Word/PDF" workflow.

### Checklist

- [ ] Entry follows the existing format and section
- [ ] Description is one sentence, no marketing adjectives
- [ ] Link points to the repository (not a landing page)
```

## 7. 禁忌

- 不批量 @ 维护者、不在多个 list 同一天连提。
- 被拒先问原因；若是「不够独特」，把差异点补进 README 再等一段时间。
- 不伪造 star、不买榜、不写「awesome」类自吹文案。
- 条目里的平台标记必须真实：当前 Releases 只提供 Windows x64 安装包 / 便携版 / zip；macOS / Linux 可源码构建，不要写成已提供安装包，也不要写「全平台完美」。

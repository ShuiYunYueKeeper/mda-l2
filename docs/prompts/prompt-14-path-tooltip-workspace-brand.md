# Prompt 14 — 全路径悬停提示与「Markdown 工作台」定位

> 接续 `prompt-13-zoom-copy.md`  
> 日期：2026-07-17  
> 状态：代码已落地；本文档为 P4 Step 5 归档

---

## Prompt 38: 文件列表 / 最近打开悬停显示全路径

```
用户: 文件列表和最近打开文件，hover上去后显示全路径（之前仅显示文件名）
```

AI 动作：

- 文件侧栏行 `title` 改为 `node.path`；右键「拷贝文件名」仍用 `basenamePath`。
- 欢迎页最近列表项增加 `title=全路径`（列表内路径截断时仍可看全）。
- 菜单「最近文件」：macOS 用 `toolTip`；Windows/Linux 无菜单 tooltip，标签为 `文件名 — 全路径`。

---

## Prompt 39: 产品副标题改为「Markdown 工作台」

```
用户: MDA — Markdown 批注管理工具，标题不太适用了 → 选方案 C
```

AI 动作：

- 对外定位：**MDA — Markdown 工作台**（预览 · 编辑 · 批注 · 文件）。
- 同步：欢迎页 / 帮助 i18n、README、`package.json`、CLI/MCP 描述、AGENTS 背景、`samples/demo.md`。
- 历史 P0–P3 命题名保留；窗口标题仍为 `MDA` / `MDA - 文件名`。

---

## Step 5 文档同步（本轮）

| 文档 | 更新内容 |
|------|----------|
| `docs/prompts/prompt-14-*.md` | 本文件 |
| `README.md` / `AGENTS.md` | 工作台定位 |
| `docs/README.md` | 索引 prompt-14 |

> 未纳入：`l2-project-template/`、skills 脚本、无关 `dist/cli/commands/scan.*`。

# Prompt 15 — 导出 Word、自动保存与欢迎页叙事

> 接续 `prompt-14-path-tooltip-workspace-brand.md`  
> 日期：2026-07-20  
> 状态：代码与用户实机验证已通过；本文档为 P4 Step 5 归档

---

## Prompt 40: 导出 Word / 自动保存 / 欢迎页叙事

```
用户确认计划：导出 Word · 自动保存 · 欢迎页叙事（MCP 增强本轮不做）
```

AI 动作：

### 导出 Word
- 依赖 `html-to-docx`；IPC `export-docx`；菜单「导出 Word」；复用 `buildExportHtmlContent()`。
- i18n：`menuExportDocx` / `exportDocxTitle` / `alertExportNoDocx`（zh+en）。

### 自动保存
- `localStorage` 键 `mda-autosave`：`off` | `blur` | `interval:30` | `interval:60`（默认 `off`）。
- 菜单「文件 → 自动保存」四选一 radio；主进程 `autosavePref` 与渲染层同步。
- `writeToPath(..., { quiet: true })`：成功无弹窗；失败 toast；坏批注跳过；未命名不自动 Save As。

### 欢迎页叙事
- `welcomeLead` + 新增 `welcomePitch`（AI 产出的 md → 打开/轻改/批注/导出/Agent）。
- 行业背景文案已写入 AGENTS/README（与 L2-QA Markdown 笔记叙事对齐，强调本地优先差异化）。

---

## 验证清单（用户实机 ✅）

| 项 | 结果 |
|----|------|
| Word 导出并用 WPS/Word 打开 | ✅ |
| 自动保存：关 / 失焦 / 间隔 | ✅ |
| 欢迎页叙事（中英） | ✅ |

---

## Step 5 文档

| 文档 | 内容 |
|------|------|
| 本文件 | 协作记录 |
| README / AGENTS / quality | 功能与审核点 |
| docs/README.md | 索引 |
| screenshots | Word 导出建议补图，暂不强制 |

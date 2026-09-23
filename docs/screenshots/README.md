# GUI 截图与录屏清单

> 本目录存放 MDA GUI 交付截图，供 `README.md` 与软著说明书引用。
> **`v3/` 由自动化采集，不要手工替换旧文件顶替。**

---

## 采集方式

```bash
# 须先关掉本机已开的 MDA（单实例锁）
$env:MDA_CAPTURE='1'
npx playwright test tests/e2e/capture/docs-screenshots.spec.ts
```

脚本启动真实 Electron，打开临时工作区中的 `samples/review-demo.md`（批注由 `scripts/seed-review-demo-annos.js` 预置），逐场景写入 `docs/screenshots/v3/`。改版后重跑即可整组刷新。

工作区须带 `workspace-prefs.json` 才能截到文件侧栏。

---

## v3 · 当前界面（2026-09-23 刷新）

| 文件 | 内容 | README |
|------|------|--------|
| `v3/01-preview-edit.png` | 预览编辑主界面 | ✅ |
| `v3/02-anno-panel.png` | 批注面板与段落色条 | ✅ |
| `v3/02b-anno-panel-detail.png` | 批注条目细节 | — |
| `v3/03-anno-selection.png` | 选区批注 | ✅ |
| `v3/04-toolbar-tip.png` | 工具栏悬浮提示 | — |
| `v3/05-insert-menu.png` | 插入菜单 | ✅ |
| `v3/06-find-highlight.png` | 查找命中 | ✅ |
| `v3/07-replace-bar.png` | 替换栏 | — |
| `v3/08-table-edit.png` | 表格就地编辑 | ✅ |
| `v3/09-mermaid-code.png` | 流程图块 | ✅ |
| `v3/10-outline.png` | 大纲与当前标题 | ✅ |
| `v3/11-source-mode.png` | 源码模式 | ✅ |
| `v3/12-file-sidebar.png` | 工作区文件侧栏 | ✅ |
| `v3/13-dark-mode.png` | 深色模式 | ✅ |
| `v3/14-toolbar-closeup.png` | 工具栏特写 | ✅ |
| `v3/15-paragraph-select.png` | 段落样式下拉 | ✅ |
| `v3/16-anno-dialog.png` | 批注编辑对话框 | ✅ |
| `v3/16b-anno-dialog-detail.png` | 批注对话框细节 | — |
| `v3/17-anno-filters.png` | 批注筛选区 | — |
| `v3/18-clear-annos-confirm.png` | 清空全部批注确认 | ✅ |
| `v3/19-settings.png` | 设置对话框 | ✅ |
| `v3/19b-settings-detail.png` | 设置项细节 | — |
| `v3/20-help.png` | 帮助 | ✅ |
| `v3/20b-help-detail.png` | 帮助正文细节 | — |
| `v3/21-code-edit.png` | 代码块就地编辑 | ✅ |
| `v3/22-katex.png` | 数学公式 | ✅ |
| `v3/23-goto-line.png` | 跳转到行 | — |
| `v3/25-dark-source.png` | 深色 + 源码 | ✅ |
| `v3/26-zoom-overlay.png` | 流程图缩放遮罩 | ✅ |
| `v3/27-welcome.png` | 欢迎页 | ✅ |

`v3/24-outline-collapsed.png`：收起按钮仅 hover 出现，自动化不稳定，失败只告警不阻塞。

未在 README 引用的图仍用于软著说明书（`docs/demo/软著材料/`）；引用完整性由 `scripts/check-soft-copyright-pdf.js` 校验。

---

## 已移除（旧界面）

下列历史素材已删除，不再维护：`1.png`–`4.png`、`5-three-pane.png`–`9-zoom-overlay.png`、`10-welcome.png`–`17-mcp-tools.png`、`operation_demo.gif`。请一律改用 `v3/`。

---

## 暂不补充

| 建议文件 | 说明 |
|----------|------|
| 侧栏右键 / 冲突弹窗 / 语言切换 | 暂不强制 |
| 原生「文件 / 视图」菜单截图 | Electron 菜单栏自动化困难；能力见帮助截图 |
| Cursor MCP 配置示意 | 属外部 IDE，README 以文字配置示例为准 |
| 大纲收起窄栏 | 见上 `24` 采集说明 |

---

## 与工作流的关系

凡涉及 `src/gui/**` 且改动了用户可见界面：在 Step 5 重跑 `MDA_CAPTURE=1` 采集；或明确提示用户补拍后更新 `README.md` 引用。

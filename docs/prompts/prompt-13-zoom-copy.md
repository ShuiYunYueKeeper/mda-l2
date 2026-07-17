# Prompt 13 — 预览缩放层复制（图片 / 流程图源码）

> 接续 `prompt-12-outline-welcome-clear-list.md`  
> 日期：2026-07-17  
> 状态：代码与用户实机验证已通过；本文档为 P4 Step 5 归档

---

## Prompt 37: 缩放层支持复制

```
用户: 预览，点击图片/流程图支持复制，流程图复制为源码
```

AI 动作：

- 缩放遮罩工具栏增加「复制」；遮罩打开时 **Ctrl+C** 同效。
- **图片** → `clipboard.writeImage`（IPC `copy-clipboard-image`：`dataUrl` / `filePath`）。
- **流程图** → 复制 `data-mermaid-src` 文本（Mermaid 源码，非 PNG）。
- i18n：`zoomCopy` / `toastZoomCopiedImage` / `toastZoomCopiedMermaid` / `alertZoomCopyFail`（zh+en）；主进程 `errImageEmpty`。
- preload 暴露 `copyClipboardImage`；帮助文案同步说明。

---

## 验证

| 项 | 结果 |
|----|------|
| 点击图片缩放 → 复制 / Ctrl+C → 粘贴为图片 | ✅（用户实机） |
| 点击流程图缩放 → 复制 → 粘贴为 Mermaid 源码 | ✅（用户实机） |
| 缩放 +/- / 复位 / Esc 不受影响 | ✅ |

---

## Step 5 文档同步（本轮）

| 文档 | 更新内容 |
|------|----------|
| `docs/prompts/prompt-13-*.md` | 本文件 |
| `README.md` | 缩放复制说明；入库用户已补截图（10–17） |
| `AGENTS.md` | `copyClipboardImage`；4g 补充复制语义 |
| `quality.md` | 缩放遮罩审核点含复制 |
| `docs/few-shot-examples.md` | §17 流程图复制为源码 |
| `docs/screenshots/README.md` | 已补素材入库；其余暂不补 |
| `docs/README.md` | 索引 prompt-13 |

> 用户说明：已补充部分截图，其余（侧栏操作/冲突/语言/大纲收起等）暂不补充。

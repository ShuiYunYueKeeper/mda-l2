# Prompt 19 — Mermaid 暗黑全屏清晰度 / Timeline 连线 / 默认尺寸

> 接续 `prompt-18-settings-clear-annos.md`  
> 日期：2026-07-22  
> 状态：用户实机验证已通过；本文档为 P4 Step 5 归档

---

## Prompt：暗黑全屏 Mermaid 体验

```
大部分图在暗黑模式下，全屏预览都比较模糊，特别是文字
Timeline暗黑全屏模式的流程线颜色不一致
点开全屏模式默认图片太大了
（以上已验证）
```

### 实现摘要

- **模糊根因**：① 深色主题浅色字落在缩放层强制白底上（对比度差，观感像糊）；② 舞台 `transform: scale` 导致 SVG 文字栅格化。
- **矢量放大**：SVG 改 `width`/`height`；平移用舞台 `left`/`top`，禁止舞台 `scale`/`translate`/`will-change`。
- **深色底**：缩放层 SVG `#1e1e1e`；`neutralizeZoomSvgBg` 中和近白铺底 rect。
- **对比度**：`mermaidInitOptions` dark `themeVariables`；`tuneMermaidSvgContrast` / Sankey multiply 修复；`tuneTimelineConnectors` 统一 Timeline 虚线/轴线/箭头为 `#cbd5e1`（覆盖 `.section-N line` 分段色）。
- **默认尺寸**：全屏初始适配约 72%–75% 视口（原约 90%）。
- **样例**：`samples/mermaid-diagrams.md`（23 类语法全景）、`samples/katex.md` 补物理/化学/生物公式。

### 验证清单（用户实机 ✅）

| 项 | 结果 |
|----|------|
| 深色模式全屏 Sequence / Timeline / Journey 等文字清晰可读 | ✅ |
| Timeline 上下虚线与水平轴线颜色一致 | ✅ |
| 全屏默认尺寸不再铺满过大 | ✅ |
| 滚轮 / +/- 仍可放大；复制源码不受影响 | ✅（沿用既有能力） |

---

## Step 5 文档同步（本轮）

| 文档 | 更新内容 |
|------|----------|
| `docs/prompts/prompt-19-*.md` | 本文件 |
| `AGENTS.md` | §4g：矢量缩放、深色底、Timeline 统一色、默认 72%–75% |
| `quality.md` | 缩放遮罩 / 深色 mermaid 审核点 |
| `docs/few-shot-examples.md` | §10 增补深色全屏与 Timeline 正反例 |
| `docs/screenshots/README.md` | 待补：深色全屏 Timeline / 清晰缩放 |
| `docs/README.md` | 索引 prompt-19 |
| `samples/README.md` | `mermaid-diagrams.md` / `katex.md` |

---

## 待补截图清单（须用户实机补充）

| 建议文件名 | 拍摄要点 |
|------------|----------|
| `9c-zoom-dark-mermaid.png` | 深色主题下打开流程图全屏：深色底、文字清晰 |
| `9d-zoom-timeline-lines.png` | 深色全屏 Timeline：虚线/轴线同色可读 |

其余暂不强制；能力说明见 AGENTS §4g 与 `samples/mermaid-diagrams.md`。

# 演示样本（samples/）

独立的演示用 Markdown 样本，便于直接体验 CLI / GUI（与 `tests/samples/` 的测试夹具区分开）。

| 文件 | 用途 |
|------|------|
| `basic-gfm.md` | 常见 GFM 元素（标题/列表/表格/代码块/链接/引用）骨架 |
| `annotated-demo.md` | 含多级别、多状态、多标签的真实批注，演示面板筛选与双向定位 |
| `mermaid.md` | 四类 Mermaid 图（flowchart/sequence/class/state），GUI 中渲染为图形 |
| `all-features.md` | 综合演示：标题层级 + 图片（`assets/`）+ 流程图 + 代码块 + 批注，用于验证深色/图片/流程图/编辑 |

## 快速体验

```bash
# CLI 扫描（表格）
npm run cli -- scan samples/annotated-demo.md

# CLI 扫描（纯 JSON）
npm run cli -- scan samples/annotated-demo.md --format json

# GUI 打开
npm run gui -- samples/annotated-demo.md
```

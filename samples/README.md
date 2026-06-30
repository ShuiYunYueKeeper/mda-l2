# 演示样本（samples/）

独立的演示用 Markdown 样本，便于直接体验 CLI / GUI（与 `tests/samples/` 的测试夹具区分开）。

| 文件 | 用途 |
|------|------|
| `basic-gfm.md` | 常见 GFM 元素（标题/列表/表格/代码块/链接/引用）骨架 |
| `annotated-demo.md` | 含多级别、多状态、多标签的真实批注，演示面板筛选与双向定位 |
| `mermaid.md` | 含 Mermaid 代码块（作为代码块展示，演示代码高亮与复制） |

## 快速体验

```bash
# CLI 扫描（表格）
npm run cli -- scan samples/annotated-demo.md

# CLI 扫描（纯 JSON）
npm run cli -- scan samples/annotated-demo.md --format json

# GUI 打开
npm run gui -- samples/annotated-demo.md
```

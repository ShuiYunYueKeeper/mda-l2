# 演示与验收样本（samples/）

CLI / GUI 体验、人工验收与录屏演示的统一样本目录。

| 文件 | 用途 |
|------|------|
| `demo.md` | **默认演示**：六级标题、表格、代码块、多级别/多状态批注（README 快速上手） |
| `basic-gfm.md` | 常见 GFM 元素（标题/列表/表格/代码块/链接/引用）骨架 |
| `annotated-demo.md` | 含多级别、多状态、多标签的真实批注，演示面板筛选与双向定位 |
| `mermaid.md` | 四类 Mermaid 图（flowchart/sequence/class/state），GUI 中渲染为图形 |
| `all-features.md` | 综合演示：标题层级 + 图片（`assets/`）+ 流程图 + 代码块 + 批注 |
| `ac1-basic.md` | AC-1 基础 GFM 验收样例（删除线、嵌套列表、表格等） |
| `perf-mixed.md` | 大文件性能测试样例（混合正文与批注） |
| `assets/demo.png` | `all-features.md` 引用的演示图片 |

## 快速体验

```bash
# CLI 扫描（表格）
npm run cli -- scan samples/demo.md

# CLI 扫描（纯 JSON）
npm run cli -- scan samples/demo.md --format json

# GUI 打开
npm run gui -- samples/demo.md
```

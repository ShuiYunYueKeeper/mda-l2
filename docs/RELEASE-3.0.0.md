# MDA 3.0.0 — 发版说明

> **Tag**：`v3.0.0`  
> **日期**：2026-09-24  
> **定位**：预览直接编辑（CM6 WYSIWYG）基础能力稳定版  
> **上一 tag**：`v2.0.0-alpha` / `v2.0.1-alpha`（Phase A Free）

---

## 相对 2.x 的能力范围

| 能力 | 说明 |
|------|------|
| 预览直接编辑 | CodeMirror 6 装饰式实时预览；源码模式可切换 |
| 行内格式 | 加粗/斜体/下划线/删除线/行内代码融合包裹与拆分；IME 干净文档路径 |
| 块编辑 | 表格 / 代码块 / Mermaid / 图片 / 引用；块手柄与空白行「+」插入 |
| 自动链接 | `www` / `http(s)` 键入与粘贴 → `[text](href)`；链末 Enter 不拆链 |
| 大纲 | 左侧 TOC；按光标行「≤ 最近标题」高亮，编辑/回车即时同步 |
| 批注 | 段落级 + 选区级（anchor）；CLI / GUI / MCP 一致 |
| 导出 | HTML / PDF / DOCX；复制预览（微信公众号） |
| 工具栏 | 溢出左右滚动（左尽不显示左钮） |

## 本 tag 含近期修复（摘录）

- 自动链接：Enter/Space 退出链、修复链内换行、选中 URL 删除整段
- 行内样式段末 Enter：不拆成 `**text\n**`
- 大纲：回车后高亮不丢、不闪，且跟光标节正确
- 关窗看门狗、查找种子、Mermaid 通栏与复制等（见近期 commit）

## 安装 / 构建

```bash
npm install
npm run build
npm test                 # Jest：约 620+ 通过
npm run gui -- README.md
npm run cli -- scan samples/demo.md --format json
# 可选 e2e（需先 build）
npx playwright test tests/e2e/gui/enter-outline-bold.spec.ts
```

## 已知非本 tag 范围

- Pro AI（M7）按需解锁，不阻塞本稳定版
- 部分 GUI 截图素材仍以 `docs/screenshots/` 为准持续更新

## 校验

- [x] `npm test`（Jest）通过
- [x] 关键 GUI 改动已人工复验（自动链接 / 大纲回车 / 加粗行末回车）
- [x] `package.json` version = `3.0.0`
- [x] annotated tag `v3.0.0`

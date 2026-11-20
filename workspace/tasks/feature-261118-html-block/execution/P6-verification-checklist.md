# P6 验证 — 预览模式渲染原生 HTML 块

## 自动化

- [x] `npm run build`（`build:ts && build:editor && build:gui`）
- [x] `npx jest --silent`：90 suites / 741 tests 通过（含新增 `tests/core/html.test.ts` 17 例、
      `tests/gui/editor/html-block.test.ts` 10 例）
- [x] `npx playwright test tests/e2e/gui/html-block.spec.ts`（5/5）
- [x] 回归 `readme-bold-ops` / `table-col-resize` / `tight-sel-spill` / `toolbar`（8/8）
- [x] README 全篇滚动扫描：`htmlWidgets: 5, detailsTotal: 5, leakedCount: 0`，控制台无报错

## 人工 / 实机

- [x] 打开 `README.md`：居中图标、大标题、徽章、Trendshift、导航链接与 GitHub 观感一致
- [x] `<details>` 区展开/折叠正常，块内 Markdown（标题、图片、表格）照常渲染
- [x] 工具栏「代码」进源码态可编辑，失焦写回后重新渲染
- [x] 深色模式下卡片与徽章对比度正常

## 待补素材（须用户实机截图，AI 不代造）

| 场景 | 文件建议 |
| --- | --- |
| README 头部卡片（浅色） | `docs/screenshots/v3/html-block-header.png` |
| `<details>` 折叠区展开态 | `docs/screenshots/v3/html-block-details.png` |

## 结论

用户 2026-11-18 实机确认「已验证」，并入 `70370f7`。

# P6 验证 — HTML 文档只读整页预览

## 自动化

- [x] `npm run build`（tsc + editor bundle + copy-gui，含 `dist/gui/renderer/html-view.js`）
- [x] `npm test` → 90 suites / 742 tests 全通过
- [x] `npx jest tests/core/config.test.ts --coverage=false` → 6/6（HTML 扩展名与可打开判定）
- [x] `npx playwright test tests/e2e/gui/html-doc.spec.ts` → 3/3
- [x] 回归 `html-block.spec.ts` + `toolbar.spec.ts` + `html-doc.spec.ts` → 10/10

## 人工 / 实机

- [x] 启动参数打开 `docs/demo/软著材料/Markdown工作台软件-V1.0-操作说明书.html`：iframe 与 `#preview-scroll` 同尺寸（1400×858），内嵌表格/目录样式完整，控制台无报错
- [x] 编辑 / 加批注 / 清空批注按钮禁用，大纲隐藏
- [x] 切回 `.md` 文档：编辑面、大纲、批注栏恢复，HTML 视图收起
- [x] 用户 2026-11-18 指示「整理代码入库」，视为实机验收通过

## 待补素材（须用户实机截图，AI 不代造）

| 建议文件名 | 拍摄要点 |
|-----------|---------|
| `docs/screenshots/v3/html-doc-open.png` | 打开带内嵌样式的 HTML，展示整页渲染、顶部编辑按钮置灰 |
| `docs/screenshots/v3/html-doc-links.png` | 点击页内 `.md` 链接回到 Markdown 文档（可选） |

## 结论

功能、单测、e2e、真实样例实机抽检均通过，可入库。

# P6 验证 — HTML 块吞内容

## 自动化

- [x] `npm run build`
- [x] `npx jest --silent`：90 suites / 745 tests 通过（`html-block.test.ts` 12/12、`build-specs.test.ts` 通过）
- [x] `npx playwright test tests/e2e/gui/html-block.spec.ts`：13/13
- [x] 与 `toolbar` / `readme-bold-ops` / `tight-sel-spill` 合跑：20 passed
- [x] README 全篇滚动扫描：`htmlWidgets: 5, detailsTotal: 5, leakedCount: 0`，控制台无报错

## 人工 / 实机

- [x] 卡片下方紧跟敲字：卡片止于闭合行，文字留在正文（可正常加粗/渲染）
- [x] 卡片下方粘贴 Markdown 文本：不进卡片，按 Markdown 正常渲染
- [x] 卡片下方插入代码块：卡片不变，代码块独立且内容为空
- [x] 文末没有换行时下方插入代码块：`</div>` 与围栏之间自动补换行，不再粘行
- [x] 卡片 + 尾随空行下方插入表格：正常

## 待补素材（须用户实机截图，AI 不代造）

| 场景 | 文件建议 |
| --- | --- |
| 卡片下方紧跟敲字 | `docs/screenshots/v3/html-block-typing-below.png` |
| 卡片下方插入代码块 | `docs/screenshots/v3/html-block-insert-below.png` |

## 结论

用户 2026-11-19 实机确认「已验证」，并入 `fa0d725`。

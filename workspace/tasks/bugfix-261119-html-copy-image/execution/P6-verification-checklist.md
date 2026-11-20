# P6 验证 — HTML 块导出为图片

## 自动化

- [x] `npm run build`
- [x] `npx tsc --noEmit -p tsconfig.json` 无报错
- [x] `npx jest --silent`：90 suites / 743 tests 通过
- [x] `npx playwright test tests/e2e/gui/html-block.spec.ts`：11/11
- [x] 与 `toolbar` / `readme-bold-ops` / `tight-sel-spill` 合跑：18 passed

## 人工 / 实机

- [x] 小卡片（视口内）：导出图含顶栏、居中标题、正文加粗，1538×314
- [x] README 头部卡片（768×520，视口内）：图标、徽章、Trendshift、链接全部完整，1538×1042
- [x] 超视口长卡片（768×1650）：走内联样式回退，20 节全部正确排版，1536×3300
- [x] 不再出现「复制失败: formula export failed」弹窗

## 待补素材（须用户实机截图，AI 不代造）

| 场景 | 文件建议 |
| --- | --- |
| 导出图效果（README 头部） | `docs/screenshots/v3/html-block-copy-image.png` |

## 结论

用户 2026-11-19 实机确认「已验证」，并入 `c46f0d5`。

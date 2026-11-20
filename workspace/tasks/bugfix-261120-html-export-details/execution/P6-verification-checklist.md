# P6 验证 — HTML 块展开 details 后导出为图片

## 自动化

- [x] `npm run build`
- [x] `npx jest --silent`：90 suites / 745 tests 通过
- [x] `npx playwright test tests/e2e/gui/html-block.spec.ts`：14/14（含新增「高过视口的卡片（走回退导出）带图片也能复制为图片」）

## 人工 / 实机

- [x] 复现：README 的 `<details>` 卡展开后 645px → 2766px；未修前导出抛 `formula export failed`
- [x] 修复后导出 1536×5534：两张折叠区截图、正文、表格全部完整，不再有空白图片框
- [x] 真机 UI 路径（块手柄 → 复制为 → 复制为图片）：toast「已复制图片」，无「复制失败」弹窗
- [x] 视口内的小卡片/头部卡片仍是实时截图路径，观感不变

## 待补素材（须用户实机截图，AI 不代造）

| 场景 | 文件建议 |
| --- | --- |
| 展开 details 后导出的完整卡片 | `docs/screenshots/v3/html-block-copy-image-details.png` |

## 结论

用户 2026-11-20 实机确认「已验证」，并入 `046d6d2`。

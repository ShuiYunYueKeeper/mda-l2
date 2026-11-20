# P6 验证 — 源码态选区与右键复制

## 自动化

- [x] `npm run build`
- [x] `npx jest --silent`：90 suites / 743 tests 通过
- [x] `npx playwright test tests/e2e/gui/html-block.spec.ts`：10/10
- [x] 与 `toolbar` / `readme-bold-ops` / `tight-sel-spill` 合跑：17 passed

## 人工 / 实机

- [x] 源码态拖选文字，选区蓝色可见（`::selection` 背景非透明）
- [x] `Ctrl+A` 只选中源码框内容，不再全选整篇
- [x] 选区上右键：复制 / 剪切 / 粘贴可用（不置灰），点复制弹「拷贝成功」
- [x] 右键「剪切」后失焦：块内容写回、源码与预览一致
- [x] 无选区 `Ctrl+C` 复制整块源码

## 待补素材（须用户实机截图，AI 不代造）

| 场景 | 文件建议 |
| --- | --- |
| 源码态选区与右键菜单 | `docs/screenshots/v3/html-block-source-select.png` |

## 结论

用户 2026-11-19 实机确认「已验证」，并入 `de7e325`。

# P6 验证 — 插入 HTML 块 / 双击不进源码态

## 自动化

- [x] `npm run build`
- [x] `npx jest --silent`：90 suites / 742 tests 通过
- [x] `npx jest tests/gui/editor/block-insert-snippets.test.ts`：13/13
- [x] `npx playwright test tests/e2e/gui/html-block.spec.ts`：7/7
- [x] 与 `toolbar` / `readme-bold-ops` / `tight-sel-spill` 合跑：14 passed

## 人工 / 实机

- [x] 空白行 `/` 菜单出现「HTML 块」，插入后卡片直接进源码态，光标在源码框内
- [x] 工具栏「插入」、块手柄「下方插入」同样可见该项
- [x] 卡片内双击标题不再切源码态（仍是预览渲染，只多一圈选中描边）
- [x] 点顶栏「代码」按钮仍可进源码态，`Esc` / 失焦回渲染态

## 待补素材（须用户实机截图，AI 不代造）

| 场景 | 文件建议 |
| --- | --- |
| 插入菜单里的「HTML 块」项 | `docs/screenshots/v3/html-block-insert-menu.png` |
| 插入后直接进源码态 | `docs/screenshots/v3/html-block-insert-source.png` |

## 结论

用户 2026-11-19 实机确认，并入 `9eddb2d`；e2e 改进见 `32eaaf7`。

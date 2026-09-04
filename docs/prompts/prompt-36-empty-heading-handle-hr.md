# P4 迭代记录 — 空标题 / 块手柄 hover / 空白行 `/` / 分隔线

> 日期：2026-08-11  
> 阶段：P4 / M8-E 交互层 + widget phase `math`/`full`（分隔线）  
> 用户实机：✅ 已验证

## 本轮改动

| # | 需求 | 结论 |
|---|------|------|
| 1 | 空标题行：光标落在 `#` 之后；占位「标题一」~「标题六」；行高/字号与有正文标题一致 | ✅ |
| 2 | 空标题行 Backspace：删整行（含换行），勿剥 `#` 变空白正文 | ✅ |
| 3 | 块小手柄 hover：整块浅蓝高亮 + 自定义 tooltip（对齐空白行「+」位置） | ✅ |
| 4 | 代码块 / 流程图 / 图片：手柄 hover **不**整块高亮；标题/引用/表格/分割线/公式保留 | ✅ |
| 5 | 空白正文行按 `/`：弹出与「+」相同插入菜单，不写入 `/` | ✅ |
| 6 | 段后空白行插分隔线：补前导空行避免 Setext 误解析；光标落补出的空行 | ✅ |
| 7 | 分割线手柄 hover 高亮与单击选中一致（`.mda-cm-hr-frame`、12% accent） | ✅ |

## 实现要点

- **空标题**：`caret-syntax-adjust.js` 左缘 snap；`build-specs.js` 空标题也生成 `mda-cm-hN-line`；`empty-line-insert.js` 占位带 `mda-cm-hN`；`heading-enter.js` — `handlePreviewHeadingBackspace`
- **块手柄 hover**：`block-drag-handle.js` — `resolveBlockHighlightTargets` + `.mda-cm-block-drag-tip`；`index.html` 样式对齐 `mda-cm-empty-line-insert-tip`
- **空白行 `/`**：`empty-line-insert.js` — `handleBlankLineSlashOpen` + `openBlankLineInsertMenu`；`empty-line-insert-menu.js` 支持 `anchorRect`
- **分隔线插入**：`block-insert-snippets.js` — `hrLeadingNewline` / `formatBlankLineInsert` / `planHrInsertCaret`；`block-handle-ops.js` 空白行与块手柄插入共用
- **HR hover**：`index.html` — hover 高亮 `> .mda-cm-hr-frame`，与 `.mda-cm-hr-selected` 同色

## 测试

- `tests/gui/editor/build-specs.test.ts`（空标题 line-style）
- `tests/gui/editor/heading-enter.test.ts`（空标题 Backspace）
- `tests/gui/editor/empty-line-insert.test.ts`（非空白行不拦截 `/`）
- `tests/gui/editor/block-insert-snippets.test.ts`（HR 前导空行 + 光标）
- `npm run build:editor`；`npm run build:gui`

## 遗留 / 下一步

- **M8-D** 批注共存：用户 **2026-08-11** 确认已大部分支持、当前满足需求，不挡后续
- **M8-E2** 全局 `/` 插入面板（非仅空白行）仍待办
- widget phase **6 · full** 签收表项仍 ⬜（分隔线交互本轮已验，待总签）

## 待补截图（须用户实机）

| 建议文件名 | 拍摄要点 |
|------------|----------|
| `docs/screenshots/22-empty-heading-placeholder.png` | 空 `# ` 行占位 + 手柄垂直居中 |
| `docs/screenshots/23-block-handle-hover-highlight.png` | 标题/引用/表格手柄 hover 整块浅蓝 + tooltip |
| `docs/screenshots/24-blank-line-slash-menu.png` | 空白正文行按 `/` 弹出插入菜单 |
| `docs/screenshots/25-hr-insert-widget.png` | 段间插入分隔线 widget + 选中/hover 高亮一致 |

入库后更新 `README.md`「界面截图与演示」引用。

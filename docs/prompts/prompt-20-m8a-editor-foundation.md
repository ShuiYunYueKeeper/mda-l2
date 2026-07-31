# P4 迭代记录 — M8-A 基座补全

> 日期：2026-07-29  
> 阶段：P4 / M8-A  
> 工作流：`.cursor/workflow.md` 六步循环 Step 1–4

## Step 1 审查结论

| 项 | 状态 |
|----|------|
| P0–P3 文档 | ✅ 已确认（含竞品截图规范化、F17 `ai-summary-tab.png`） |
| `src/gui/renderer/editor/` | ⚠️ 已有 M8-B/C 超前实现（live-preview、widgets），**未接入 app.js** |
| `package.json` | ❌ 缺 CM6 依赖声明与 `build:editor` |
| `CM6_EXPERIMENT_LOCKED_OFF` | ❌ 曾硬关；迭代需恢复 localStorage 开关 |
| `ModeSwitchState` / `SearchSession` | ❌ 缺失（M8-A4/A4b 阻塞项） |
| `app.js` 集成 | ❌ 仍纯 2.0 textarea + HTML 预览 |

**本轮范围**：M8-A1/A2/A4/A4b/A8（基座 + 状态骨架 + bundle 引入），**不**强行切换默认编辑面（待 M8-A5–A9）。

## Step 2 实施

- `package.json`：CM6 + esbuild；`build:editor` / `watch:editor`
- `editor/state/mode-switch.js`、`search-session.js`
- `mode.js` 切换时 save/restore
- `find-replace.js` 可选 `hooks.searchSession` 同步
- `index.html` 引入 `editor.bundle.js`
- 解除 `CM6_EXPERIMENT_LOCKED_OFF`

**第二轮（M8-A5–A8）**：

- `app.js`：`initCm6Editor`、统一 `getEditorTextValue` / `setEditorTextValue` / `getEditorSaveText`
- dirty / `writeToPath` / `openFile` / `newDocument` / `clearOpenDocument` 走 CM6 路径
- CM6 模式下隐藏 2.0 左栏 + HTML 预览，`Ctrl+E` 切换预览/源码模式（同一 CM6 实例）
- `parseAndRender` 在 CM6 下跳过 HTML 预览渲染（批注面板/大纲仍更新）

## Step 4 验证

- `npm run build` ✅
- `npm test -- --testPathPattern=gui/editor` ✅（37 项）
- GUI 实机（`mda-cm6=1` + `samples/all-features.md`）✅ **用户确认通过**

## Step 5 — 文档

- [`M8-acceptance-checklist.md`](../M8-acceptance-checklist.md)：M8-A 闸门记录、AC-12/18/20 雏形勾选

## Step 6 — 下一步

**M8-B 装饰层**（S1–S12 实机验收）：

| 子任务 | 验收点 |
|--------|--------|
| M8-B2–B5 | 标题/行内/链接/列表/引用/分隔线在 `all-features.md` 可编辑 |
| M8-B6 | reveal 三档（block / nearby / never） |
| M8-B7 | 👤 IME 长段输入、列表标记不统一 |
| VIS-7 | 行内 code 胶囊样式 |

自动化：`tests/gui/editor/build-specs.test.ts`（E49–E55）已绿；B7 须用户实机签字。

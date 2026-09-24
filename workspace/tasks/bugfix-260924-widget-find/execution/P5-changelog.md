# P5 Changelog — widget 查找种子 / 代码块保持高亮

- `src/gui/renderer/find-replace.js`：选区种子 `skipScroll` + 命中索引
- `src/gui/renderer/app.js`：捕获阶段 Ctrl+F/H；`normalizeFindSeed`
- `src/gui/renderer/editor/widget-find-seed.js`：widget DOM 选区 → doc 偏移
- `src/gui/renderer/editor/mount.js`：`getFindSeedFromSelection`
- `src/gui/renderer/editor/widget-find-highlight.js`：`reapplyWidgetFindHighlights`
- `src/gui/renderer/editor/widgets/code.js`：点击保留 hljs；输入重绘并补查找 mark
- `tests/gui/find-replace.test.ts`：种子索引单测
- `AGENTS.md` / `docs/few-shot-examples.md` / `quality.md` 沉淀

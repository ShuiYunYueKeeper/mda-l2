# P4 — 修复方案

1. `find-replace.js`：选区种子带 `{text,from,to,skipScroll}`；有种子则 `refreshMatches(false,{skipScroll:true})` + `indexOfMatchForSelection`。
2. `app.js`：捕获阶段处理 `Ctrl+F/H`；`normalizeFindSeed` + 委托 `cm6Editor.getFindSeedFromSelection`。
3. `widget-find-seed.js`：代码块/表格格 DOM 选区 → 文档偏移（对齐 fence body / cell markdown）。
4. `code.js`：点击/聚焦不再压平；输入时重绘 hljs 并 `reapplyWidgetFindHighlights`；右键菜单路径仍可压平。

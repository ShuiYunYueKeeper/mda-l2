# P2 — 根因分析

**depth**: focused

1. **选区种子**：`getFindSeedFromSelection` 只读 CM6/textarea 选区；widget `contenteditable` 选区不在 CM6 → 种子为空 → `show()` 走 `refreshMatches(true)` 跳首命中。
2. **快捷键**：代码块 `keydown` 一律 `stopPropagation`；查找监听在冒泡阶段 → 收不到 `Ctrl+F/H`。
3. **高亮丢失**：历史为解决 Electron 嵌套 span `::selection` 而在 focus/mouseup 调 `ensurePlainForEdit` 压平；现已有 `*::selection` CSS，压平会毁掉 hljs 与查找 mark。

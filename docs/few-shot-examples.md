# Few-shot 正反例资产（AI 协作易错点）

> 本文件为「可被 AI 直接复用的 few-shot 资产」：针对 MDA 项目中反复出现、且仅靠
> 自然语言规则不易约束的易错点，给出成对的 **✅ 正确 / ❌ 错误** 示例。
> 修改 parser / writer / renderer 前，请先对照本文件的反例自检。
>
> 配套：硬性规则见 `AGENTS.md` 第 8 节（禁止事项）与第 9 节（隐性规范）；
> 枚举/正则/色条等可配置规则见 `src/config/annotation-schema.json`。

---

## 1. 批注段落归属（parser）

**规则**：批注属于其**下方第一个正文段落**；批注与段落之间的空行**不打断**归属；
末尾没有正文的批注是「孤儿」（仅进 `annotations`，不挂任何段落）。

### ✅ 正确：批注归属下方段落（空行不打断）

输入：

```markdown
[comment]: <> (@anno {... "content":"建议精简" ...})

这是被批注的段落。
```

期望：`annotations` 含 1 条；该段落 `annotations` 含此批注（中间空行不影响归属）。

### ❌ 错误：误把批注归属到「上方」段落

```markdown
上一段正文。
[comment]: <> (@anno {...})
下一段正文。
```

- ❌ 错误理解：批注属于「上一段正文」。
- ✅ 正确理解：批注属于其**下方**的「下一段正文」（连续非空行视为同一段落时，
  批注归属该段落整体）。

### ✅ 正确：末尾孤儿批注

```markdown
正文段落。

[comment]: <> (@anno {...})
```

期望：批注进入 `annotations`，但**不挂**到任何段落（其后无正文）。

---

## 2. 删除批注后的空行压缩（writer）

**规则**：删除批注行后，若该行**上下都变为空行**，压缩掉一个多余空行；其余空行保持原样。
**绝不**修改任何正文行。

### ✅ 正确：压缩删除产生的双空行

删除前：

```markdown
段落 A。

[comment]: <> (@anno {...})

段落 B。
```

删除批注行后应得到（上下空行压缩为一个）：

```markdown
段落 A。

段落 B。
```

### ❌ 错误：删除后残留双空行 / 误删正文空行

```markdown
段落 A。


段落 B。
```

- ❌ 上例残留了两个空行（未压缩）。
- ❌ 另一类错误：把正文之间**原有**的空行也压缩了 —— 仅压缩「因删除批注而新产生」
  的相邻空行，`verifySourceProtection` 会拦截对正文行的任何改动。

---

## 3. 围栏代码块内的批注样例（parser + renderer 共用 `buildCodeFenceMask`）

**规则**：```` ``` ````/`~~~` 围栏代码块内的 `[comment]: <> (@anno ...)` 是**字面文本**，
**不识别为批注**、渲染时**不清空**，按原样显示在代码块里。

### ✅ 正确：围栏内样例不入面板、原样显示

```markdown
下面是批注语法示例：

​```markdown
[comment]: <> (@anno {"id":"...","content":"示例","level":"info","status":"open",...})
​```
```

期望：`annotations` 数量 **不** 包含围栏内这条；渲染输出的 `<pre>` 中**仍可见**该行文本。

### ❌ 错误：把围栏内样例当成真实批注

- ❌ 直接对每行套 `ANNO_REGEX` 而忽略围栏状态 → 围栏内样例被计入面板，且被渲染清空。
- ✅ 正确：parser 与 renderer 都先 `buildCodeFenceMask(lines)`，对围栏内的行跳过批注处理。

---

## 4. 换行风格保留（writer）

**规则**：写回前 `detectEol(rawText)`，原文出现过 `\r\n` 就整体按 CRLF 回写，否则 LF。

### ✅ 正确

- 原文为 CRLF → 增删改批注后仍为 CRLF。
- 原文为 LF → 保持 LF。

### ❌ 错误

- ❌ 用 `lines.join('\n')` 把 CRLF 文件静默转成 LF（会让整文件 diff 爆炸，违反源文件保护精神）。

---

## 5. 渲染不可见性与 BOM（renderer）

**规则**：渲染前 `preprocessForRender` —— 去掉起始 BOM；把围栏外的批注行清空为空行
（保留行数）。不可依赖 markdown-it 链接引用定义来隐藏批注。

### ✅ 正确

- 含括号内容（如 `n(n-1)/2`）的批注：渲染输出中**不出现**任何批注字段值。
- 文件以 BOM 开头：首行 `# 标题` 仍渲染为 `<h1>`。

### ❌ 错误

- ❌ 直接 `md.render(text)`：① 含括号批注破坏链接引用定义语法 → 批注泄漏为正文；
  ② BOM 抢占行首 → 首个 `# 标题` 退化为普通段落。

---

## 6. CLI stdout 纯净（cli）

**规则**：`scan --format json` 之外不得向 stdout 写非数据文本；警告/日志一律走 stderr。

### ✅ 正确

```text
stdout: [ {...}, {...} ]      # 纯 JSON 数组
stderr: 警告: 第 12 行批注 JSON 解析失败
```

### ❌ 错误

```text
stdout: 正在扫描...           # ❌ 非数据文本污染 stdout，破坏管道/解析
stdout: [ {...} ]
```

---

## 7. 编辑态与批注写操作冲突（GUI）

**规则**：存在未保存编辑（dirty）时，**禁止**批注增删改；须先 `Ctrl+S` 保存或放弃编辑。
批注写操作走 core writer 读**磁盘**内容，若编辑器有未保存改动，写入后重载会**丢失编辑**。

### ✅ 正确

- 用户在编辑栏修改正文 → 文件名旁出现 dirty 标记 →「+ 添加批注」禁用，点批注编辑/删除时提示「请先保存」。
- 用户 `Ctrl+S` 保存成功 → dirty 清除 → 批注操作恢复可用。

### ❌ 错误

- ❌ dirty 时仍允许 `addAnnotation`：core 基于旧磁盘内容插入批注行，随后 `reloadFile` 覆盖编辑器缓冲 → **用户编辑丢失**。
- ❌ 无提示静默失败：用户不知道为何批注按钮变灰。

---

## 8. 坏批注行：严格解析 vs 宽松隐藏（GUI `ANNO_ISH`）

**规则**：
- **core 严格解析**（`ANNO_REGEX`）：只认完整 `[comment]: <> (@anno {合法JSON})` 行。
- **GUI 预览宽松隐藏**（`ANNO_ISH`）：围栏外、含 `<> (@anno` 标记的行一律清空，容忍缺 `]`、坏 JSON、编辑中状态。
- **保存前校验**（`findMalformedAnnotations`）：命中 `ANNO_ISH` 但不满足严格格式的行号 → 弹窗提示。

### ✅ 正确

用户故意删掉 `[comment]` 的一个 `]`：

```markdown
[comment: <> (@anno {"id":"a",...})
# 标题
```

- 预览：**不显示**该行（`ANNO_ISH` 清空）。
- 面板：「无批注」（严格正则不匹配）。
- 保存：弹窗「第 1 行批注格式不正确…仍要保存吗？」

### ❌ 错误

- ❌ 仅用严格 `ANNO_REGEX` 做预览隐藏：缺 `]` 的坏行不匹配 → **泄漏进预览**（用户可见 `@anno` JSON）。
- ❌ 保存时不校验：坏批注落盘，后续 CLI/GUI 均无法识别为批注。

### ✅ 正确：围栏内样例不受影响

````markdown
```markdown
[comment: <> (@anno {"broken"  # 围栏内是字面文本
```
````

期望：预览代码块内**原样显示**；`findMalformedAnnotations` **不**报该行。

---

## 9. 源码编辑器高亮层对齐（GUI）

**规则**：编辑栏为「透明 `textarea` + `pre` 高亮层 + 行号槽」三层结构；**同字体/字号/行高/padding/`white-space:pre`/`tab-size`**；
`textarea` 为唯一可交互滚动层，`scroll` 事件须同步高亮层与行号槽的 `scrollTop/scrollLeft`。

### ✅ 正确

```javascript
editorEl.addEventListener('scroll', function () {
  highlightPre.scrollTop = editorEl.scrollTop;
  highlightPre.scrollLeft = editorEl.scrollLeft;
  gutterEl.scrollTop = editorEl.scrollTop;
});
// 输入时 refreshEditorDecorations() 更新高亮 HTML 与行号文本
```

### ❌ 错误

- ❌ 高亮层与 textarea 字号/行高不一致 → 滚动后光标与着色**错位**。
- ❌ 高亮层可滚动、textarea 不可滚动（或反之）→ 两层内容**脱节**。
- ❌ 忘记在 `openFile` / 展开编辑栏时调用 `refreshEditorDecorations()` → 行号与高亮空白。

---

## 10. 图片/流程图缩放遮罩（GUI）

**规则**：
- 舞台元素**禁止** `will-change: transform`（会先栅格化再缩放 → 放大模糊，SVG 亦然）。
- 流程图（SVG）放大须改 **`width`/`height`**，平移用 **`left`/`top`**；勿对舞台 `transform: scale` / `translate`（易糊字）。
- 深色模式：缩放层 SVG 须**深色底**（匹配 Mermaid dark 浅色字）；中和 SVG 内近白铺底 rect；默认适配约 **72%–75%** 视口（勿一打开就 90% 铺满）。
- Timeline：Mermaid 按 `.section-N line { stroke: cScaleInv }` 分段着色会导致虚线/轴线深浅不一 → 须统一浅灰连接色（如 `#cbd5e1`）。
- 缩放钳制 **0.3×–8×**；平移钳制内容中心留在视口内。
- `+/-` 按钮须 `stopPropagation`，**仅内容本身双击**才复位（避免连点按钮触发 `dblclick` 误复位）。
- 工具栏按钮用深色实底，避免白底图片遮挡。

### ✅ 正确

```css
.mda-zoom-stage { transform-origin: center center; cursor: grab; position: relative; }
/* 不加 will-change: transform */
[data-theme="dark"] .mda-zoom-stage svg { background: #1e1e1e; }
```

```javascript
// SVG：改宽高矢量放大；舞台只用 left/top 平移
node.style.width = (baseW * scale) + 'px';
stage.style.transform = 'none';
stage.style.left = tx + 'px';
bar.addEventListener('click', function (e) { e.stopPropagation(); zoom(...); });
bar.addEventListener('dblclick', function (e) { e.stopPropagation(); });
stage.addEventListener('dblclick', function (e) { e.stopPropagation(); reset(); });
```

### ❌ 错误

- ❌ `.mda-zoom-stage { will-change: transform; }` → 流程图/图片放大后**全糊**。
- ❌ 长图仍用 `max-height: 50vh` + `transform: scale` → 715×15594 被压成约 15px 宽，全屏发花。应按设备像素 1:1 排版；高度超过 4096 切 canvas 分片，平移要能走到首尾。
- ❌ 打开表格后按 `escapeCell` 把每个 `\` 加倍、并把 `|---|` 收成 `| --- |` 写回文档 → `$\alpha$` 变成 `$\\alpha$`。单元格语义没变就不要写回；`\` 只在后面是 `\` 或 `|` 时才转义。
- ❌ 深色主题下缩放层强制白底 → 浅色字发灰，看起来像糊。
- ❌ 舞台 `transform: scale(...)` 放大 SVG → 文字栅格化发糊。
- ❌ 遮罩层 `dblclick` 监听在任意子元素上复位 → 连点 `−` 两次触发复位。
- ❌ 半透明白色按钮浮在白图上 → **看不见** +/- 控制。
- ❌ 无平移边界 → 内容被拖到视口外**找不回来**。
- ❌ 依赖 Mermaid 默认 Timeline section 描边 → 全屏下各段虚线颜色不一致。

---

## 11. 复制预览到公众号（GUI 剪贴板）

**规则**：
- 仅支持微信公众号富文本；**不提供**知乎复制路径。
- 富文本剪贴板只用 `clipboard.write({ html, text })`；**禁止**随后 `writeBuffer` 覆盖 HTML。
- 复制过程**禁止**滚动预览或临时 overlay 重渲染 mermaid。

### ✅ 正确

```javascript
clipboard.write({ text, html });
// 视口内 capturePageRect，否则 SVG→PNG；不滚动预览
```

### ❌ 错误

- ❌ `clipboard.writeBuffer('CF_HDROP', …)` 覆盖 HTML → 公众号粘贴空白。
- ❌ 复制前改 `scrollTop` 或 overlay 重渲染 → 界面闪烁。

---

## 12. 预览 hide-mark 点击与剪贴板（CM6）

**规则**：
- hide-mark + `atomicRanges` 会使点击落点落在可见内容边缘内侧；须经 `caret-syntax-adjust` 校准到定界符外侧（左缘→开标记左侧，右缘→闭标记右侧）。
- 拖选结束后对 `anchor`/`head` 分别校准；复制/剪切经 `syntax-clipboard`：**成对**定界符（`**`、`` ` ``）均完整包含时保留 Markdown，**仅一侧**时去掉定界符字符。
- **部分可见选区仍须保留样式**：`**能打开、能看懂**` 只选「能打开」时，校准后常含开 `**`、不含闭；挖掉 hide-mark 后须经 `wrapClipboardWithCoveringMarks`（`openPlusPartialContent` 等）补回 `**能打开**`，不得拷出裸「能打开」。
- **标题 ATX（`##`）**：预览态不可见，复制**一律去掉** `#{1,6} `；贴入标题行时 `normalizePasteForHeading` 再去掉剪贴板各行首部 ATX，避免 `## ##` 叠字。
- `markRanges`/`contentRange` 的 `text` 参数必须是**全文**；Lezer 节点须适配 `{ from, to, type: node.name }`。
- **单元格粘贴**：`paste` → `pasteMarkdownIntoTableCell` 立刻重绘；不得先露 `**…**` 再等 blur。
- **下划线+删除线**：源码 `~~~text~~~`；格式前 `snapIntoMarkContent`；CSS `underline line-through` 同写。
- **格内叠套须递归渲染**：`**~~x~~**` / `***x***` / `**~~~x~~~**` 不能只画最外层，否则内层 `~~`/`~`/`*` 当可见字泄漏；`fillCellInlineWindow` 在 content 窗口内再解析。

### ✅ 正确

```javascript
const content = rule.contentRange(adapted, doc); // 全文 doc
// 选区 [0,5) 仅 **MD → 剪贴板 "MD"；[0,7) 完整 **MDA** → 保留
// **整段** 内只选可见「能打开」→ 剪贴板 "**能打开**"（covering wrap）
// 标题行全选仍复制 "核心功能"（无 ##）；贴回标题行时再去 ATX
// 选「能打开」点删除线 → "**~~能打开~~、能看懂…**"（先 snap 再包）
// 格内 "**~~能打开~~**" → 可见「能打开」，DOM 同时有 .mda-cm-strong 与 .mda-cm-strike
```

### ❌ 错误

- ❌ `rule.contentRange(node, doc.slice(node.from, node.to))` → 行内 code 的 `markRanges` 返回空，剪贴板校准失效。
- ❌ 拖选仅含开 `**` 仍粘贴 `**MDA` → 应去掉未成对的定界符。
- ❌ 预览只选加粗可见字却拷出无定界符的裸字 → 缺 `wrapClipboardWithCoveringMarks`。
- ❌ 选区含开 `**` 时直接包 `~~` → `~~**能打开~~…**` 拆坏整段加粗。
- ❌ 单元格 paste 写 textContent 等失焦 → 先露源码再渲染。
- ❌ 格内 `pickNonOverlapping` 只留 StrongEmphasis → 可见「~~能打开~~」泄漏定界符。
- ❌ 标题复制带 `##` 再贴回标题行 → 叠成 `## ##`；须在 copy 去 ATX + paste 二次剥离。

---

## 12b. 文件树拖动移动目标解析（GUI）

**规则**：

- `dragover` 须记录 `dropTargetDir`（文件夹行 `data-node-path`，或文件行之父目录）与 `lastDropIsCopy`。
- `drop` **优先**使用 `dropTargetDir`，不可仅依赖 `e.target.closest('.dir')`（松手时常为源文件行）。
- 同目录移动静默忽略；`moveFileToDir` 源路径=目标路径返回 `noop`，**不得** toast「移动成功」。

### ✅ 正确

```javascript
treeEl.addEventListener('dragover', function (e) {
  lastDropIsCopy = !!(e.ctrlKey || e.metaKey);
  var dirRow = e.target.closest('.mda-fs-row.dir[data-node-path]');
  if (dirRow) { setDropTargetDir(dirRow.getAttribute('data-node-path')); return; }
  var fileRow = e.target.closest('.mda-fs-row.file[data-node-path]');
  if (fileRow) { setDropTargetDir(dirnamePath(fileRow.getAttribute('data-node-path'))); }
});

treeEl.addEventListener('drop', function (e) {
  var destDir = dropTargetDir || resolveDropDestDir(e);
  if (!isCopy && pathsEqual(dirnamePath(src), destDir)) return;
  cb.onDropFile(src, destDir, isCopy);
});
```

### ❌ 错误

- ❌ `drop` 里 `e.target.closest('.dir')` → 目标算成源目录 → 文件未移动却提示成功。
- ❌ 同路径 `moveFileToDir` 返回 `{ success: true }` → 误报 toast。
- ❌ `drop` 时用 `e.ctrlKey` 判断复制/移动 → 模式与用户意图不一致。

---

## 13. GUI 文案 i18n 与插值（`uiT`）

**规则**：用户可见字符串走 `MDAI18n.t`；带占位符须转发 `vars`，禁止硬编码单语。

### ✅ 正确

```javascript
function uiT(key, vars) {
  return (global.MDAI18n && global.MDAI18n.t)
    ? global.MDAI18n.t(key, vars)
    : key;
}
uiConfirm(uiT('fsDeleteConfirm', { name: fileName }));
```

`i18n.js` 中：`fsDeleteConfirm: '确定删除「{name}」吗？'`

### ❌ 错误

- ❌ `uiT('fsDeleteConfirm', { name: fileName })` 但 `uiT` 未传 `vars` → 弹窗显示字面量 `{name}`。
- ❌ 菜单/弹窗直接写 `'确定删除吗？'` 或 `'Delete?'` → 切换语言无效。

---

## 14. 工作区文件冲突与路径解析（GUI IPC）

**规则**：

- 复制/移动/重命名路径须经 `resolveInWorkspace`；工作区根目录 `rel === ''` 为合法目标。
- 目标已存在且未传 `conflict` → 返回 `{ conflict: true }`，由渲染层弹窗后再带 `overwrite` / `rename` 重试。

### ✅ 正确

```javascript
function resolveInWorkspace(inputPath, workspaceRoot) {
  const rel = path.relative(workspaceRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs; // rel === '' 即 workspaceRoot 本身
}
```

### ❌ 错误

- ❌ `if (!rel)` 误判工作区根为非法路径 → 粘贴/移动到根目录失败。
- ❌ 同名文件直接 `renameSync` 覆盖 → 无确认、违反用户预期。

---

## 15. 大纲高亮按源码行归属（GUI）

**规则**：高亮「≤ 当前行的最近标题」；编辑定位与预览点击须直接更新；滚动锚点约视口 20%（勿用固定 64px，易偏上一节）。CM6 选区变化须 `scheduleOutlineActiveFromCaret`；`setHeadings` 有 `caretLine` 时**优先**按光标算高亮（勿优先 preserve 旧行）。

### ✅ 正确

```javascript
function headingLineAtOrBefore(line) {
  var active = headings[0].line;
  for (var i = 0; i < headings.length; i++) {
    if (headings[i].line <= line) active = headings[i].line;
    else break;
  }
  return active;
}
// 预览点击 / onPreviewLocate → updateOutlineActiveFromLine(cursorLine)
// setHeadings(roots, { caretLine }) → paint 前写入 active，HTML 带 .active
```

### ❌ 错误

- ❌ 仅依赖滚动 + `top + 64` → 点在 1.2 却高亮 1.1。
- ❌ 预览点击不更新大纲 → 大纲高亮不动。
- ❌ `setHeadings` 优先 preserve 旧 active → 标题行末回车后光标在本节空行，大纲仍钉上级。
- ❌ 先 `activeLine=null` 再 paint、再 rAF 补高亮 → 大纲闪烁。

---

## 16. 启动恢复工作区不得自动打开首文件（GUI）

**规则**：最近列表为空 → 欢迎页；恢复上次工作区只刷新侧栏树，**禁止** `!currentFilePath` 时 `requestOpen(firstMd)`。

### ✅ 正确

```javascript
// restoreSavedWorkspace → activateWorkspace(path)  // 无 openFirstIfEmpty
// 用户主动打开文件夹 → activateWorkspace(path, { openFirstIfEmpty: true })
function refreshWorkspaceTree(opts) {
  // 仅 opts.openFirstIfEmpty && welcome 时才 requestOpen(first)
}
```

### ❌ 错误

- ❌ `refreshWorkspaceTree` 里 `if (!currentFilePath) requestOpen(first)` → 清空最近后重启仍打开文档。
- ❌ 清空最近打开时强制 `clearOpenDocument()` → 打断正在阅读的文档（用户明确不要）。

---

## 17. 缩放层复制：流程图图片 + 围栏源码（GUI）

**规则**：
- 普通图片：工具栏「复制」/ `Ctrl+C` → 剪贴板**位图**。
- 流程图：工具栏分「复制图片」「复制源码」；**全屏缩放层 Ctrl+C 默认复制图片（仅 SVG）**。
- 块工具栏「复制图片」须截取**完整卡片边框**（含顶栏），`capturePageRect` 向外取整并保留设备像素（勿把 DPR 图平滑缩到 1×）。
- 「复制源码」须带 ` ```mermaid ` 围栏（可直接粘贴回 Markdown）。
- **选中流程图块后编辑器 `Ctrl+C`** 须复制该块围栏源码（勿空选区沿用剪贴板旧内容）；源码框 `paste` 须 `stopPropagation`，贴入完整围栏时只取正文。
- **选中代码块后 `Ctrl+C`** 同理复制围栏源码（`code-shortcuts` / `onCopyCodeBlock`）；代码框无拖选时 `Ctrl+C` / `Ctrl+A` 行为对齐流程图源码框。

### ✅ 正确

```javascript
function fenceMermaidSource(src) {
  return '```mermaid\n' + String(src).trim() + '\n```';
}
// 全屏缩放层 Ctrl+C / 复制图片 → 仅 SVG
api.copyClipboardImage({ dataUrl: await svgToPngDataUrl(opts.svgNode) });
// 块工具栏复制图片 → 截取 .mda-cm-mermaid-frame
exportMermaidFrameToPng(frame).then(copyPngDataUrlToClipboard);
// 选中块 Ctrl+C / 复制源码
copyTextWithToast(fenceMermaidSource(opts.mermaidSrc), ...);
```

### ❌ 错误

- ❌ 流程图 `Ctrl+C` 只复制裸源码（无围栏）→ 粘贴后不能直接当代码块用。
- ❌ 只有源码按钮、无法复制图片 → 无法贴进公众号/文档当插图。
- ❌ 打开缩放时未传入 `mermaidSrc` / `svgNode` → 复制空内容或失败。
- ❌ 选中流程图后 `Ctrl+C` 无处理 → 剪贴板仍是旧文档片段，粘贴进源码框导致渲染失败。
- ❌ 选中代码块后 `Ctrl+C` 无处理 → 同上，粘贴得到错误/残缺内容。
- ❌ 源码框 `paste` 不 `stopPropagation` → 同一段文本再写入 CM6 文档，围栏被拆坏。
- ❌ 块「复制图片」只栅格化 SVG、或把截图 2×→1× 平滑缩小 → 缺边框/边框发糊。

---

## 18. 批注定位与编辑滚动钉住（GUI）

**规则**：
- 点批注定位须用预览滚动容器的几何位移（`#preview-scroll` + `getBoundingClientRect`），勿对块 `scrollIntoView`（易滚错祖先）。
- 连续「滚预览 + 滚编辑」勿依赖会**丢弃**第二次调用的 sync 锁；布局未稳（开编辑栏）须重试。
- Enter 等编辑键：若光标仍在原视口内，钉住 `scrollTop`，勿让浏览器「保光标可见」或实时重渲拽飞视口。
- 实时键入勿「先跳过 Mermaid 再空闲补渲」——预览高度先塌后撑会造成半秒闪烁。

### ✅ 正确

```javascript
// 批注定位：直接几何滚预览 + 多次重试
MDASyncScroll.scrollPreviewToLine(previewScrollEl, p.startLine, map, { onlyIfNeeded: false });
syncScrollCtrl.scrollEditorToLine(anno.line, { skipPreview: true });

// 新建后
reloadFile({ selectAnnoId: r.value.id }); // mermaid.then → selectAnnotation
```

### ❌ 错误

- ❌ `el.scrollIntoView` 后再 `showEditorPane` → 预览宽度变了，第一次定位不准。
- ❌ `withSyncLock` 内连续两次定位且第二次被 `if (syncing) return` 丢掉 → 「要点两次」。
- ❌ 键入时 `skipMermaid` 再 450ms 全量补渲 → 预览先下后上闪烁。

---

## 19. 同文件批量 `add` 批注（CLI / MCP / Agent）

**规则**（来自分享稿批注实操翻车）：
- 每次 `addAnnotation` / `mda_add` 会在目标段落**上方插入 1 行**，该行及**之后**所有行号 +1。
- `line` 必须落在某段落内（`findParagraphByLine`）；**空行不属于任何段落** → 报「未找到第 N 行所属的段落」。
- 同一文件上的多次 `add` **禁止并行**；并行或沿用过期行号会写错段或直接失败。

### ✅ 正确：自下而上串行，或每次按关键词重定位

```text
1. 列出待挂载段落（按正文关键词 / 标题），记下当前 startLine
2. 按 startLine **从大到小** 依次 mda_add（下方插入不影响上方行号）
3. 若必须自上而下：每成功一条后重新 parse / mda_scan，再解析下一条的行号
4. 空行、纯分隔线 `---` 勿当 line；改用相邻正文/标题的 startLine
```

```bash
# 取纯净 JSON：直接跑 dist，避免 npm 脚本横幅混进 stdout
node dist/cli/main.js scan path/to.md --format json
# 或用 MCP mda_scan / mda_add（推荐 Agent）
```

### ❌ 错误

- ❌ 事先算好一串行号后 **并行** 多次 `mda_add` → 竞态；实测出现「未找到第 442 行所属的段落」（行号已被另一插入顶歪，或命中空行）。
- ❌ 用「标题与列表之间的空行」当 `line` → 无段落归属，必失败。
- ❌ `npm run cli -- scan … --format json` 再 `JSON.parse` 管道：npm 可能把 `> mda@…` 打进 stdout → 解析失败；应 `node dist/cli/main.js` 或 MCP。
- ❌ 只改正文不走 writer/MCP，手搓 `@anno` 行 → 违反源文件保护与枚举校验约定。

---

## 20. 设置入口与清空全部批注（GUI）

**规则**：
- 自动保存只在「视图 → 设置…」配置，键仍为 `mda-autosave`；勿在文件菜单再放 radio。
- 「记住上次会话」写入 `workspace-prefs.json` 的 `rememberSession`（默认开）；关时清除工作区根与最近文件，启动进欢迎页；命令行初始文件仍可打开。
- 「记住界面习惯」键 `mda-remember-layout` + `workspace-prefs.rememberLayout`（默认开；含窗口大小/位置）；关时不读写布局习惯并清除已存键；主题/语言/自动保存不受影响。
- 批注状态筛选默认仅 `open`；级别默认全选。
- `clearAllAnnotations` 须源文件保护 + 原子写入；GUI 确认后调用，dirty 禁用。

### ✅ 正确

```javascript
applyAutosavePref(mode, { toast: true, persist: true }); // 设置弹窗保存
applyRememberSessionPref(false, { toast: true }); // 关会话：清 workspace + recents
applyRememberLayoutPref(false, { toast: true }); // 关习惯并 clearLayoutHabits
filterStatus = { open: true, resolved: false, wontfix: false };
await clearAllAnnotations(filePath); // 返回删除条数
```

### ❌ 错误

- ❌ 设置点遮罩即关且未保存 → 偏好丢失（应与批注编辑框一致：遮罩不关）。
- ❌ 关闭「记住上次会话」后仍 `addRecent` / `setWorkspaceRoot` 落盘，或启动仍自动打开 `recents[0]`。
- ❌ 先关会话记忆再打开文件、后开启开关却不补写当前文件 → 下次仍欢迎页（开启时须立刻 `addRecentFile(currentFilePath)` / `setWorkspaceRoot`）。
- ❌ 关闭「记住界面习惯」后仍写入 `mda-panel-visible` 等键。
- ❌ 循环 `removeAnnotation` 且中间无保护校验聚合 → 可用，但不如一次 `clearAllAnnotations`。
- ❌ dirty 时仍允许清空 → 重载会丢掉未保存正文编辑。

---

## 21. 图片默认缩放与预览调宽（GUI）

**规则**：
- 设置键 `mda-preview-media-default-width`：`auto` / `25` / `50` / `75`（100%=自动）；文案为「**图片**默认缩放」。
- **显示宽 = 各图「自动」固有宽 × 系数**，不是压成预览栏同一绝对宽度。
- **流程图不受此项影响**：边框通栏（正文栏宽），SVG 固有尺寸居中；不支持拖拽调宽。
- 图片用户拖拽覆盖写入会话表；拖动中仅当前图显示蓝角标；双击还原为当前设置比例。
- 复制预览读 `data-mda-display-width`，不写回 Markdown。

### ✅ 正确

```javascript
// 图片
var autoW = getImageAutoWidthPx(img);
var w = Math.round(autoW * getMediaScaleFactor());
applyImageDisplayWidth(img, w, { skipRemember: true });
// 流程图：通栏边框 + 固有内容
layoutMermaidFixedColumn(holder);
```

### ❌ 错误

- ❌ 把 50% 当成「预览栏宽的 50%」强制套到所有图 → Class 等小图几乎不变或被撑大。
- ❌ CM6 Mermaid「自动宽」= 正文栏宽再把 SVG `width:100%` → 小图被横向撑满，调 `rankSpacing` 也看不出效果。
- ❌ `body.mda-img-resizing` 下给**所有** `.mda-img-resize-handle` 提亮 → 拖一张图时满屏蓝角标。
- ❌ 设置里先 `setSettingsModal(true)` 再引用已删变量名 → 弹窗失败、菜单永久锁死（须 try/catch 解锁）。
- ❌ 双击还原只清样式不清 `imageDisplayWidths` → 下次渲染又套回手动宽。

---

## 22. KaTeX 预览与复制预览转图（GUI）

**规则**：
- GUI preload 使用与 `katex.min.css` / `fonts/` 同版本的 KaTeX；`trust:false`，不把公式插件放入 core renderer。
- 行内公式只微调字号与基线；块级公式使用紧凑居中卡片，超宽内容在卡片内横向滚动。
- 复制预览按公式本体尺寸构造 SVG `foreignObject`，内联 KaTeX CSS/字体后以 **2× 像素密度**离屏栅格化；HTML 中仍写逻辑宽高。
- 内联字体会显著放大 SVG，须用 UTF-8 Base64 data URL 交给离屏 `Image` 加载；尺寸须覆盖 `.katex-html` 全部可见子节点并补偿不对称溢出，行内公式仅保留紧凑安全边距，块级公式再使用较大留白。
- 含公式表格整体转为一张 2× PNG，避免目标编辑器重新排列单元格内的多个公式图片；整表失败再回退逐公式导出。
- 公式导出禁止滚动预览、插入临时视口节点或调用 `capturePageRect`；单个导出失败须回退 TeX/`[公式]`，不阻断整篇复制。

### ✅ 正确

```javascript
var payload = MDAKatexExport.buildSvgPayload({
  html: katexClone.outerHTML,
  css: inlinedKatexCss,
  width: logicalWidth,
  height: logicalHeight,
  scale: 2,
});
canvas.width = payload.pixelWidth; // 清晰像素
img.setAttribute('width', String(payload.logicalWidth)); // 粘贴显示尺寸
// clone 须锁定 live 公式的 computed font-size/line-height，测量取 rect/offset/scroll 最大值。
```

### ❌ 错误

- ❌ 截取 `.katex-display` 的整行宽度 → 粘贴后公式图带大块左右空白。
- ❌ canvas 只按 CSS 逻辑尺寸生成 1× PNG → Windows 高 DPI / 公众号缩放后模糊。
- ❌ 用预览 `1.05em` 的尺寸装载导出 CSS 默认 `1.21em` 公式，或在 foreignObject 内固定宽高并 `overflow:hidden` → 长公式/分式被裁切。
- ❌ 用 Blob URL 加载含 `foreignObject` 的 SVG 后再画入 canvas → Chromium 可能判为跨源污染，`toDataURL()` 失败并让全部公式回退为 TeX。
- ❌ 行内公式与块级公式共用大留白，或复制表格强制 `width:100%` → 单元格内公式频繁换行、行高膨胀。
- ❌ 把临时公式节点插到页面再 `capturePage` → 复制时闪白、滚动跳动。
- ❌ 字体内联失败后继续引用 `file://.../fonts` → foreignObject 中缺字或空白；应抛错走文本回退。

---

## 23. CM6 内联装饰与文字拖选可见性（GUI 编辑面）

**规则**：
- CM6 选区层（`.cm-selectionBackground`）画在内容**下方**，**只覆盖实际选中字符**；禁止给整段内联装饰 span 打选中 class（会看起来像「整块都被选中」）。
- 行内代码 `.mda-cm-code` 等内联装饰须用**半透明** `background`（`color-mix`），否则不透明底色会挡住选区层——实际已选中但视觉上看不到。
- 引用块仅保留左侧 `--blockquote-bar` 竖条，**勿**给整行加不透明选中色背景。
- 表格单元格 / 流程图源码编辑器等 widget 内文字拖选：用 `[contenteditable]::selection` + `--table-text-sel`（`#b8d4fe`）；**勿**用 `<textarea>`（Electron 内 `::selection` 常回落为系统深蓝）。
- 流程图源码聚焦时须收起 CM6 文档选区并隐藏 `.cm-cursor`，避免底层选区叠色。
- **禁止**为修选中态去改 `click-collapse`、hide-mark、`atomicRanges` 或装饰层 `selectionSet` 指纹（见 `AGENTS.md` §8.13、`§9` 4l）。

### ✅ 正确

```css
/* index.html — 仅字符级选区高亮 */
.mda-cm6-host .cm-selectionBackground { background: var(--cm-sel-bg) !important; }
.mda-cm6-host .mda-cm-code { background: color-mix(in srgb, var(--code-bg) 42%, transparent); }

/* 表格 / Mermaid 源码 — contenteditable + 与表格一致的选区色 */
.mda-cm-mermaid-source-input[contenteditable="true"]::selection {
  background-color: var(--table-text-sel) !important;
}
```

```javascript
// mermaid.js — 源码用 contenteditable，勿用 textarea
const sourceEditor = document.createElement('div');
sourceEditor.setAttribute('contenteditable', 'true');
```

### ❌ 错误

- ❌ `inline-selection-style.js` 给重叠选区的整段 span 打 `mda-cm-in-selection` → 引用块/标题/粗体看起来像整段选中。
- ❌ 只靠 `.cm-selectionBackground` 却不把行内 code 背景改半透明 → 不透明胶囊盖住选区层，用户以为没选中。
- ❌ 流程图源码用 `<textarea>` 指望 `::selection` 变色 → Electron 仍显示系统深蓝选区。
- ❌ 用 `display:none` / `font-size:0` 隐藏语法标记 → 破坏 `posAtCoords`（须 `Decoration.replace` 零宽 widget）。
- ❌ 为修选中态顺带改 `mouseup placeCaret` 或装饰层全量重建 → 光标错位、标题拖选闪烁。

---

## 24. CM6 围栏代码块 widget 区间（`expandFenceBlockRange`）

**规则**：
- Lezer 可能把 `@anno` JSON 行**误识别**为 `FencedCode`（`from` 落在 JSON 中间）。
- `expandFenceBlockRange` **不得**在找不到开围栏时回退 `alignHintLineRange(text, from, inflatedTo)` —— 会吞掉批注行、正文与后续章节，表现为代码块后大片空白。
- 估高须按**围栏正文行数**（`estimateCodeFenceHeight`），勿用整块 `source` 的 `_lineCount`。

### ✅ 正确

```javascript
// parse-fence.js — 自 hint 行向下扫描真实 ``` / ~~~ 开围栏
const open = findFenceOpenFrom(text, lineStart, 24);
if (!open) return alignHintLineRange(text, from, Math.min(to, from + 1), len);
return expandFenceFromOpen(text, open.openFrom, open.marker);
```

### ❌ 错误

- ❌ 信任语法树偏大的 `to` 做整块 replace → 表格/Mermaid/后续标题被 widget 吞掉。
- ❌ `CodeFenceWidget` 用 `_lineCount * lineHeight` 估高 → CM6 `widgetBuffer` 预留巨大空白。
- ❌ 围栏内含 `[comment]: <> (@anno …)` 样例行时未向下找到真实 ` ```markdown ` 开围栏 → 2.1 节演示稿空白。

---

## 25. CM6 围栏代码块内 Enter 编辑（`code.js`）

**规则**：
- 编辑期以 **`localCode` 为真相**，勿在每次 Enter 时 `replaceBlockRange`（会销毁 widget、丢焦点）。
- contenteditable **`textContent` 吞尾部 `\n`** → 须 `setPlainCodeDom`（每行 `<br>`，空行 ZWSP）；高亮态 `highlightHtmlWithTrailingLines` 补尾部 `<br>`。
- **失焦** `commitCodeEdit` 写回 CM6；保存前 `flushActiveWidgetEditsBeforeSave` blur 活跃 `.mda-cm-code-input`。
- 块内 **Ctrl+Z/Y** 走 widget 本地栈；菜单撤销优先 `tryCodeBlockUndo`。
- `onCodeBlockDirty({ dirty: localCode !== self.code })`：`dirty === false` 时须 `syncDirtyFromEditor`（撤销回到已提交内容应取消 `*`）。
- `serializeFencedCode` **勿** `replace(/\n+$/g)` 剥尾部换行（末尾空行会丢失）。

### ✅ 正确

```javascript
// Enter：splice localCode，renderFromLocalCode，markCodeDirty
spliceLocalCode(getCaretOffset(), '\n', 0);

// app.js
onCodeBlockDirty: function (info) {
  if (info && info.dirty === false) syncDirtyFromEditor();
  else setDirtyState(true);
},
```

### ❌ 错误

- ❌ Enter 即 `onEditCodeBlock` → widget 重建、光标跳到块外、高度错位。
- ❌ `codeInput.textContent = localCode` 且 `localCode` 以 `\n` 结尾 → 只见行号、不见最后一行。
- ❌ `onCodeBlockDirty` 只 `setDirtyState(true)` → 块内撤销后仍显示未保存。
- ❌ `serializeFencedCode` 去掉尾部 `\n` → 末尾回车失焦后源码无空行。

---

## 26. CM6 widget 内文字拖选（`widget-editable-guard`）

**规则**：
- 表格格 / 代码块 / Mermaid·公式源码等 **widget 内 `contenteditable`**：文字拖选走浏览器原生 `::selection`（`--table-text-sel`），**勿**同步 CM6 文档选区到格内（会触发紧致层错位或渲染进程卡死）。
- CM6 `EditorView.domEventHandlers` 返回 `true` 时会 **`preventDefault()`** → 拖选 `mousemove` 被拦则格内**完全无法选取**。
- 正确隔离：`attachWidgetEditablePointerIsolation`（捕获阶段 `stopPropagation`）+ `EditorState.transactionFilter` 坍缩 CM6 非空选区；`tight-selection.js` 在 widget 聚焦或 `coordsAtPos` 不可靠时跳过。
- 预览 CSS：`body.mda-cm6-mode-preview .cm-content *::selection { transparent }` 须被 widget 更高特异性规则覆盖，否则「能选但看不见」。

### ✅ 正确

```javascript
// widget-editable-guard.js — 用 transactionFilter 坍缩 CM6 选区，勿 domEventHandlers return true
EditorState.transactionFilter.of(function (tr) {
  if (!tr.selection || !shouldSuppressCm6Selection()) return tr;
  if (tr.selection.main.empty) return tr;
  return { ...tr, selection: EditorSelection.single(tr.selection.main.head) };
});

// live-preview.js — 扩展数组须 .concat() 展开
.concat(createWidgetEditableGuardExtension())
```

```css
/* index.html — 特异性高于 .cm-content *::selection */
body.mda-cm6-mode-preview .mda-cm6-host .mda-cm-table [contenteditable="true"]::selection {
  background-color: var(--table-text-sel) !important;
}
```

### ❌ 错误

- ❌ widget `mousedown`/`mousemove` 在 `domEventHandlers` 中 `return true` → `preventDefault`，格内无法拖选。
- ❌ 仅靠 `stopPropagation` 却不坍缩 CM6 选区 → 紧致层在表格 widget 上错位、高亮飞到正文，严重时 UI 无响应。
- ❌ `createWidgetEditableGuardExtension()` 放进 `[...]` 未展开 → 守卫扩展未注册，回归无保护。
- ❌ 混用 `lineBlockAt` 文档坐标与 `coordsAtPos` 视口坐标画紧致层 → 高亮错位；`while (pos < to)` 在块边界不前进 → 死循环（已修，勿再引入）。

---

## 27. CM6 块 widget 邻接行指针（`click-collapse`）

**规则**：
- 大块 widget 撑高后，**其下方/上方邻接正文行** CM6 `posAtCoords` 常落到**下一行行首**；`coordsAtPos` 横向可偏几十像素、纵向却接近 → 勿用「总距离 > 阈值」触发邻行重选。
- **单击/拖选**：`mousedown` 非 Shift、非多击须抢先 `setSelectionAtClick` 并 `return true`；拖选 `mousemove` 自管 `applyDragSelectionAt`；`event.buttons&1===0` 或 **document 捕获 `mouseup`** 必须结束 `mouseDown` 会话。
- **双击/三击**：自行 `wordAt` / `docLineAtClick`+`lineSelectionRange`；三击勿 `line.to+1`（head 落下一行行首会被 hide-mark 吃进下一行列表项）。
- 行归属优先 **`.cm-line` DOM**（`caretRangeFromPoint`、Y 最近行），不信失真 `coordsAtPos` 行带。

### ✅ 正确

```javascript
// mousedown：阻断 CM6 默认错位落点
if (!event.shiftKey && event.detail === 1) {
  setSelectionAtClick(view, event.clientX, event.clientY);
  view.focus();
  return true;
}
if (event.detail === 2) {
  selectWordAtClick(view, event.clientX, event.clientY);
  return true;
}

// refineIfFar：仅纵向偏差才邻行重选
if (Math.abs(dy) > REFINE_DIST_PX) return refinePosAtClick(...);
return pos;

// 三击：不吃到下一行
const range = lineSelectionRange(state, docLineAtClick(view, x, y));
```

### ❌ 错误

- ❌ 只在 `mouseup` `placeCaret`、不拦 `mousedown` → 闪行且拖选卡在下一行。
- ❌ `refineIfFar` 用 `dx²+dy²` 触发邻行重选 → widget 下方横向大偏差时吃到上一空行。
- ❌ 三击 `line.to+1` + `adjustSelectionForHiddenMarks` → 选区含下一行 `2.`。
- ❌ 拖选仅编辑区 `mouseup` 清状态 → 区外松手后移入仍扩展选区。

---

## 28. CM6 右键菜单与 widget 内选区（`context-menu` / `table-chrome`）

**规则**：
- 右键 **mousedown** 须在 **document 捕获**、且早于各表 `onDocPointer`，对 widget `contenteditable` / CM6 正文快照选区并 `preventDefault`。
- 表格 `clearTableInteraction` **不得** `window.getSelection().removeAllRanges()` 清全局选区；仅当选区落在**本表** `tableWrap` 内才清除。
- 表外点击：`onDocPointer` 对 **button 2 直接 return**；`media-outside-click` 同理。
- 代码块：快照保存逻辑偏移；`contextmenu` 时再 hljs→plain 并 `restoreDomSelection`；菜单期 `setWidgetDomMenuGuard(true)` 防 blur 提交。
- 正文选区命中：`cmClickInSelection` 须用 `posAtClick` / DOM Range 边界，**禁止**仅依赖 `posAtCoords`/`coordsAtPos`（块 widget 下方高度图失真 → 长文档靠后正文右键丢选区）。

### ✅ 正确

```javascript
// document 捕获、早于各表 onDocPointer
document.addEventListener('mousedown', onMouseDown, true);

// 仅清本表内选区
if (tableWrap.contains(range.commonAncestorContainer)) {
  domSel.removeAllRanges();
}

if (e.button === 2) return; // onDocPointer / media-outside-click

// 正文：校准落点已在选区内则保留（勿再被 coordsAtPos 像素框否决）
if (clickPos != null && clickPos >= from && clickPos <= to) return true;
```

### ❌ 错误

- ❌ 每个表的 `onDocPointer` 在表外右键调用全局 `removeAllRanges` → 长文档靠后代码块/单元格右键必丢选区（README §运行指引 后多表场景）。
- ❌ 仅在 `view.dom` 捕获快照、晚于 document 表监听 → 快照时选区已被清空。
- ❌ mousedown 快照前 `ensurePlainForEdit` 压平 hljs → 可见选区闪没。
- ❌ 正文 `cmClickInSelection` 只用 `posAtCoords` + `coordsAtPos` 像素框 → 靠后段落右键误判为区外、不 `preventDefault` 而丢选区。

---

## 表格列宽拖拽「粘鼠标」（GUI / table-resize）

**规则**：拖拽列宽/行高时不得销毁手柄 DOM；松手必须清掉 `body.mda-cm-table-resizing*`。

### ✅ 正确

```javascript
function onMove(e) {
  if (!dragging) return;
  if (e.buttons === 0) { finishDrag(true); return; }
  applyTableLayout(table, parsed, wrap);
  syncActiveHandleGeometry(); // 只改当前手柄 left/top，不 innerHTML=''
}

// ResizeObserver / scroll
if (resizeCtl.isDragging()) return;
resizeCtl.rebuildHandles();
```

### ❌ 错误

```javascript
// 每次 mousemove 全量重建 → 卸掉 mousedown 目标，Electron 丢 mouseup
applyTableLayout(...);
rebuildHandles(); // overlay.innerHTML = ''
activeHandle.classList.add('dragging'); // activeHandle 已是游离节点
```

现象：松手后光标仍是 `col-resize`，再移动鼠标列宽还跟着变。

---

## 29. 选区打开查找 / 代码块保持高亮（GUI find-replace + code.js）

**规则**：有选区打开查找须填词且不跳文档首命中；代码块/表格格选区在 DOM；`Ctrl+F` 捕获阶段；点击代码块保留 hljs。

### ✅ 正确

- `show(mode, { text, from, to, skipScroll: true })` → `refreshMatches(false, { skipScroll: true })` + `indexOfMatchForSelection`
- `window.addEventListener('keydown', onFind, true)` 处理 `Ctrl+F/H`（代码块冒泡会 `stopPropagation`）
- `getWidgetFindSeed(view)` 把代码块/格内选区映射到文档偏移
- 点击/聚焦代码块**不** `ensurePlainForEdit`；输入后 `paintHighlight` + `reapplyWidgetFindHighlights`

### ❌ 错误

- 有选区仍 `refreshMatches(true)` → 视口飞到第一个命中
- 只读 CM6 `selection.main` 当种子 → 代码块/格内选区打开查找词为空并跳首命中
- 查找快捷键只挂冒泡阶段 → 块内 `Ctrl+F` 无效（工具栏却正常）
- focus/mouseup 压平 hljs → 查找 mark 与语法色一起消失

---

## 30. 关窗幽灵进程与单实例锁（GUI main.js）

**规则**：关窗先 hide 再等 `confirmClose` 时，必须有超时退出与取消恢复；二次启动须能唤醒隐藏窗。

### ✅ 正确

- 关窗 `armCloseWatchdog`；超时仍隐藏 → `finishAppClose`
- 取消关闭 / 设置拦截 → `abortClose` 清看门狗并 `show`
- `second-instance` → `abortAppClose` + `focusOrCreateMainWindow`

### ❌ 错误

- hide 后只等渲染回调、无看门狗 → 幽灵进程占锁，双击 md 打不开
- 取消关闭不 `show` → 窗口消失但进程仍在
- 二次启动只 `focus` 隐藏窗 → 用户看不见任何窗口

---

## 31. 编辑工具栏溢出左右滚动（GUI toolbar.js）

**规则**：放不下才出左右钮；`scrollLeft≈0` 无左钮；槽位宽度为 0 时不判溢出。

### ✅ 正确

- `viewW < 1` → 清 `is-overflowing`、隐藏两钮
- `showPrev = overflowing && scrollLeft > EPS`；`showNext` 对称
- 溢出时去掉首尾 `margin:auto`，保证左端完全可见对应 `scrollLeft=0`

### ❌ 错误

- 槽位仍 `hidden` 时按 `scrollWidth - 0` 判溢出 → 误加 `is-overflowing` / 初始化异常，看起来像「版本回退」丢了中间工具栏
- 溢出时仍居中 auto margin → `scrollLeft=0` 却看不到左端，左钮逻辑失真

---

## 32. 自动 URL → 超链接（GUI auto-link）

**规则**：
- `www.*` 收尾（空格/Enter 等）→ `[www…](https://www…)`
- `http(s)://` 后再输入一字 → `[url](url)`，继续输入同步 text/href
- 粘贴单一 URL/www 立刻包装；围栏/行内 code 内不转换
- 链文本末 Enter/Space → 收尾符须在整段 `](…)` 之后；选中可见 URL 删除须整段去掉

### ✅ 正确

```javascript
planPasteAutoLink('www.baidu.com')
// → '[www.baidu.com](https://www.baidu.com)'
exitAutoLinkWith(view, '\n') // 或 wrapBareUrlThenBreak
// → 文档 '...](url)\n'，caret 在换行后
expandRangeOverLinks(state, 0, contentEnd) // 含 [ 止于文本末
// → 扩到整段 link.to，Backspace 不留 ](url)
```

### ❌ 错误

- ❌ 只靠 GFM 裸 URL 节点、不写 `[text](href)` → `www` 文案与可打开 href 无法分离
- ❌ 在 `Link` 文本内继续输入却不同步 href → 可见 `https://ww`、打开仍是 `https://w`
- ❌ 代码块内也自动包装 → 样例 URL 被改坏
- ❌ 链文本末 Enter 插在 `]` 前 → `[url\n](url)`
- ❌ 选中可见 URL 只删 `[text` → 留下 `](url)`

---

## 33. 行内样式段末 Enter（GUI inline-mark-break）

**规则**：纯加粗/斜体等行，光标在可见文本末（闭定界符 hide-mark 内侧）按 Enter，换行插到闭定界符之后。

### ✅ 正确

```javascript
planExitTrailingMarksBreak('**CLI 模式：**', tree, contentEnd, '\n')
// → from=doc.length, insert='\n'  →  '**CLI 模式：**\n'
```

### ❌ 错误

- ❌ 默认在 `content.to` 插入 `\n` → `**CLI 模式：\n**`（定界符拆行）

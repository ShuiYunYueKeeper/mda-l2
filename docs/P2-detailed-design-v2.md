# 设计文档 — MDA 2.0 详细设计（Phase A Free + Phase B Pro AI）

> 前置：[`P1-architecture-v2.md`](P1-architecture-v2.md)（**已确认** 2026-07-13）  
> 状态：**已确认**（2026-07-13）

---

## 版本历史

| 版本 | 时间 | 触发原因 | 综合置信度 | 关键变更 |
|------|------|---------|-----------|---------|
| v1 | 2026-07-13T11:15:00+08:00 | P1 确认后 P2 启动 | 84% | Phase A Free 详设；Phase B AI 概要；交付门禁 |

---

## 0. 交付阶段与门禁

### Phase A — Free 2.0（必须先完成）

| 包 | 功能 | 验收 |
|----|------|------|
| A1 | F1 预览（sync-scroll、TOC、KaTeX、表格、选区高亮） | AC-1 |
| A2 | F2 编辑（find/replace、editor-assist、Ctrl+G） | AC-2、AC-2b |
| A3 | F3 批注（选区 anchor、双向定位、1.0 兼容） | AC-3–AC-5 |
| A4 | F8 文件管理 | AC-9–AC-11 |
| A5 | F6 MCP 全部 tools | AC-7 |
| A6 | 导出 HTML/PDF、electron-updater | Free 扩展 |
| — | `npm test`、覆盖率 ≥88% | AC-8 |

**门禁**：用户书面/对话确认「Free 可交付」→ 才进入 Phase B。

### Phase B — Pro AI（Phase A 之后）

| 包 | 功能 | 验收 |
|----|------|------|
| B1 | License 激活 | — |
| B2 | F9 AI BYOK（续写、Ctrl+Space 补全弹层、美化 diff） | AC-6、AC-6b、AC-6c |
| B3 | 官网 Pro 购买流 | — |

---

## 1. `@mda/core` 扩展

### 1.1 `AnnotationAnchor` 与 JSON

```ts
interface AnnotationAnchor {
  start: number;  // UTF-16，含 BOM 与 textarea.value 一致
  end: number;    // exclusive
  quote?: string;
}
```

- `parser`：JSON 含 `anchor` 且 `start/end` 为有限非负整数、`start < end` → 保留；否则忽略 anchor 字段，批注仍有效
- `writer.addAnnotation(file, paragraphLine, input)`：`input.anchor?` 写入批注行 JSON；**不改正文**

### 1.2 `src/core/anchor.ts`

```ts
/** 从整篇 text 取 UTF-16 子串（与 JS string 索引一致） */
function sliceUtf16(text: string, start: number, end: number): string

/** 校验 anchor 在 [0, text.length] 内 */
function validateAnchor(text: string, anchor: AnnotationAnchor): boolean

/** anchor.start 映射到 1-based 行号（用于批注行插入位置） */
function anchorToLine(text: string, start: number): number

/** 正文变更后检测：原 anchor 处是否仍等于 quote */
function isAnchorStale(text: string, ann: Annotation): boolean
```

### 1.3 `src/core/outline.ts`

```ts
interface HeadingNode {
  level: number;      // 1-6
  title: string;      // 去 # 与首尾空白
  line: number;       // 1-based 标题行
  children: HeadingNode[];
}

/** 围栏内 # 不算标题；setext 标题可选 2.1 */
function extractHeadings(text: string): HeadingNode[]
```

**算法**：
1. `lines = split(/\r?\n/)`，`mask = buildCodeFenceMask(lines)`
2. 对非 mask 行匹配 `/^(#{1,6})\s+(.+)$/`
3. 栈构建树：遇到 `level` 时 pop 至 `stack.top.level < level`，挂到父 `children`

---

## 2. Phase A — 预览（F1）

### 2.1 同步滚动 `sync-scroll.js`

**构建映射（每次 `parseAndRender` 后）**：

```js
// blockTops[i] = preview 内第 i 个 [data-line] 块顶部 offsetTop（相对 preview 内容）
function buildBlockMap(previewEl) {
  var blocks = previewEl.querySelectorAll('[data-line]');
  return Array.from(blocks).map(function (el) {
    return { line: parseInt(el.getAttribute('data-line'), 10), top: el.offsetTop };
  });
}
```

**editor → preview**：

```js
function onEditorScroll(editor, previewPane, map) {
  if (syncLock) return;
  syncLock = 'editor';
  var ratio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
  previewPane.scrollTop = ratio * (previewPane.scrollHeight - previewPane.clientHeight);
  syncLock = null;
}
```

**preview → editor**：同上反算；点击 preview 块时 **强制 reconcile**：`scrollEditorToLine(line)` 用行号→`textarea` 行首 offset。

**防抖**：scroll 事件 16ms throttle；`syncLock` 防环路。

### 2.2 选区高亮 `anchor-highlights.js`

使用 **CSS Highlight API**：

```js
function applyAnnotationHighlights(previewEl, annotations, sourceText) {
  var ranges = [];
  for (var ann of annotations) {
    if (!ann.anchor || !validateAnchor(sourceText, ann.anchor)) continue;
    var domRange = anchorToPreviewRange(previewEl, sourceText, ann.anchor);
    if (domRange) ranges.push({ range: domRange, level: ann.level });
  }
  // CSS.highlights.set('mda-anno-critical', new Highlight(...))
}
```

`anchorToPreviewRange`：P4 POC 首项；失败路径见 §5。

### 2.3 KaTeX（preload）

- 依赖 `markdown-it-katex` 或自研 `$...$` 规则插件，**仅 preload `md` 实例**
- 块级 `$$` 与行内 `$`；围栏内不处理

---

## 3. Phase A — 编辑（F2）

### 3.1 查找替换 `find-replace.js`

**状态**：`{ query, replace, regex, caseSensitive, matchIndex, matches[] }`

```js
function findAll(text, query, opts) {
  // regex 或 literal；返回 [{ start, end }] 升序
}

function findNext(state, fromPos) {
  // 循环 matches；更新 editor selection + 可选 overlay 高亮全部 match
}

function replaceOne(state, editor) {
  // 替换当前 match；setDirty(true)
}

function replaceAll(state, editor) {
  // 从后往前 replace 保 offset
}
```

UI：非模态顶栏浮层；`Esc` 关闭；`Enter`/`F3` 下一个。

### 3.2 辅助编辑 `editor-assist.js`（核心伪代码）

```js
function wrapSelection(value, start, end, before, after, placeholder) {
  if (start === end) {
    var ins = before + (placeholder || '') + after;
    return { value: splice(value, start, 0, ins), selectionStart: start + before.length, selectionEnd: start + before.length + (placeholder||'').length };
  }
  var selected = value.slice(start, end);
  return { value: splice(value, start, end - start, before + selected + after), selectionStart: start, selectionEnd: end + before.length + after.length };
}

function toggleLinePrefix(value, cursorLine, prefixFn) {
  // prefixFn(lineText) => newPrefix | null；多行选区逐行
}

function indentLines(value, start, end, deltaSpaces) {
  // 选中行首增删 deltaSpaces 个空格
}
```

**围栏守卫**：`isInsideCodeFence(value, pos)` 经 preload 调 `core.buildCodeFenceMask`。

---

## 4. Phase A — 文件管理（F8）

### 4.1 文档状态机（`app.js`）

| 状态 | 条件 | 保存 | 批注 |
|------|------|------|------|
| `WELCOME` | 无 buffer | — | 否 |
| `UNTITLED` | buffer 有内容、无 path | Save As | 否 |
| `OPEN` | 有 path | Ctrl+S 写盘 | 是（非 dirty） |

```js
function newDocument() {
  guardDiscard().then(function (ok) {
    if (!ok) return;
    currentFilePath = null;
    currentText = '';
    editorEl.value = '';
    setState('UNTITLED');
    setDirtyState(false);
    showEditorPane(true);
  });
}

async function saveOrSaveAs() {
  if (!currentFilePath) return showSaveDialogAndWrite();
  return writeCurrentFile();
}
```

### 4.2 `recent-files.js`

- 路径：`app.getPath('userData') + '/recent-files.json'`
- `addRecent(path)`：去重、unshift、截断 20、写盘
- `getRecents()`：过滤 `!fs.existsSync`

### 4.3 `listMarkdownTree(rootDir)`

```js
function listMarkdownTree(dir, opts) {
  // 跳过 .git, node_modules
  // 递归；返回 { name, path, isDir, children? }
  // 文件扩展名 ∈ MARKDOWN_FILE_EXTENSIONS
}
```

---

## 5. Phase A — 选区批注（F3）与 POC

### 5.1 预览选区 → UTF-16 `selection-anchor.js`

**POC 步骤（P4 第 1 天）**：

1. 用户在 preview 选中 Selection
2. 取选中范围内所有文本节点，向上找 `[data-line]` 得 `lineStart`
3. 累加节点 offset + 块内 walk 得相对 offset
4. 换算全文件 UTF-16：`fileOffset = lineOffsetUtf16(text, lineStart) + rel`

**降级（POC 失败）**：仅 **源码选区** 批注；预览只读展示 anchor 高亮（从已知 anchor 反绘，不从 preview 新建）

**禁止**：围栏内（code/table）选区批注 → `uiAlert('请在正文段落选择')`

### 5.2 批注行插入

- 有 `anchor`：`paragraphLine = anchorToLine(text, anchor.start)`
- 仍用 `writer.addAnnotation(file, paragraphLine, { ..., anchor })`

---

## 6. Phase A — MCP（F6，全部 Free）

**入口**：`package.json` → `"mda-mcp": "dist/mcp/server.js"`

| Tool | 参数 | 返回 |
|------|------|------|
| `mda_scan` | `path`, `recursive?`, `status?`, `level?` | JSON 同 CLI |
| `mda_add` | `file`, `line`, `content`, `tags?`, `level?`, `anchor?` | `{ annotation }` |
| `mda_edit` | `file`, `id`, patch | `{ annotation }` |
| `mda_remove` | `file`, `id` | `{ ok: true }` |
| `mda_read_file` | `file` | `{ content, scanResult }` |
| `mda_export_review_prompt` | `files[]` | `{ prompt: string }`（**Free**） |

工作区根：环境变量 `MDA_WORKSPACE` 或启动参数；写操作路径必须在其下。

---

## 7. Phase A — 导出与更新（Free）

### 7.1 导出

- **HTML**：当前 preview DOM + 内联样式克隆（复用公众号复制逻辑）
- **PDF**：`preview.printToPDF`（Electron）或 `window.print` 到 PDF 虚拟打印机（P4 选型）

### 7.2 自动更新

- `electron-updater`；检查 GitHub Release / 自建 URL；**Free 可用**

---

## 8. Phase B — Pro AI（概要，P2 不展开实现细节）

> **Phase A 门禁通过后** 按 [`P1-architecture-v2.md` §3.8](P1-architecture-v2.md) 实施。

| 项 | 定稿 |
|----|------|
| Provider | OpenAI 兼容 + DeepSeek 预设 + 自定义 Base URL |
| 补全 | **`Ctrl+Space` 弹层**展示建议；Enter 采纳；Esc 关闭 |
| 续写 | `Ctrl+Shift+Enter` 流式；预览条确认插入 |
| 美化 | diff 三选一：保留 / 采纳 / 编辑后采纳 |
| Key | main + safeStorage；renderer 不见明文 |

---

## 9. 公共接口汇总（Phase A 新增）

### 9.1 `@mda/core` export

```ts
export { extractHeadings } from './outline';
export { validateAnchor, anchorToLine, sliceUtf16, isAnchorStale } from './anchor';
// writer.addAnnotation input 扩展 anchor?: AnnotationAnchor
```

### 9.2 `window.mdaAPI` 新增

```js
// 文件
showSaveDialog(opts) / showOpenFolderDialog()
listMarkdownTree(folderPath) / getRecentFiles() / addRecentFile(path)
// 大纲
extractHeadings(text)  // 或 parseAnnotations 附带
```

Phase B 再增 `getAiSettings` / `aiContinue` / `aiBeautify` 等。

---

## 10. 预死亡分析

| # | 原因 | 缓解 |
|---|------|------|
| 1 | selection-anchor POC 失败 | 降级源码选区；不挡 Phase A 其余交付 |
| 2 | Free 范围过大延期 | 严格 Phase A 清单；PV-6/7 可砍 |
| 3 | sync-scroll 长文漂移 | 块级 reconcile + 点击定位 |
| 4 | Pro 仅 AI 导致收入低 | Free 口碑传播；Pro 面向重度 AI 用户 |
| 5 | MCP 与 GUI 行为不一致 | 共用 core；MCP 集成测试对照 CLI |

---

## 11. 对抗审查

| # | 问题 | 结论 |
|---|------|------|
| 1 | 推测？ | PDF 导出方案、anchorToPreviewRange 细节待 POC |
| 2 | 失效场景？ | 用户只买 Pro 为 AI 但 Free 已够用 → 商业风险 |
| 3 | 更简单替代？ | 选区批注可降级；sync-scroll 可先做单向 |
| 4 | 五折置信？ | preview→UTF-16 映射 |

---

## 12. 综合置信度

| 维度 | 置信度 |
|------|--------|
| Phase A 技术可行性 | 86% |
| Phase B AI（概要） | 80% |
| **综合** | **84%** |

---

## Spec Self-Review

- [x] 无 TODO/TBD
- [x] Phase A/B 边界清晰
- [x] Free 优先门禁明确
- [x] 核心算法/状态机/接口已定义
- [x] 预死亡 ≥3

---

## 确认状态

状态: **已确认**（2026-07-13）

→ [`P3-implementation-plan-v2.md`](P3-implementation-plan-v2.md)

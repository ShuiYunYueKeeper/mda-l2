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
- 缩放钳制 **0.3×–8×**；平移钳制内容中心留在视口内。
- `+/-` 按钮须 `stopPropagation`，**仅内容本身双击**才复位（避免连点按钮触发 `dblclick` 误复位）。
- 工具栏按钮用深色实底，避免白底图片遮挡。

### ✅ 正确

```css
.mda-zoom-stage { transform-origin: center center; cursor: grab; }
/* 不加 will-change: transform */
```

```javascript
bar.addEventListener('click', function (e) { e.stopPropagation(); zoom(...); });
bar.addEventListener('dblclick', function (e) { e.stopPropagation(); });
stage.addEventListener('dblclick', function (e) { e.stopPropagation(); reset(); });
```

### ❌ 错误

- ❌ `.mda-zoom-stage { will-change: transform; }` → 流程图/图片放大后**全糊**。
- ❌ 遮罩层 `dblclick` 监听在任意子元素上复位 → 连点 `−` 两次触发复位。
- ❌ 半透明白色按钮浮在白图上 → **看不见** +/- 控制。
- ❌ 无平移边界 → 内容被拖到视口外**找不回来**。

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

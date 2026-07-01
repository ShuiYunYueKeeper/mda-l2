# AI 协作记录 — P4 实现

---

## Prompt 1: P4 启动 — 项目脚手架 + @mda/core

```
用户: （P3 确认后自动进入 P4）
```

AI 动作（Phase A-C, E）：
- T0: package.json, tsconfig.json, .gitignore, 目录结构, npm install
- T1: model.ts — Annotation/Paragraph/ScanResult 类型 + Zod 校验
- T2: parser.ts — 状态机段落归属算法 + ANNO_REGEX
- T3: writer.ts — atomicWrite + addAnnotation + editAnnotation +
  removeAnnotation + 空行压缩 + verifySourceProtection
- T4: renderer.ts — markdown-it（CommonMark 0.31 + GFM + 图片 fallback）
- CLI: commander 入口 + scan/add/edit/remove 四个命令
- 测试: parser(25边界) + writer(原子性+压缩) + renderer(不可见性+CommonMark)

关键问题及修复：
1. `markdown-it-gfm-tables` 包不存在 — 改用 markdown-it 内置 `md.enable('table')`
2. 源文件保护 verifySourceProtection 在插入/删除时因行号偏移误报 — 重构为
   collapseBlanks 空行压缩后比较
3. E22 段落无空行场景：parser 将连续非空行合并为一个段落 — 测试修正预期值

---

## Prompt 2: GUI 实现

```
用户: 继续
```

AI 动作（Phase D）：
- Electron main process: 菜单（打开/重新加载）、IPC（read-file/write-file/
  open-external/set-title）、`mda <file>` 直接启动
- preload.js: contextBridge + markdown-it（CommonMark 0.31 + GFM + 自定义图片）
- renderer app.js: 内联批注解析 + 预览渲染 + 批注面板 + 编辑弹窗 + 增删改

无框架依赖（纯 JS），通过 preload 桥接 markdown-it 和文件 I/O。

---

## Prompt 3: 构建修复 + 工作流沉淀

```
用户: 继续
```

AI 动作：
- 构建脚本：从 Bash `cp` 迁移到 Node.js `scripts/copy-gui.js`（Windows 兼容）
- demo.md：创建含 6 种批注（4 种级别/3 种状态/多标签）的演示文件
- README.md：完整项目文档
- .claude/workflow.md：工作流沉淀

---

## Prompt 4: 工作流完善

```
用户: 参考通用迭代协议完善工作流（六步循环展开）
```

AI 动作：将通用协议按 P0-P3（设计阶段）和 P4（实现阶段）分别展开，
P4 提交规范细化为 feat/fix/refactor/test/docs/chore 六类 type，
每个阶段标注明确的 Step 1-6 行为说明。

---

## Prompt 5: 整体代码 review + 修复

```
用户: 先帮我整体review一下代码 → 修复 → 按照工作流来
```

AI 动作（P4 修复迭代，遵循六步循环）：

- **审查**：通读 core/cli/gui 全部源码与测试，输出按严重程度分级的问题清单。
- **修复**（共 9 项）：
  1. GUI 点击监听死代码——监听在 IIFE 顶层执行时 `previewPaneEl` 尚未赋值，
     永不绑定（外链 Ctrl+点击、段落定位失效）→ 移入 `buildLayout()`。
  2. GUI 无法定位行号——preload 给块级元素注入 `data-line`，点击段落即设
     `cursorLine` 并高亮，「添加批注」自动带入行号。
  3. `level`/`status` 缺枚举校验 → 可写出无法被 parser 解析的脏批注（静默丢失）。
     model 导出 `isAnnotationLevel/Status`，add/edit/scan 全量校验。
  4. `scan` 目录模式所有行显示目录路径 → `scanFile` 统一设置 `a.file`。
  5. `scan` 表格「段落摘要」恒为空 → 建立 批注 id→段落文本 映射后填充。
  6. CRLF 文件被静默转 LF（违背源文件保护承诺）→ writer/GUI 写回前 `detectEol`。
  7. `editAnnotation` 死变量 `changedLines` → 删除。
  8. CJK 列宽错位 → 新增 `displayWidth/truncateToWidth/padToWidth` 按显示宽度对齐。
  9. `scan` 过滤值非法静默返回空 → 校验并报错退出。
- **测试**：新增 `tests/cli/commands.test.ts`（填补此前空白的 CLI 集成测试，
  锁定 #3/#4/#5），writer 新增 CRLF 保留用例。
- **遗留（需独立一轮）**：GUI 与 core 仍有双份逻辑（parser/writer/renderer 各重写），
  彻底去重需将 `@mda/core` 打包为 preload 可 require 的产物；GUI 写回尚未接入
  `verifySourceProtection`。

---

## Prompt 6: GUI 运行验证 + sandbox 修复

```
用户: 先把GUI跑起来 → md文档没有渲染
```

AI 动作：

- `npm run build` 后启动 Electron，发现预览区与批注列表全空。
- **诊断**：临时为主进程加 `console-message`/`preload-error` 转发，定位到
  `preload-error: module not found: markdown-it` —— preload 运行在 sandbox
  模式，沙箱内 `require` 无法加载第三方模块，导致 `window.mdaAPI` 为 undefined，
  渲染进程 `Cannot read properties of undefined (reading 'onFileOpened')`。
- **修复**：BrowserWindow `webPreferences.sandbox = false`（保留
  `contextIsolation: true`）。重启后日志干净、demo.md 正常渲染、6 条批注全部显示。
- 移除临时诊断代码。

> 复盘：这是 GUI 自实现以来首次真机运行，sandbox 是新版 Electron 默认值，
> 此前未验证导致缺陷潜伏。该问题也再次印证 review 遗留项 #6（GUI 依赖第三方模块
> 的根因）——后续若将 @mda/core 打包进 preload，可一并消除对运行时 require 的依赖。

---

## Prompt 7: GUI/core 去重（消除双份实现，遗留 #6）

```
用户: 推进遗留 #6
```

AI 动作（遵循六步循环）：

- **审查**：确认 tsconfig 为 `module: commonjs`、`outDir: dist`，故 preload
  （`dist/gui/preload.js`）可直接 `require('../core')` 加载编译产物，markdown-it
  亦能由 Node 解析（sandbox 已关闭）。
- **实施**（方案 A：preload 复用 core，而非打包）：
  - preload 改为 `require('../core')`，markdown-it 实例直接用 `core.createMarkdownIt()`
    （复用 CommonMark + GFM + 图片 fallback），仅叠加 GUI 专用的 `data-line` 注入。
  - 经 contextBridge 暴露 `parseAnnotations / renderMarkdown / addAnnotation /
    editAnnotation / removeAnnotation`。
  - app.js 删除自有的 `parseAnnotations`、`isAnnotation`、`generateUUID`、
    `findParagraph`、`writeBack` 及手工行拼接，增删改改调 `api.*` 后从磁盘重载。
  - main.js 移除独立的 `write-file` IPC——写操作统一走 core writer
    （原子写入 + 源文件保护 + 换行保留），顺带修复 GUI 此前写回缺少源文件保护的问题。
  - 附带修复：打开文件时同步更新窗口标题。
- **验证**：`npm run build` + 61 测试全过；以 `node -e` 直接加载 `dist/core`
  （preload 实际路径）跑通 render / add / edit / remove 闭环（批注数 6→6）；
  Electron 实机启动无 preload/渲染错误。

> 收益：GUI 不再有与 core 平行的 parser/writer/renderer 实现，单一真相；
> 且 GUI 写操作自动获得源文件保护与原子写入保证。

---

## Prompt 8: GUI 交互增强 + 输入失焦修复

```
用户: 实现段落色条/段落↔批注双向定位三个功能 → 删除后新增输入框无法编辑
```

AI 动作：

- **三个交互功能**（均依赖 preload 注入的 `data-line`，已用 node 校验 7 个带批注
  段落的 `startLine` 100% 映射到 DOM）：
  1. 含批注段落左侧按级别显示色条（多条取最严重：红 critical > 橙 major >
     黄 minor > 灰 info）。
  2. 点击带批注的段落 → 批注面板高亮并滚动到对应批注。
  3. 点击批注卡片 → 预览滚动并高亮到对应段落。
- **输入失焦 bug**：删除批注用了原生 `confirm()`，Electron 原生模态关闭后渲染
  进程输入框丢失键盘焦点（最小化/恢复才恢复）。改用 DOM 版 `uiConfirm/uiAlert`
  替换全部原生 `confirm/alert`，并在打开弹窗时用 `requestAnimationFrame` 主动聚焦。

---

## Prompt 9: 交付截图整合（Phase F）

```
用户: 请注意我已经补全了截图@docs/screenshots
```

AI 动作：

- 读取 `docs/screenshots/`（`1.png`~`4.png` + `operation_demo.gif`），逐张确认与需求对应：
  1.png 完整窗口（含标题栏）/ 2.png 四级别色条+段落高亮 / 3.png 标签筛选后 /
  4.png 添加批注弹窗（印证失焦修复）/ operation_demo.gif 操作录屏。
- README 新增「界面截图与演示」一节，以表格嵌入四图 + GIF。
- 提交 `docs: 补充 GUI 界面截图与操作演示 GIF 并写入 README`（仅 6 文件，避免误带产物）。

---

## Prompt 10: 放宽派生物入库与 GUI 编辑限制

```
用户: 先不提交构建产物（待稳定后再提交），@AGENTS.md:218-219 这里需要更改，
后续可能会迭代编辑或其他功能，另外@.cursor/workflow.md 和@.claude/workflow.md
更新文档时也许考虑AGENTS.md
```

AI 动作：

- 回退此前误入库的 `dist/`、`coverage/` 提交，恢复 `.gitignore` 忽略规则。
- AGENTS.md 第 8 节：原「不得提交派生物」改为「派生物默认不入库（待稳定后再视交付决定）」；
  删除「不实现 Markdown 编辑器」硬性禁止（后续可能迭代编辑功能）。
- 两份 workflow（`.claude` + `.cursor`）的 Step 5「文档」新增「同步 AGENTS.md」项。

---

## Prompt 11: GUI 迭代三大功能（P0/P1/P2）

```
用户: 提交，并继续迭代功能和修复bug，依次处理以下功能
P0：我增加了几个测试文档@tests/samples ，点击 @tests/samples/test-basic.md:31
相对链接后，界面变成白色，且此时重新加载或者打开其他文档也仍然是白色
P1：支持拖拽打开md文档，文件菜单支持"打开文件所在目录"；
P2：支持代码语法高亮显示:
    1) 代码块左侧显示代码行数;
    2) 代码块支持右键菜单和快捷键，拷贝(Ctrl+c)、拷贝全部(ctrl+a)，注意拷贝时不能拷贝行号；
    3) 代码块右上角支持拷贝全部的悬浮按钮
```

AI 动作：

- **P0（白屏）根因**：预览区 `<a>` 普通点击触发浏览器默认导航，渲染进程跳离
  `index.html` → 白屏且不可恢复。改为链接点击一律 `preventDefault`，外链走系统浏览器、
  相对 `.md` 在应用内打开；main 增 `will-navigate` + `setWindowOpenHandler` 兜底。
- **P1**：window 监听 `dragover/drop`（同时阻止拖入文件导致的导航白屏），拖入
  `.md/.markdown/.txt` 即打开；文件菜单新增「打开文件所在目录」(`Ctrl+Shift+O`)，
  经 `shell.showItemInFolder` 实现。
- **P2**：preload 用 highlight.js 经 `md.set({highlight})` 注入语法高亮（仅 GUI）；
  app.js 后处理代码块 → 独立行号槽（`user-select:none` 保证复制不含行号）+ 右上角悬浮
  「复制」按钮 + 右键菜单 + 快捷键（`Ctrl+C` 拷贝选区 / `Ctrl+A` 全选）。
- 新增依赖 `highlight.js@^11.9`；`npm run build` + 61 测试通过；Electron 实机启动无报错。

---

## Prompt 12: 右键菜单只弹一次 + 补充快捷键提示

```
用户: 大部分功能已实现，但仍存在bug，右键菜单只出现一次，再次点击右键，菜单不出现，
另外需要右键菜单也需补充（快捷键命令）
```

AI 动作：

- **根因**：旧实现用 `{once:true}` 在 document 注册关闭监听，残留的 `contextmenu`
  once-监听会在下一次右键同一事件里把刚建好的新菜单立即移除。
- **改法**：关闭监听改为**捕获阶段**注册并保存引用，`removeCodeContextMenu` 成对反注册
  （click/contextmenu/window blur）；菜单内部点击放行交由菜单自身处理。
- 菜单项补充快捷键提示（`拷贝 Ctrl+C` / `拷贝全部 Ctrl+A`，按平台显示 `⌘`）。

---

## Prompt 13: GUI 人工测试硬约束 + Markdown 排版优化

```
用户: 以上已修复。完善工作流，涉及到gui的修改，必须由人工测试没问题后才能继续后面的流程。
文档整体渲染效果似乎并不理想，如标题、表格、列表等渲染都不太好，可参照图右边的效果（仅供参考）。
```

AI 动作：

- 两份 workflow 的 Step 4「验证」新增**硬性约束**：凡涉及 `src/gui/**` 的改动，
  自动化测试与 `npm run build` 通过 ≠ 验证完成，必须启动 GUI 让用户实机确认；
  用户明确回复「测试通过」前不提交、不推进下一步。
- index.html 增加 GitHub 风格 Markdown 排版（作用域 `#preview-content`）：标题分级与
  h1/h2 底部分隔线、列表缩进、表格边框/表头底色/斑马纹/横向滚动、引用左竖条、水平线等。

---

## Prompt 14: 首行标题不渲染 + 含括号批注泄漏

```
用户: 标题还是不对，一级标题没有渲染，二级标题看起来像一级标题，
@tests/samples/my_sample.md:15 这条批注显示到原文中了。
```

AI 动作（核心渲染层，CLI/GUI 共用）：

- **bug1**：测试文件带 UTF-8 BOM，首行变成 `\uFEFF# 标题` → markdown-it 不识别为标题。
  渲染/解析前去除起始 BOM。
- **bug2**：批注内容含括号 `n(n-1)/2` 破坏 `[comment]: <> (...)` 链接引用定义语法 →
  整行作为正文渲染泄漏。改为渲染前把批注行**清空为空行**（保留行数 → `data-line` 不变），
  使不可见性对任意内容都成立。
- 新增 2 条回归测试（BOM 标题、含括号批注不可见），63 测试通过。

---

## Prompt 15: 围栏代码块内批注样例不应识别

```
用户: @tests/samples/my_sample.md:26-32 代码块里的批注不应该被识别为真是批注
```

AI 动作：

- 新增共享 `buildCodeFenceMask(lines)`：标记 ```` ``` ````/`~~~` 围栏内（含定界行）的行。
- parser 与 renderer 共用该遮罩：围栏内的 `@anno` 样例**不识别为批注、也不被清空**，
  按字面在代码块中显示；三处行为一致。
- 新增 3 条回归测试（围栏内 ``` 与 ~~~ 不识别、围栏内批注原样渲染），66 测试通过。

---

## Prompt 16: 交付提交（含产物 + 测试 + 提示词文档）

```
用户: 以上已全部通过验证。继续后续流程，注意本次提交需要包含产物以及新增的测试文件，
以及完整的提示词文档（无需read它）@docs/prompts/cursor_workflow_progress_and_recommenda.md
```

AI 动作：

- 同步 AGENTS.md（依赖增 highlight.js、入库策略改为 `dist/` 随版本入库、链接导航禁令、
  渲染预处理与围栏感知隐性规范）与 README（技术栈 + GUI 功能段）。
- `.gitignore` 放行 `dist/`（作为可执行交付物入库；`coverage/`、`node_modules/` 仍忽略）。
- 单次提交纳入：产物 `dist/`、`tests/samples/`（5 样例）、回归测试、完整提示词文档
  `cursor_workflow_progress_and_recommenda.md`（共 66 文件）。

---

## Prompt 17: 命令行相对路径打开目录失效

```
用户: 还有一个bug，使用命令行打开文档，如果是相对路径的话
（如npm run gui -- tests/samples/test-basic.md），将点击打开文件所在目录不生效
```

AI 动作：

- **根因**：命令行传入相对路径，`shell.showItemInFolder` 需绝对路径。
- **改法**：main 启动时用 `path.resolve()` 将初始文件解析为绝对路径再交渲染层
  （`currentFilePath` 全程绝对）；`show-item-in-folder` 处理器亦 `path.resolve` 兜底。

---

## Prompt 18: GUI 四功能迭代（深色/图片/流程图/编辑）

```
用户: 继续迭代以下功能：1、支持深色模式；2、支持加载常见图片；
3、支持流程图渲染；4、支持编辑
```

AI 动作（先确认口径：分栏编辑+实时预览+Ctrl+S 原子整写、mermaid 离线打包、深色跟随系统）：

- **深色模式**：`index.html` 全量改为 CSS 变量 + `[data-theme="dark"]`，`app.js` 内联样式改用主题类；
  菜单「视图 → 切换深色模式」(`Ctrl+Shift+D`)，默认跟随系统、`localStorage` 记忆；hljs 补暗色配色。
- **图片加载**：渲染后把相对/本地 `<img src>` 相对当前文件目录解析为绝对 `file://`；失败降级占位。
- **流程图**：新增 `mermaid` 依赖，`copy-gui` 拷贝离线 UMD 到 `dist/gui/renderer/`，`index.html` 本地引入；
  渲染后拦截 ` ```mermaid ` 代码块 → `mermaid.render` 出 SVG（早于代码块增强），主题联动。
- **编辑**：新增 core `writeRawFile`（原子写入 + `detectEol` 保留换行）；preload `saveFile`；
  渲染层分栏源码编辑 + 防抖实时预览 + `Ctrl+S` 整篇保存；新增 3 个 writer EOL 保留测试。

## Prompt 19: 布局重构 + 编辑批注冲突 + 坏批注泄漏

```
用户: 1、编辑到批注，如果使批注发生错误应该提示用户，或者不允许在编辑模式下修改批注，
你觉哪个更合理？ 2、去掉保存和深色按键，将预览改为批注，批注和编辑平展开
（后续补充：故意删掉批注的一个 ] 改坏格式，结果泄漏到了预览区）
```

AI 动作：

- **布局**：工具栏改为「编辑」「批注」两个独立开关，预览常驻中间；可同时展开为
  源码 ｜ 预览 ｜ 批注 三栏平铺；移除保存/深色按钮（保留菜单 `Ctrl+S`/`Ctrl+Shift+D`，新增批注栏 `Ctrl+B`）。
- **编辑↔批注冲突**：存在未保存编辑（dirty）时禁用批注增删改并提示，保存后恢复。
- **坏批注泄漏（根因）**：原容错正则仍要求 `[comment]` 的 `]`，缺 `]` 的坏行既不入面板又泄漏预览。
  改为宽松识别 `ANNO_ISH`（只认 `<> (@anno` 标记，容忍缺 `]`/坏 JSON），预览前清空这些行 → 不泄漏；
  同一识别用于 `findMalformedAnnotations`，**保存时**弹窗提示格式不正确的行号。用 Node 复现验证：
  good/broken(缺])/brokenJson/围栏内 四类均符合预期。

---

## Prompt 20: GUI 体验增强（编辑器高亮/图片放大/流程图缩放/分栏拖拽）

```
用户: 编辑器语法高亮/行号、图片点击放大、mermaid 缩放、分栏拖拽调宽，以上都需要
```

AI 动作：

- **编辑器高亮+行号**：源码栏改为「透明 `textarea` + `pre` 高亮层 + 行号槽」，preload 暴露
  `highlightSource`（hljs markdown），`scroll` 同步三层，输入时刷新高亮/行号。
- **缩放遮罩**：图片/流程图点击进入遮罩，滚轮缩放、拖拽平移、双击复位、Esc/× 关闭；SVG 直接克隆放大。
- **分栏拖拽**：编辑/批注两栏改为固定像素宽（预览 flex 填充），栏间加 `col-resize` 手柄拖拽调宽。

## Prompt 21: 缩放/分栏 6 项缺陷修复

```
用户: 1、分栏增加复位；2、白图遮挡按钮；3、流程图缩放全模糊；4、图片放大模糊；
5、点缩小会自动复位（比例范围+不自动复位）；6、内容被拖到不可见区
```

AI 动作（定位根因后逐条修）：

- #3/#4 模糊根因：舞台 `will-change: transform` 先栅格化再缩放 → 去掉，改由浏览器按缩放尺寸重绘（矢量清晰）。
- #5 误复位根因：连点 +/- 触发按钮 `dblclick` 冒泡到遮罩复位 → 改为仅内容双击复位，按钮 `stopPropagation`；缩放钳制 0.3×–8×。
- #2 按钮改深色实底 + 提高层级（白图上可见）；#6 平移钳制中心留在视口内；#1 双击分栏手柄复位默认宽度。

---

## Prompt 22: 按 L2 第 3 次评估建议同步文档 + 完善工作流

```
用户: @L2-evaluation-report.md 按照评分建议，更新或补充相关文件，同时完善工作流的文档更新流程，
涉及到gui的改动，需要提示我补充相关截图或录屏
```

AI 动作：

- **quality.md（Q3）**：测试数 70→73，覆盖率精确值，`writeRawFile` 与 GUI 校验链路；
  §5 补充编辑器对齐、坏批注容错、缩放遮罩、分栏拖拽、深色/mermaid 等人工审核点。
- **few-shot（A4）**：新增 §7–§10（dirty+批注冲突、ANNO_ISH vs 严格正则、编辑器 scroll 同步、缩放遮罩陷阱）。
- **截图交付**：新建 `docs/screenshots/README.md` 待补清单；README 标注「待补截图」并链到清单。
- **工作流**：`.cursor/workflow.md` / `.claude/workflow.md` Step 5 扩展为通用清单 + GUI 附加清单，
  硬性约束「GUI 截图/录屏须提示用户补充、AI 不得伪造」。

---

## 实现统计

| 指标 | 数值 |
|------|------|
| 源码文件 | 14 个 |
| 测试文件 | 5 个 |
| 测试用例 | 73 个（全部通过） |
| 代码覆盖率 | Statements 88.36% / Lines 91.29% / Functions 95.34% |
| git commits | 26+ 个 |
| AI 协作轮次 | 42+ 轮 |

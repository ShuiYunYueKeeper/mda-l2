# 质量保障说明（Quality Assurance）

本文件汇总 MDA 项目的质量保障策略，便于评审快速清点：测试体系、覆盖率、数据校验、
源文件安全、人工审核点、Code Review 痕迹与协作资产。

---

## 1. 测试体系

| 套件 | 文件 | 说明 |
|------|------|------|
| parser 单元测试 | `tests/core/parser.test.ts` | E1–E25 边界体系；**E26–E32** anchor 字段解析与归属 |
| writer 单元测试 | `tests/core/writer.test.ts` | 增删改、源文件保护、原子写入、空行压缩、CRLF/LF 保留、`writeRawFile`；**anchor 写入与插入偏移** |
| renderer 单元测试 | `tests/core/renderer.test.ts` | 批注不可见性、含括号批注、BOM 标题、围栏样例、伪子条目硬换行、图片 fallback |
| anchor 单元测试 | `tests/core/anchor.test.ts` | UTF-16 偏移、`shiftAnchorForInsert`、锚点校验 |
| outline 单元测试 | `tests/core/outline.test.ts` | `extractHeadings` 标题树 |
| 配置一致性测试 | `tests/core/config.test.ts` | 锁定外置规则（枚举/配色/严重度/正则）与 core 派生值一致，防止漂移 |
| CLI 集成测试 | `tests/cli/commands.test.ts` | 四命令端到端；**`add --anchor` JSON 校验** |
| GUI 辅助单测 | `tests/gui/*.test.ts` | 选区/编辑辅助、文件操作边界、KaTeX 行内/块级/围栏/安全渲染、2× foreignObject 导出纯函数 |
| 坐标换算单测 | `tests/gui/doc-coords.test.ts` | 磁盘（CRLF/BOM）↔ CM6 文档（LF）偏移互转，覆盖 anchor 双向映射 |
| CM6 默认模式单测 | `tests/gui/editor/pref.test.ts` | `mda-cm6` 未设置/空串/显式关时的默认值判定 |
| CM6 编辑器单测 | `tests/gui/editor/*.test.ts` | 行内定界符融合/拆分/清理、待输入格式、查找高亮的 DOM 偏移映射 |
| MCP 集成测试 | `tests/mcp/handlers.test.ts` | 六 tools 与 CLI scan 对齐、真实路径工作区边界、空字段编辑 |
| GUI e2e（Playwright） | `tests/e2e/gui/*.spec.ts` | 真实 Electron 下的定界符编辑、表格格内取消样式、IME 拼音上屏等 |
| 文档截图采集 | `tests/e2e/capture/docs-screenshots.spec.ts` | 驱动真实实例逐场景落图到 `docs/screenshots/v3/`，使文档截图可随版本重跑刷新 |

运行：

```bash
npm test                                                # jest，含覆盖率
npx playwright test tests/e2e/gui                       # GUI 行为 e2e
npx playwright test tests/e2e/capture/docs-screenshots.spec.ts   # 刷新文档截图
```

**当前状态：581 用例全部通过（79 套件）。**

---

## 2. 覆盖率

| 指标 | 数值 |
|------|------|
| Statements | 88.80% |
| Lines | 91.70% |
| Functions | 95.91% |
| Branches | 70.89% |

> 以 `npm test`（jest --coverage）实测为准；core 行覆盖率 95.98%，renderer 行覆盖率 100%。
> 当前 Jest 统计仅收集 `src/**/*.ts`；主要 GUI JS 与打包脚本不在上述百分比内，仍以实机验收和后续 GUI 集成测试补足。

---

## 3. 数据校验与失败降级

- **枚举守卫**：`isAnnotationLevel` / `isAnnotationStatus`（`src/core/model.ts`）在 add/edit/scan 入口校验，非法值报错退出而非落盘。
- **非法 JSON 降级**：parser 遇到无法解析的批注行 → 跳过 + stderr 告警，**不崩溃**。
- **GUI 保存前校验**：`findMalformedAnnotations` 检出「疑似批注但格式不正确」的行号，保存时弹窗提示用户。
- **编辑态防护**：存在未保存编辑（dirty）时，GUI 禁用批注增删改，避免 core 基于旧磁盘内容写入后重载丢失编辑。
- **可配置规则单一真相**：枚举、级别配色、严重度、批注正则统一外置到 `src/config/annotation-schema.json`，core 从中派生，避免多处硬编码漂移。

---

## 4. 源文件安全（写入）

- **原子写入**：临时文件（`.<name>.<uuid>.tmp`）+ `fs.rename`，失败清理临时文件，绝不直接覆盖。
- **源文件保护**：`verifySourceProtection` 校验写操作只改动批注行，正文逐字节不变。
- **换行保留**：`detectEol` 保持原文件 CRLF/LF 风格。
- **anchor 坐标系统一**：选区批注的偏移按磁盘原文（原 EOL + BOM）计算。CM6 文档恒为 LF 且无 BOM，GUI 经 `renderer/doc-coords.js` 在写盘前后双向换算，避免同一条批注在 GUI 与 CLI/MCP 之间指向不同位置。
- **空行压缩**：删除批注产生的相邻空行压缩，但不触碰正文原有空行。
- **整篇写回**：GUI 源码编辑保存走 `writeRawFile`（原子写入 + `detectEol`），是对正文的全量编辑，**不做**源文件保护校验（区别于批注增删改）。

---

## 5. 人工审核点（Human-in-the-loop）

| 审核点 | 触发条件 | 原因 |
|--------|----------|------|
| **GUI 实机验证（硬约束）** | 任何 `src/gui/**` 改动 | 自动化测试 + `build` 通过 ≠ 验证完成；渲染、双向定位、拖拽、原生模态失焦、代码块右键/快捷键等缺陷只有实机能暴露。详见 `.cursor/workflow.md` / `.claude/workflow.md` Step 4 |
| **关窗 / 单实例锁** | 改动 `main.js` 关窗、`confirmClose`/`abortClose`、second-instance | 关窗后无残留进程；双击 `.md` 可再开；取消关闭窗口重新显示；二次启动能唤醒已 hide 的窗口 |
| **编辑工具栏溢出** | 改动 `toolbar.js` / `.mda-cm-tb-main` 滚动 | 窗口够宽无左右钮；变窄后仅右钮→中段左右都有→最右仅左钮；左侧已尽不显示左钮 |
| **编辑器三层对齐** | 改动源码编辑栏（高亮层/行号槽/textarea） | 字体/行高/padding/`tab-size`/`white-space:pre` 不一致会导致光标与着色错位；须实机输入、滚动、换行验证 |
| **坏批注容错隐藏** | 改动 `ANNO_ISH` / `hideLooseAnnotations` / 保存校验 | 故意删掉 `[comment]` 的 `]` 或改坏 JSON：预览不得泄漏、保存须弹窗提示、围栏内样例仍原样显示 |
| **缩放遮罩** | 改动图片/流程图缩放逻辑 | 矢量清晰（SVG 用改宽高放大，勿舞台 `scale`/`will-change`）；深色全屏预览 SVG 深色底+字可读；默认约 72%–75% 视口；0.3×–8×；连点 +/- 不误复位；**复制**：图→位图；流程图→「图片」+「源码」（围栏），Ctrl+C 默认图片 |
| **分栏拖拽** | 改动三栏布局/手柄 | 拖拽调宽、双击手柄复位默认宽度（编辑 380px / 批注 320px） |
| **深色 / mermaid / 图片** | 改动主题、流程图或图片解析 | 深色切换与流程图配色联动；mindmap/timeline 等勿出现近黑「黄」节点；Timeline 虚线/轴线颜色一致；`samples/mermaid-diagrams.md` 深色+全屏抽检；流程图边框通栏、内容固有尺寸（不受图片默认缩放）；块「复制图片」含完整边框且不发糊；选中块 `Ctrl+C` 复制围栏源码再粘贴可渲染；插入后光标在围栏下空白行 |
| **默认缩放设置** | 改动 `mda-preview-media-default-width` / 预览调宽 | 档位 `自动/25%/50%/75%`：**显示宽 = 自动固有宽 × 系数**（Class 在 50% 须变小）；拖动时仅当前图蓝角标；双击还原当前设置；设置构建失败须解锁菜单 |
| **文件列表 / 大纲** | 改动侧栏或大纲 UI | 字号/行距可读；收起钮明显；大纲子标题可 ▸/▾ 折叠，高亮时自动展开祖先 |
| **KaTeX 公式预览** | 改动 KaTeX 插件/字体/CSS | `samples/katex.md`：行内基线、块级紧凑卡片、复杂/超宽公式、代码围栏负例；浅/深主题与 Windows 100%/125% 显示缩放均清晰 |
| **复制预览（微信公众号）** | 改动 `copyPreviewForArticle` / Mermaid·公式导出 / 剪贴板 IPC | 实机：`Ctrl+Shift+C` 粘贴公众号编辑器，正文+图+流程图+**公式图**齐全；复制过程无滚动跳动/闪烁 |
| **同步滚动 / 查找替换** | 改动 `sync-scroll.js` / `find-replace.js` / `widget-find-seed` | **点击双向定位**（滚动互不跟随）；点预览只滚源码且预览视口不变；点源码/方向键才滚预览；大纲/Ctrl+G 仍可双边定位；查找高亮与 ↑/↓ 跳转；IME 焦点不丢失；**选区打开查找不跳首命中**；代码块/表格格内 `Ctrl+F` 可用 |
| **选区批注** | 改动 `selection-anchor.js` / `anchor-highlights.js` / anchor 写入 | 预览/源码双路径选区→`anchor`；插入批注行后偏移不失效；代码块/表格可批注；orphan 标记 |
| **MCP / 导出** | 改动 `src/mcp/**` 或导出/更新 IPC | `mda_scan` 与 CLI JSON 一致；HTML/PDF/**Word** 导出（docx 用 WPS/Word 打开抽检）；打包版检查更新 |
| **同文件批量 add 批注** | Agent/脚本对同一 `.md` 多次 `mda_add`/`add` | 须串行；自下而上或每条后重扫行号；`line` 勿用空行；JSON 用 MCP 或 `node dist/cli/main.js`（见 few-shot §19 / AGENTS §9.13） |
| **自动保存** | 改动 autosave 菜单 / `writeToPath` quiet 路径 | 关/失焦/30s/60s；未命名不自动另存；成功安静、失败 toast；坏批注行跳过自动保存 |
| **跳转 / 主题 / 弹窗焦点** | 改动 `Ctrl+G`、主题切换、`trapModalFocus`、批注编辑框 | 跳转不标脏；切主题不滚到文首；批注框 Tab 不逃逸改源码 |
| **工作区文件侧栏** | 改动 `file-sidebar.js` / `file-ops.js` / 文件 IPC | 打开文件夹后树展示；拖宽/双击复位；标题栏 ✕ **清空列表**（关侧栏、不删磁盘文件）；↑↓ 换文档；复制/剪切/粘贴/拖动移动；重命名（仅主文件名）/删除；重名冲突；`Ctrl+Z` 撤销；**拖动**须拖到文件夹行或目标目录内文件行验证 |
| **预览左侧大纲** | 改动 `outline-panel.js` / 预览布局 / 大纲同步 | 左侧可收起；hover 才显示边线；点击跳转；滚动预览与点击编辑/预览时高亮应对准当前节（勿偏上一节）；收起按钮不挡正文；收放正文不跳动 |
| **最近打开 / 启动** | 改动 `recent-files` / 启动 `did-finish-load` / `refreshWorkspaceTree` | 清空最近列表不关当前文档；列表为空时重启应为起始页；恢复工作区不得自动打开首个 md |
| **GUI i18n** | 改动 `i18n.js` 或新增用户可见文案 | 视图→界面语言切换 zh/en；弹窗/toast/菜单无硬编码；`uiT(key, vars)` 插值生效（勿原样显示 `{name}`） |
| **CM6 块选中 / 撤销** | 改动块 widget 删除、选中态、`*-selection.js` / `block-selection.js` | 选中→Delete→Ctrl+Z：蓝框与光标回到块；单击表格单元格无整格蓝底（未拖选文字时） |
| **CM6 hide-mark 点击/剪贴板** | 改动 `caret-syntax-adjust` / `syntax-clipboard` / `click-collapse` | 点击标题/粗体/code 左缘→开定界符左侧、右缘→闭定界符右侧；拖选单侧定界符粘贴无 `**`/`` ` ``；完整选中保留 Markdown；**加粗段内只选可见字拷贝须带定界符**（`wrapClipboardWithCoveringMarks`） |
| **CM6 行内定界符叠套** | 改动 `inline-delimiters` / `underline` / `build-specs` / 工具栏删除线·下划线 | 加粗内选「能打开」点删除线不拆外层；下划线+删除线为 `~~~` 且可见双线；取消其一不毁定界符 |
| **CM6 单元格 Markdown 粘贴** | 改动 `table-chrome` paste / `pasteMarkdownIntoTableCell` | 贴入 `**…**` 立刻渲染加粗，不长时间露源码 |
| **CM6 widget 内文字拖选** | 改动 `widget-editable-guard` / `tight-selection` / widget `contenteditable` | 表格格、代码块、Mermaid/公式源码内可拖选（浅蓝 `--table-text-sel`）；表格内拖选后仍可切文件/关窗；**禁止**对 widget 指针事件 `domEventHandlers` `return true` |
| **CM6 右键菜单（widget 选区）** | 改动 `context-menu` / `context-selection` / `table-chrome` `onDocPointer` | 长文档多表：靠后代码块/表格单元格拖选→右键选区保留、复制/剪切可用；选区外右键折叠；与表格局部菜单不互抢 |
| **CM6 代码块 Enter** | 改动 `code.js` / `parse-fence.serializeFencedCode` | 中间/末尾 Enter 光标落新行；尾部空行可见；块内 Ctrl+Z 可撤销；撤销后标脏同步；失焦写回源码；**点击块内保留 hljs**（查找 mark 仍可见）；仅右键菜单可短暂压平 |
| **悬停菜单 200ms** | 改动语言子菜单 / 块手柄菜单 / `HOVER_LEAVE_MS` | 鼠标移出菜单或触发器后约 200ms 关闭；移回取消关闭 |
| **Free 门禁（M6-5）** | Phase A 集成完成 | 对照 `.project-setup/verification-report.md`；用户明确确认前不得开工 M7 |
| 阶段确认门禁 | P0–P3 每阶段产出后 | 设计取舍需人工确认后才进入下一阶段 |
| **GUI 截图 / 录屏** | GUI 功能变更且用户确认实机通过 | 交付素材须人工产出；AI 在 Step 5 列出待补清单并提示用户补充，见 `docs/screenshots/README.md` |

任务级人/机分工见 `docs/P3-implementation-plan.md` 的「执行主体分工」表。

---

## 6. Code Review 痕迹

- git 历史含显式 review 提交与分严重程度的问题清单 → 逐项修复 → 回归（见 `docs/prompts/prompt-05-p4-implementation.md`，含「遗留项」跟踪至闭环）。
- 提交遵循 Conventional Commits（`feat/fix/refactor/test/docs/chore`），小粒度原子提交。

---

## 7. 协作资产

| 资产 | 位置 |
|------|------|
| AI 协作指南（架构/接口/禁止事项/隐性规范） | `AGENTS.md` |
| Few-shot 正反例（易错点 ✅/❌ 对照） | `docs/few-shot-examples.md` |
| 阶段模板（需求 / 架构 / 详细设计 / 实施） | `docs/templates/*.template.md`（含版本号、适用档位、退出门禁） |
| 可配置规则 | `src/config/annotation-schema.json` |
| 阶段设计文档 | `docs/P0–P3-*.md` |
| AI 对话记录 | `docs/prompts/*.md` |
| GUI 截图 / 录屏 | `docs/screenshots/`（清单见 `docs/screenshots/README.md`） |

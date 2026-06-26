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

## 实现统计

| 指标 | 数值 |
|------|------|
| 源码文件 | 14 个 |
| 测试文件 | 4 个 |
| 测试用例 | 61 个（全部通过） |
| 代码覆盖率 | Statements 87.07% / Lines 90.3% |
| git commits | 11+ 个 |
| AI 协作轮次 | 21+ 轮 |

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

## 实现统计

| 指标 | 数值 |
|------|------|
| 源码文件 | 14 个 |
| 测试文件 | 3 个 |
| 测试用例 | 50 个（全部通过） |
| 代码覆盖率 | Statements 87.93% / Lines 93.18% |
| git commits | 8 个 |
| AI 协作轮次 | 16+ 轮 |

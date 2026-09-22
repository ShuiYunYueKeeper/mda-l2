# 蒸馏映射说明 — MDA → L2 工程模板

本文档记录从 MDA 原工程到 `l2-project-template` 的蒸馏关系，便于理解「保留了什么、泛化了什么、删除了什么」。

---

## 1. 蒸馏原则

1. **保留已验证的流程**：P0–P4 阶段门、六步循环、人工确认门禁
2. **保留协作资产结构**：AGENTS.md、quality.md、few-shot、prompts、templates
3. **泛化业务内容**：MDA 专有术语/接口/禁止事项改为占位符
4. **保留推荐架构**：core/cli/gui 分层，可按项目裁剪
5. **合并双轨创建流程**：MDA 的 P0–P4 与 create-project skill 的 Phase 0–4 并存于模板

---

## 2. 文件映射表

| MDA 原路径 | 模板路径 | 处理方式 |
|-----------|----------|----------|
| `.cursor/workflow.md` | `.cursor/workflow.md` + `.claude/workflow.md` | 泛化：P4 实现顺序改为占位；GUI 约束改为可选模式 |
| `AGENTS.md` | `AGENTS.md.template` | 保留 10 章结构，业务内容改为 `{placeholder}` |
| `quality.md` | `quality.md.template` | 保留 7 章结构，测试/审核点改为占位 |
| `README.md` | `README.md.template` | 保留目录结构/技术栈/运行指引骨架 |
| `docs/templates/*.md` | `docs/templates/*.md` | **原样复制**（已是通用模板） |
| `docs/README.md` | `docs/README.md` | 泛化项目名 |
| `docs/few-shot-examples.md` | `docs/few-shot-examples.md` | 保留格式，替换为通用示例骨架 |
| `docs/screenshots/README.md` | `docs/screenshots/README.md` | 泛化为 GUI 项目通用清单 |
| `docs/prompts/` | `docs/prompts/README.md` | 新增记录规范（原 MDA 含 7+ 轮记录） |
| `docs/P0–P3-*.md` | （不复制） | 新项目按模板从零撰写 |
| `src/core/**` | `src/core/.gitkeep` | 仅保留目录占位 |
| `src/cli/**` | `src/cli/` 目录 | 仅保留目录占位 |
| `src/gui/**` | `src/gui/` 目录 | 仅保留目录占位 |
| `src/config/**` | `src/config/.gitkeep` | 保留「可配置规则外置」约定 |
| `tests/**` | `tests/README.md` | 测试组织说明 |
| `samples/**` | `samples/README.md` | 样本用途说明 |
| `scripts/**` | `scripts/README.md` | 脚本用途说明 |
| `.editorconfig` | `.editorconfig` | 泛化（去除 electron-builder BOM 注释） |
| `.gitignore` | `.gitignore` | 泛化（去除 MDA 专有路径） |
| `package.json` | `package.json.template` | 脚本/bin 改为占位 |
| `tsconfig.json` | `tsconfig.json.template` | 基本保留 |
| `jest.config.js` | `jest.config.js.template` | 基本保留 |
| — | `.project-setup/*` | 从 create-project skill 引入 |
| — | `DISTILLATION.md` | 本文件 |
| — | `README.md`（模板根） | 使用指南 |

---

## 3. 工作流泛化要点

### 保留

- P0–P4 阶段定义与产出路径
- 六步循环（审查/实施/自查/验证/文档/提交/下一步）
- 设计阶段 commit 格式（`P0:` / `P1:` …）
- P4 Conventional Commits（`feat/fix/refactor/test/docs/chore`）
- Spec Self-Review 6 项 checklist
- 阶段确认门禁（P0–P3 须用户确认）

### 泛化

| MDA 专有 | 模板通用 |
|----------|----------|
| P4 Phase A–F（core/cli/gui 固定顺序） | `{implementation_phases}` 占位，由 P3 DAG 定义 |
| GUI 实机硬约束（Electron 特有） | 「UI 层实机验证」可选模式，适用 GUI/Web/Desktop |
| `docs/screenshots/` MDA 截图清单 | 通用 GUI 素材清单模板 |
| `E1–E25` 边界编号 | `{E1-EN}` 占位，在 P2 定义 |
| `verifySourceProtection` 等 | 写入「项目特有质量约束」章节 |

---

## 4. AGENTS.md 章节映射

| 章节 | MDA 内容 | 模板处理 |
|------|----------|----------|
| §1 项目背景 | MDA 命题说明 | `{project_background}` |
| §2 项目概述 | 技术栈表格 | 保留表格结构 |
| §3 业务术语表 | 批注/段落等 | `{glossary}` |
| §4 架构设计 | Mermaid + 模块表 | 保留分层模式示例 |
| §5 接口约定 | TS 类型 + API | `{api_contract}` |
| §6 编码规范 | TS/CLI/GUI 规范 | 泛化语言规范 |
| §7 项目依赖 | 版本表 | 保留表格结构 |
| §8 禁止事项 | 11 条 MDA 硬约束 | 保留条目结构 + 示例子项 |
| §9 隐性规范 | 4a–4h GUI 细节 | 改为「隐性规范填写指南」 |
| §10 关键文件索引 | MDA 文件表 | 保留表格结构 |

---

## 5. 使用本模板创建新项目的检查清单

- [ ] 复制 `l2-project-template/` 到目标路径
- [ ] 重命名并填充所有 `*.template` 文件
- [ ] 删除不需要的目录（如无 GUI 则删 `src/gui/`）
- [ ] 更新 `.cursor/workflow.md` 中 P4 实现顺序
- [ ] 完成 P0 需求分析并获用户确认
- [ ] 同步维护 `AGENTS.md` 与代码一致性
- [ ] L2 交付：≥3 轮 `docs/prompts/` 记录

---

## 6. 来源工程

- **蒸馏源**：`mda-l2`（MDA Markdown 批注管理工具）
- **蒸馏日期**：2026-07-09
- **验证状态**：工作流与资产结构已在 MDA 项目中完整跑通

---
name: l2-project-template
description: >
  基于 MDA 蒸馏的 L2 工程脚手架：目录结构、P0-P4 阶段化工作流、AGENTS.md/quality.md
  协作资产、设计文档模板与质量验证闭环。用于创建 L2 命题项目、阶段化 AI 协作工程、
  从模板初始化新项目，或用户提到 l2-project-template、L2 脚手架、蒸馏模板、P0-P4 工作流时使用。
---

# L2 工程模板 Skill

从 MDA 蒸馏的可复用工程脚手架，覆盖 L2 三大维度：**资产沉淀**、**任务规划**、**质量保障**。

与 `create-project` skill 的分工：

| Skill | 适用场景 |
|-------|----------|
| **l2-project-template**（本 skill） | L2 命题 / 需求明确 / 需 P0–P4 设计文档 + AGENTS.md 协作 |
| create-project | 轻量通用项目，Phase 0–4 快速搭骨架 |

---

## 快速启动（新建项目）

### Step 0 — 收集需求（必须）

用 AskQuestion 或对话确认：

| 维度 | 内容 |
|------|------|
| 项目名称 | kebab-case |
| 存放路径 | 绝对路径，目录须为空或不存在 |
| 项目类型 | CLI / GUI / 库 / Web / 混合 |
| 技术栈 | 语言、框架、运行时 |
| 核心功能 | 1–3 个要点 |
| 裁剪项 | 是否含 GUI / CLI |

展示需求摘要，**用户确认后**再执行初始化。

### Step 1 — 初始化脚手架

**Windows（推荐）**：

```powershell
& "$env:USERPROFILE\.cursor\skills\l2-project-template\scripts\init-project.ps1" `
  -TargetPath "D:\projects\my-app" `
  -ProjectName "my-app"
```

**macOS / Linux**：

```bash
bash ~/.cursor/skills/l2-project-template/scripts/init-project.sh ~/projects/my-app my-app
```

脚本行为：复制 `template/` → 目标路径；删除模板说明 README；用 `README.md.template` 生成初始 `README.md`；可选替换 `{project_name}` / `{package_name}`。

初始化后 `cd` 到目标路径继续后续步骤。

### Step 2 — 激活模板文件

将以下 `*.template` 重命名并填充占位符：

| 源文件 | 目标 |
|--------|------|
| `AGENTS.md.template` | `AGENTS.md` |
| `quality.md.template` | `quality.md` |
| `package.json.template` | `package.json` |
| `tsconfig.json.template` | `tsconfig.json` |
| `jest.config.js.template` | `jest.config.js` |

按项目类型裁剪目录（见 [references/cropping-guide.md](references/cropping-guide.md)）。

### Step 3 — 版本控制

```bash
git init
git add .
git commit -m "chore: initialize L2 project scaffold"
```

### Step 4 — 进入 P0–P4 工作流

读取目标项目中的 `.cursor/workflow.md`，严格遵循 **六步循环** 与 **阶段确认门禁**。

---

## P0–P4 工作流（摘要）

```
P0-需求分析 → P1-架构设计 → P2-详细设计 → P3-实现步骤 → P4-实现
   ↓确认        ↓确认         ↓确认         ↓确认          ↓循环
  git commit   git commit    git commit    git commit     git commit
```

### 阶段产出

| 阶段 | 输出 | 模板 |
|------|------|------|
| P0 | `docs/P0-requirements.md` | `docs/templates/requirement.template.md` |
| P1 | `docs/P1-architecture.md` | `docs/templates/design.template.md` |
| P2 | `docs/P2-detailed-design.md` | `docs/templates/design.template.md` |
| P3 | `docs/P3-implementation-plan.md` | `docs/templates/dev-plan.template.md` |
| P4 | `src/` + `tests/` + 文档 | P3 任务 DAG |

### 六步循环（每阶段）

1. **审查** — 读上一阶段产出 + `git status`
2. **实施** — 写文档或代码
3. **自查** — Spec Self-Review 6 项 / `tsc` / `git diff`
4. **验证** — 测试 + 用户确认（P0–P3 必须；UI 改动须实机）
5. **文档** — 同步 `AGENTS.md` / `quality.md` / `few-shot-examples.md`
5.5. **提交** — 小粒度 commit
6. **下一步** — 进入下一阶段

完整细则见目标项目 `.cursor/workflow.md` 或 [references/workflow-summary.md](references/workflow-summary.md)。

### 提交规范

| 阶段 | commit 格式 |
|------|-------------|
| P0–P3 | `P0: 需求分析文档 — {主题}` 等 |
| P4 | `feat(scope): ...` / `fix` / `test` / `docs` / `chore` |

---

## 架构约定（推荐分层）

```
gui / cli  →  core  →  model
              ↑
           config（可配置规则外置）
```

- **core**：纯业务逻辑，不依赖 UI/CLI
- **cli/gui**：薄适配层，禁止复制 core 逻辑
- **config**：枚举/正则等单一真相外置

---

## AGENTS.md 填写要点

初始化后从 `AGENTS.md.template` 生成，P1 完成后至少填充：

1. 项目背景与概述
2. 业务术语表
3. 架构 Mermaid + 模块职责表
4. 接口约定（类型 + 公共 API）
5. **禁止事项**（≥5 条可验证硬约束）
6. **隐性规范**（实战陷阱 → 正确做法）
7. 关键文件索引

P4 每次架构/接口变更须回头更新 AGENTS.md。

---

## 质量验证闭环

P4 交付前完成 `.project-setup/verification-report.md`（从 `verification-report.template.md` 复制）。

核对清单见 `template/.project-setup/quality-checklist.md`。

必达项：

- [ ] `npm install` / `build` / `test` 通过
- [ ] `docs/P0–P3` 齐全且经用户确认
- [ ] `docs/prompts/` ≥3 轮 AI 协作记录
- [ ] `AGENTS.md` 与代码一致
- [ ] README 命令可实际执行

---

## 维护日志

全程维护 `.project-setup/setup-log.md`（从 `setup-log.template.md` 复制），记录关键决策与阶段确认。

---

---

## 安装本 Skill

### 方式一：npm 脚本（推荐）

在 `mda-l2` 仓库根目录：

```bash
npm run skill:install          # 全局：~/.cursor/skills/ + ~/.agents/skills/
npm run skill:install:project  # 仅当前项目：.cursor/skills/
```

### 方式二：直接脚本

```bash
node scripts/install-l2-skill.js
node scripts/install-l2-skill.js --project
```

### 方式三：npx skills（Git 远端可访问时）

```bash
npx skills add ShuiYunYueKeeper/mda-l2@l2-project-template -g --copy -y --agent cursor
# 或完整 URL：
npx skills add https://github.com/ShuiYunYueKeeper/mda-l2 \
  -s l2-project-template -g --copy -y --agent cursor
```

详见仓库 [`skills/README.md`](../../skills/README.md)。

---

## 模板文件位置

| 路径 | 说明 |
|------|------|
| `skills/l2-project-template/template/` | 仓库内 canonical 模板（init 脚本源） |
| `l2-project-template/` | 独立模板目录（编辑后运行 `npm run skill:sync`） |
| `~/.cursor/skills/l2-project-template/` | 安装后的全局 skill |

更新模板：`编辑 l2-project-template/` → `npm run skill:sync` → `npm run skill:install`

---

## 附加资源

- [references/cropping-guide.md](references/cropping-guide.md) — 按项目类型裁剪目录
- [references/workflow-summary.md](references/workflow-summary.md) — 工作流速查
- [template/DISTILLATION.md](template/DISTILLATION.md) — MDA 蒸馏映射

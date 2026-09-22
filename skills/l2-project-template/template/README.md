# L2 工程模板（蒸馏自 MDA）

> 本文件夹是从 [MDA（Markdown 批注管理工具）](../) 蒸馏出的**可复用工程脚手架**，
> 覆盖 L2 命题任务要求的三大维度：**资产沉淀**、**任务规划**、**质量保障**。
>
> 适用于：需求明确、需阶段化设计与 AI 协作的新项目。

> **Cursor Skill（可安装）**：本模板已封装为 skill `l2-project-template`。
>
> ```bash
> npm run skill:install    # 在 mda-l2 仓库根目录执行
> ```
>
> 安装后触发：「用 L2 模板创建项目」。详见 [`skills/README.md`](../skills/README.md)。

---

## 快速开始

### 1. 复制模板到新项目

```bash
# 将本目录复制到目标路径（示例）
cp -r l2-project-template/ ~/projects/my-new-app/
cd ~/projects/my-new-app/
```

Windows PowerShell：

```powershell
Copy-Item -Recurse l2-project-template\ D:\projects\my-new-app\
cd D:\projects\my-new-app\
```

### 2. 初始化项目

按顺序执行：

| 步骤 | 动作 | 产出 |
|------|------|------|
| ① | 将 `*.template` / `*.template.md` 重命名并填充占位符 | `AGENTS.md`、`README.md`、`quality.md` 等 |
| ② | 将 `package.json.template` → `package.json`，填写项目名与依赖 | 可安装的依赖清单 |
| ③ | `git init` + 首次 commit | 版本控制就绪 |
| ④ | 按 `.cursor/workflow.md` 走 **P0→P3** 设计阶段 | `docs/P0–P3-*.md` |
| ⑤ | P4 实现阶段填充 `src/`、`tests/` | 可运行代码 + 测试 |
| ⑥ | 完成 `.project-setup/verification-report.md` | 质量验证闭环 |

### 3. 核心协作资产（必读）

| 资产 | 路径 | 用途 |
|------|------|------|
| 开发工作流 | [`.cursor/workflow.md`](.cursor/workflow.md) | P0–P4 阶段门 + 六步循环 |
| AI 协作指南 | [`AGENTS.md.template`](AGENTS.md.template) → `AGENTS.md` | 架构/接口/禁止事项/隐性规范 |
| 质量保障 | [`quality.md.template`](quality.md.template) → `quality.md` | 测试/覆盖率/人工审核点 |
| 阶段模板 | [`docs/templates/`](docs/templates/) | P0/P1-P2/P3 文档模板 |
| Few-shot 正反例 | [`docs/few-shot-examples.md`](docs/few-shot-examples.md) | 易错点 ✅/❌ 沉淀 |
| 项目创建（可选） | [`.project-setup/`](.project-setup/) | 从零搭脚手架时的 Phase 0–4 |

---

## 目录结构

```
l2-project-template/
├── .cursor/
│   └── workflow.md              # 阶段化开发工作流（Cursor）
├── .claude/
│   └── workflow.md              # 同上（Claude Code 兼容）
├── .project-setup/              # 可选：从零创建项目时的规划与验证
│   ├── project-plan-template.md
│   ├── quality-checklist.md
│   ├── setup-log.template.md
│   └── verification-report.template.md
├── docs/
│   ├── README.md                # 文档索引
│   ├── templates/               # P0/P1-P2/P3 阶段模板
│   ├── prompts/                 # AI 协作记录（≥3 轮）
│   ├── screenshots/             # GUI 截图/录屏（如有）
│   └── few-shot-examples.md     # Few-shot 正反例骨架
├── src/
│   ├── core/                    # 核心业务逻辑（纯 TS，无 UI 依赖）
│   ├── config/                  # 可配置规则（JSON 等）
│   ├── cli/                     # CLI 入口与子命令（可选）
│   └── gui/                     # GUI（Electron 等，可选）
├── tests/
│   ├── core/                    # 核心单元测试
│   └── cli/                     # CLI 集成测试（可选）
├── samples/                     # 演示与验收样本
├── scripts/                     # 构建/拷贝/校验脚本
├── AGENTS.md.template           # AI 协作指南模板
├── quality.md.template          # 质量保障模板
├── README.md.template           # 项目 README 模板
├── package.json.template        # 依赖与脚本骨架
├── tsconfig.json.template       # TypeScript 配置骨架
├── jest.config.js.template      # Jest 配置骨架
├── .editorconfig
├── .gitignore
└── DISTILLATION.md              # 蒸馏映射说明（MDA → 本模板）
```

### 架构约定（推荐）

从 MDA 验证的分层模式，可按项目裁剪：

```
gui / cli  →  core  →  model
              ↑
           config（可配置规则外置）
```

- **core**：纯业务逻辑，不依赖 UI/CLI 框架
- **cli/gui**：薄适配层，复用 core，禁止复制核心逻辑
- **config**：枚举、正则、配色等「单一真相」外置

---

## 工作流总览

```
P0-需求分析 → P1-架构设计 → P2-详细设计 → P3-实现步骤 → P4-实现
   ↓确认        ↓确认         ↓确认         ↓确认          ↓循环
  git commit   git commit    git commit    git commit     git commit
```

每阶段遵循 **六步循环**：审查 → 实施 → 自查 → 验证 → 文档 → 提交 → 下一步。

详见 [`.cursor/workflow.md`](.cursor/workflow.md)。

---

## 与 MDA 原工程的关系

| 维度 | MDA 原工程 | 本模板 |
|------|-----------|--------|
| 业务逻辑 | Markdown 批注 parser/writer/renderer | 占位，由新项目填充 |
| 工作流 | `.cursor/workflow.md` | 泛化，去除 MDA 专有 Phase |
| 协作资产 | `AGENTS.md`、`quality.md`、few-shot | 模板化，保留结构 |
| 阶段文档 | `docs/P0–P3` + templates | 原样保留模板 |
| 目录骨架 | `src/core` + `cli` + `gui` | 保留推荐分层 |

完整映射见 [`DISTILLATION.md`](DISTILLATION.md)。

---

## 裁剪指南

按项目类型删除不需要的部分：

| 项目类型 | 可删除 | 保留 |
|----------|--------|------|
| 纯 CLI 库 | `src/gui/`、`docs/screenshots/` | core + cli + tests |
| 纯 Web 应用 | `src/cli/` | 将 gui 换为 web 目录，工作流 GUI 约束改为浏览器实测 |
| 无 GUI | `src/gui/`、screenshots 相关 workflow 条款 | 其余 |
| 小型脚本 | P2/P3 可简化；保留 AGENTS.md 核心禁止事项 | P0 + 实现 |

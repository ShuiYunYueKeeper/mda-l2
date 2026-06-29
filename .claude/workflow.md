# MDA 开发工作流 — 阶段化开发流程

> 适用于：L2 命题任务 / 需求明确的项目开发
> 状态：已验证（MDA Markdown 批注管理工具）

---

## 流程总览

```
P0-需求分析 → P1-架构设计 → P2-详细设计 → P3-实现步骤 → P4-实现
   ↓确认        ↓确认         ↓确认         ↓确认          ↓循环
  git commit   git commit    git commit    git commit     git commit
```

每阶段产出文档到 `docs/`，用户确认后 git commit，进入下一阶段。

---

## 通用迭代协议（六步循环）

所有工作阶段（P0-P4）严格遵循以下 6 步流程：

### Step 1 — 审查（Review）

开始修改/产出前，先审查与任务相关的现有状态，识别潜在风险和改进点。

**P0-P3（设计阶段）**：
- 阅读上一阶段产出 + 用户反馈
- 检查模板要求与当前产出的差距
- 识别需求文档中未覆盖但有影响的细节
**P4（实现阶段）**：
- 阅读 P2/P3 中当前任务的详细设计/伪代码/接口规格
- 检查当前代码状态（`git status`, `git log`）
- 确认无未提交的脏改动

**产出**：结构化的审查结论（问题列表 + 风险 + 改进建议），口头或写入文档。

### Step 2 — 实施（Implement）

基于需求和审查结论进行产出。

**P0-P3（设计阶段）**：对照模板撰写设计文档，覆盖全部内容要点。
**P4（实现阶段）**：编写代码，严格遵循 P2 的伪代码/算法/接口规格。

**重要**：
- **P0-P3**：产出后呈现给用户确认
- **P4**：实施前需向用户确认方案（非平凡改动时），获得同意后再动手

### Step 3 — 自查（Self-Review）

完成产出后立即进行自我审查。

**P0-P3（设计阶段）**：
- 对照模板 checklist 逐项检查（如 Spec Self-Review 6 项）
- 检查内部一致性（前后章节结论不矛盾）
- 检查无占位符（TODO/TBD/待定）
**P4（实现阶段）**：
- 代码可编译/可运行（`tsc --noEmit` / `npm run build`）
- 检查逻辑正确性（对照 P2 算法伪代码）
- 检查与设计文档的一致性
- review diff（`git diff`）确认只改了预期的文件

### Step 4 — 验证（Verify）

验证当前阶段的正确性和完整性。

**P0-P3（设计阶段）**：
- 对抗自检：反向追问设计中的推测和假设
- 预死亡分析：假设方案失败，最可能的原因
- 用户确认
**P4（实现阶段）**：
- 运行测试套件（`npm test` / `jest --coverage`），全部通过
- 核心功能手动验证（CLI 命令执行 + GUI 交互）
- 边界/异常场景不崩溃（E1-E25）
- CLI 输出格式符合规范（stdout 仅数据，stderr 走日志）
- 如需用户配合验证（如 GUI 截图），主动说明

> **【硬性约束】GUI 改动必须人工测试通过后才能继续**
> 凡涉及 GUI（`src/gui/**`：main/preload/renderer）的修改，自动化测试与 `npm run build` 通过 **不等于** 验证完成。必须：
> 1. 启动 GUI（`npm run gui -- <file>`）并请用户实机操作复现/确认本次改动点；
> 2. 在用户明确回复「测试通过 / 已修复」之前，**不得**提交，也**不得**推进到下一阶段或下一个功能；
> 3. 若用户反馈仍有问题，回到 Step 1 修复后重新走人工测试，直至通过。

### Step 5 — 文档（Document）

更新相关文档，保持代码与文档同步。

**P0-P3**：产出即为文档本身，用户确认后即完成。
**P4**：
- `README.md`：如有接口/配置/使用方式变更
- `AGENTS.md`：如有架构/接口/约定/禁止事项/隐性规范变更，同步更新协作指南（含禁止事项与关键文件索引）
- `docs/`：如架构/设计有调整（更新 P1/P2）
- `tests/`：测试用例覆盖新增功能
- `docs/prompts/`：记录本轮 AI 协作的 prompt（L2 要求 ≥3 轮）

### Step 5.5 — 提交（Commit）

文档更新完成后，及时 git commit 当前阶段的所有变更。

- commit message 格式（P4）：`<type>(<scope>): <description>`
- type：`feat` / `fix` / `refactor` / `test` / `docs` / `chore`
- scope：变更的模块/阶段，如 `core`, `cli`, `gui`, `tests`
- 不要积攒多个阶段再一起提交
- 每阶段提交以 `Co-Authored-By: Claude <noreply@anthropic.com>` 结尾

### Step 6 — 下一步（Next）

当前阶段全部通过后：
- 对照阶段规划确认下一阶段/任务
- 向用户建议下一阶段工作内容
- 如当前阶段有遗留问题，列出并标注优先级（P0 阻塞 / P1 重要 / P2 后续）
- 启动下一轮 Step 1

---

## 阶段规划

### P0 — 需求分析

**输入**：需求文档 / 命题说明
**输出**：`docs/P0-requirements.md`
**模板**：`docs/templates/requirement.template.md`

| Step | 做什么 |
|------|--------|
| 1 审查 | 精读需求文档，提取全部显式要求 + 推断隐式约束 |
| 2 实施 | 按模板填充：背景/目标/功能描述/用户故事/验收标准/非功能需求/接口契约/假设/风险/边界/交付清单 |
| 3 自查 | 检查 Spec Self-Review 6 项；AC 必须 Given/When/Then 格式；假设标注验证状态 |
| 4 验证 | 对抗自检（3 个反向追问）；置信度评估；提交用户确认 |
| 5 文档 | P0-requirements.md 即文档 |
| 5.5 commit | `P0: 需求分析文档 — {简短主题}` |
| 6 下一步 | 进入 P1 架构设计 |

### P1 — 架构设计

**输入**：P0 需求分析
**输出**：`docs/P1-architecture.md`
**模板**：`docs/templates/design.template.md`

| Step | 做什么 |
|------|--------|
| 1 审查 | 重读 P0 非功能需求/接口契约/约束，确定技术选型边界 |
| 2 实施 | 预调研→方案对比（≥3）→推荐方案详述（Mermaid/模块影响/任务初稿）→假设→预死亡→对抗审查 |
| 3 自查 | Spec Self-Review 6 项；Mermaid 图 ≤12 节点；假设标注证据类型+置信度 |
| 4 验证 | 对抗审查 4 问题；综合置信度 ≥80%；提交用户确认 |
| 5 文档 | P1-architecture.md 即文档 |
| 5.5 commit | `P1: 架构设计 — {技术选型摘要}` |
| 6 下一步 | 进入 P2 详细设计 |

### P2 — 详细设计

**输入**：P1 架构设计
**输出**：`docs/P2-detailed-design.md`
**模板**：`docs/templates/design.template.md`（续 P1）

| Step | 做什么 |
|------|--------|
| 1 审查 | 重读 P1 模块影响分析 + 用户反馈，聚焦需要细化的模块 |
| 2 实施 | 核心算法（伪代码+状态机+边界表）、策略设计（原子写入/空行压缩）、CLI/GUI 规格（签名+行为+状态）、边界用例清单（E1-EN）、验证测试设计 |
| 3 自查 | 伪代码可直接翻译为代码；组件有 TS 接口定义；边界表覆盖 P0 全部 E 编号 |
| 4 验证 | 边界用例逐条对照需求文档；不可见性测试有 3 断言；提交用户确认 |
| 5 文档 | P2-detailed-design.md 即文档（含版本历史增量） |
| 5.5 commit | `P2: 详细设计 — {核心算法/策略摘要}` |
| 6 下一步 | 进入 P3 实现步骤 |

### P3 — 实现步骤

**输入**：P2 详细设计
**输出**：`docs/P3-implementation-plan.md`
**模板**：`docs/templates/dev-plan.template.md`

| Step | 做什么 |
|------|--------|
| 1 审查 | 对照 P2 模块/算法/组件，确认所有单元都有对应实现任务 |
| 2 实施 | 接口定义（完整 TS 签名）、Mermaid 架构图、任务 DAG（分 Phase/依赖/并行/文件/步骤）、预死亡分析（实施层）、回滚策略、置信度 |
| 3 自查 | 自检清单 7 项；每个任务 2-5 分钟粒度；依赖关系无循环；回滚策略可直接操作 |
| 4 验证 | 预死亡 ≥3 条含检测+回滚；不确定项标注补强方式；提交用户确认 |
| 5 文档 | P3-implementation-plan.md 即文档 |
| 5.5 commit | `P3: 实现步骤规划 — {N} 阶段 {M} 任务 DAG` |
| 6 下一步 | 进入 P4 实现 |

### P4 — 实现

**输入**：P3 实现步骤
**输出**：代码 + 测试 + 每 Phase 一次 git commit

| Step | 做什么 |
|------|--------|
| 1 审查 | 读 P2/P3 中当前任务的详细设计/伪代码/接口；`git status` + `git log` 确认干净 |
| 2 实施 | 编写代码，严格遵循 P2 规格；非平凡改动先确认方案 |
| 3 自查 | `tsc --noEmit`；`git diff` review；对照 P2 伪代码逐段检查 |
| 4 验证 | `npm test` 全部通过；手动 CLI 验证核心路径；边界/异常不崩溃 |
| 5 文档 | 更新 README；同步 AGENTS.md（如约定/接口/禁止事项变更）；记录 `docs/prompts/` |
| 5.5 commit | `P4: 实现 {模块名} (Phase {字母})` |
| 6 下一步 | 标记任务完成，启动下一个任务（按 DAG 依赖顺序） |

### P4 实现顺序

```
Phase A: 项目脚手架 (T0)
Phase B: @mda/core — model → parser → writer → renderer → barrel
Phase C: CLI — 入口 → scan → add → edit → remove
Phase D: GUI — Electron main → preload → renderer app
Phase E: 测试 — parser(25边界) → writer(原子性+压缩) → renderer(不可见性)
Phase F: 交付 — README → demo.md → screenshots+video → AI协作记录
```

### P4 关键原则

1. **先编译通过，再跑测试** — 每个文件写完后立即 `tsc --noEmit`
2. **CLI 先行** — core 完成后先验证 CLI，确保 parser/writer 正确再进 GUI
3. **源文件保护** — 每次写回后验证非批注行不变（verifySourceProtection）
4. **原子写入** — 临时文件 + `fs.rename`，不直接覆盖
5. **问题即修复** — 测试失败时当场修复，不积压到下一阶段

---

## 提交规范

### 设计阶段（P0-P3）

| 阶段 | commit message 格式 |
|------|---------------------|
| P0 | `P0: 需求分析文档 — {简短主题}` |
| P1 | `P1: 架构设计 — {技术选型摘要}` |
| P2 | `P2: 详细设计 — {核心算法/策略摘要}` |
| P3 | `P3: 实现步骤规划 — {N} 阶段 {M} 任务 DAG` |

### 实现阶段（P4）

| type | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能/新模块 | `feat(core): 实现 parser 状态机段落归属算法` |
| `fix` | Bug 修复 | `fix(writer): 修复源文件保护空行压缩误判` |
| `refactor` | 重构（不改变功能） | `refactor(gui): 提取 EditDialog 为独立组件` |
| `test` | 测试用例 | `test(core): 新增 E25 空行压缩 writer 测试` |
| `docs` | 文档变更 | `docs: 更新 README 添加覆盖率统计说明` |
| `chore` | 构建/配置/工具 | `chore: 配置 jest 覆盖率报告输出格式` |

每阶段提交均以 `Co-Authored-By: Claude <noreply@anthropic.com>` 结尾。

---

## 模板文件

| 阶段 | 模板路径 |
|------|----------|
| P0 | `docs/templates/requirement.template.md` |
| P1-P2 | `docs/templates/design.template.md` |
| P3 | `docs/templates/dev-plan.template.md` |

---

## 交付清单映射

| 交付物 | 来源阶段 | 路径 |
|------|----------|------|
| 源码 | P4 Phase A-D | `src/` |
| 可执行入口 | P4 Phase A | `package.json bin` / `dist/` |
| 设计文档 | P0-P3 | `docs/P{0,1,2,3}-*.md` |
| AI 协作记录 | P4 Phase F | `docs/prompts/` |
| 测试代码 | P4 Phase E | `tests/` |
| README | P4 Phase F | `README.md` |
| GUI 截图 | P4 Phase F | `docs/screenshots/` |

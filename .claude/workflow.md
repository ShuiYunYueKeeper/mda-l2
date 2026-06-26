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

## P0 — 需求分析

**输入**：需求文档 / 命题说明
**输出**：`docs/P0-requirements.md`
**模板**：`docs/templates/requirement.template.md`

### 内容要点
- 背景与目标 + 成功指标（可核验）
- 功能描述（详细到字段/命令签名/GUI 规格）
- 用户故事（US-1..N，格式：作为…我想要…以便于…）
- 验收标准（Given/When/Then 格式）
- 非功能需求（可运行性/平台兼容/覆盖率等）
- 接口契约（不变更 / 允许变更）
- 关键假设（标注验证状态：✅/❓/⚠️）
- 风险与不确定性 + 对抗自检（3 个反向追问）
- 边界场景分析（E1-E20+）
- 交付清单映射
- 排期建议
- 开放问题
- 置信度评估（百分比 + 偏高/拉低依据）

---

## P1 — 架构设计

**输入**：P0 需求分析
**输出**：`docs/P1-architecture.md`
**模板**：`docs/templates/design.template.md`

### 内容要点
- 设计预调研（方法/关键发现/核心场景代码路径）
- 方案对比（≥3 方案，维度：思路/优点/缺点/风险/改动量 → 推荐方案+理由）
- 推荐方案详述：
  - 架构图（Mermaid，标注模块/进程边界/通信机制，≤12 节点）
  - 模块影响分析（改动类型/影响说明/改动量预估）
  - 任务拆分初稿（标注依赖/可并行/涉及模块）
- 关键技术假设（证据类型：源码确认/文档链接/POC验证/行业共识）
- 预死亡分析（≥3 条，可能性+缓解）
- 对抗审查（4 个问题）
- 综合置信度（技术可行性/方案完整性/风险可控性）
- Spec Self-Review（6 项 checklist）

---

## P2 — 详细设计

**输入**：P1 架构设计
**输出**：`docs/P2-detailed-design.md`
**模板**：`docs/templates/design.template.md`（续 P1）

### 内容要点
- 版本历史（增量追加）
- 核心算法设计（伪代码 + 状态机 + 边界场景行为表）
- 策略设计（如原子写入、空行压缩——流程+伪代码+自检函数）
- CLI 命令详细规格（每个命令：签名+Options+行为+stdout/stderr+exit code）
- GUI 组件详细规格（每个组件：Props/State/行为/样式规格）
- 边界测试用例清单（E1-EN，含分类/场景描述/预期结果）
- 不可见性验证测试设计
- 关键决策的实现方案（如图片 alt fallback）
- Spec Self-Review

---

## P3 — 实现步骤

**输入**：P2 详细设计
**输出**：`docs/P3-implementation-plan.md`
**模板**：`docs/templates/dev-plan.template.md`

### 内容要点
- 设计引用（P1+P2 摘要）
- 接口定义（完整 TypeScript 签名 / CLI 命令签名 / GUI 入口行为）
- 方案架构图（Mermaid，标注入口/核心/GUI/测试/交付层，用颜色区分）
- 任务 DAG：分 Phase，每任务标注：
  - 依赖关系 + 是否可并行
  - 涉及文件 + 细粒度实施步骤（2-5 分钟粒度）
  - 总改动预估（行数/文件数）
- 预死亡分析（实施层面：原因/可能性/检测方式/回滚方案）
- 回滚策略（git stash/reset 命令级）
- 方案置信度 + 不确定项（置信度 <80% 的决策，含补强方式）
- 自检清单

---

## P4 — 实现

**输入**：P3 实现步骤
**输出**：代码 + 测试 + 每 Phase 一次 git commit
**循环**：Step1 审查 → Step2 实施 → Step3 自查 → Step4 验证 → Step5 文档 → Step5.5 commit → Step6 下一步

### P4 六步循环

| Step | 名称 | 做什么 |
|------|------|--------|
| 1 | 审查 | 读 P2/P3 中当前任务的详细设计，确认理解无误 |
| 2 | 实施 | 编写代码，遵循 P2 的伪代码/接口规格 |
| 3 | 自查 | `npx tsc --noEmit` 类型检查，review diff |
| 4 | 验证 | 运行测试、手动执行 CLI 命令、启动 GUI（如已就绪） |
| 5 | 文档 | 更新 README/注释（如需要） |
| 5.5 | commit | 按 Phase 粒度提交，"P4: 实现 XXX (Phase X)" |
| 6 | 下一步 | 标记任务完成，启动下一个任务 |

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

| 阶段 | commit message 格式 |
|------|---------------------|
| P0 | `P0: 需求分析文档 — {简短主题}` |
| P1 | `P1: 架构设计 — {技术选型摘要}` |
| P2 | `P2: 详细设计 — {核心算法/策略摘要}` |
| P3 | `P3: 实现步骤规划 — {阶段数} 阶段 {任务数} 任务 DAG` |
| P4 | `P4: 实现 {模块名} (Phase {字母})` |

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

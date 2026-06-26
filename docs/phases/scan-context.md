# P2-Step2: 上下文增强 + 历史经验

> 本文件由 conductor 在 P2-Step2 时读取（dev **静态分析 / scan** 的第二步：按模块增强上下文）。
> **本阶段仅限静态分析**（Read/Grep/SemanticSearch/code-context-scan/engineering-map/知识库）；**不进行 POC 或运行态验证**（此类内容移至 P3 `enhance.md`）。
> 仅在 P2-Step1 判定「未达标」时触发，按模块 fan-out 并行。
> 公共约定详见 `common/common-conventions.md`。
> **路径约定**：下文 `{task_dir}/` 指 conductor 派发时声明的任务目录（如 `workspace/tasks/feature-YYMMDD-xxx/`）。

## 角色约束

- 执行角色：`agents/cpp-architect.md`（C++ 架构师）
- ⚠️ 派发时须设置 `readonly: false`（需写入 thinking/P2-context-{module_name}.md）
- 推荐 subagent_type：`generalPurpose`（需要灵活搜索+代码扫描+写文件）

## 输入文档

- `{task_dir}/thinking/P2-design-draft.md` — 草案设计（含需上下文增强的模块列表）
- `{task_dir}/thinking/P1-requirement.md` — 需求文档

## 变量（由 conductor 在派发时填充）

- `{module_name}` — 本 Task 负责扫描的模块名
- `{module_path}` — 模块代码路径
- `{related_hypotheses}` — 与本模块相关的待验证假设列表

## 前置检查（conductor 派发前验证）

conductor 在派发 P2-Step2 任务前，必须先验证 `{module_path}` 是否可访问：
1. 检查 `workflow-state.json` 中的 `repo_path` 是否已设置
2. 验证 `{module_path}` 目录存在且非空
3. **不可访问 → 跳过代码扫描步骤**，仅执行"历史经验检索"，并在产出中标注"代码扫描：已跳过（仓库不可达）"

## P2-Step2 Prompt

```
你的任务是为模块 {module_name} 提供上下文增强，验证相关假设。

## 0. 仓库可达性检查（首先执行）

验证 {module_path} 是否存在：
- 存在 → 继续全部步骤
- 不存在 → 跳过"代码架构扫描"和"假设验证"中的代码搜索部分，
  仅基于知识库和历史经验完成分析，在产出开头标注"⚠️ 代码扫描已跳过"

输入：
- 读取 {task_dir}/thinking/P2-design-draft.md（草案设计，关注与 {module_name} 相关的部分）
- 读取 {task_dir}/thinking/P1-requirement.md（需求文档）

## 1. 代码架构扫描

读取 skills/code-context-scan/SKILL.md 并按步骤扫描 {module_path}：
- 目录结构、关键类/接口、依赖关系
- 与需求相关的现有实现

## 2. 假设验证（静态分析 + 语义搜索）

逐条验证 {related_hypotheses}：
- 用代码与文档搜索确认/否定每个假设（Read/Grep/SemanticSearch/code-context-scan/知识库）
- 标注证据类型（源码确认/文档或知识库佐证/无证据）
- 若某假设**必须**运行验证或 POC 才能确认：在表中标注「需 enhance 阶段验证」，**不要**在本阶段写 POC

## 3. 历史经验检索

搜索以下位置的相关经验：
- workspace/memory/ — 已沉淀的模块经验
- workspace/tasks/ — 历史任务中的类似实现
- git log — 模块的关键变更历史

产出：写入 {task_dir}/thinking/P2-context-{module_name}.md

内容结构：
- 模块架构概览
- 假设验证结果表（含「需 enhance 阶段验证」的条目，如有）
- 历史经验摘要
- 对草案设计方案的影响评估（支持/质疑/补充）

质量门禁：
- [ ] 代码架构扫描已完成
- [ ] 每个相关假设都有验证结论，或对「需 enhance」的假设有明确标注与理由
- [ ] 历史经验已检索
```

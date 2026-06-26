# P4: 方案确定

> 本文件由 conductor 在 P4 时读取（dev 方案确定阶段）。
> 公共约定详见 `common/common-conventions.md`。
> **路径约定**：下文 `{task_dir}/` 指 conductor 派发时声明的任务目录（如 `workspace/tasks/feature-YYMMDD-xxx/`）。

## 角色约束

- agents/cpp-architect.md（prompt 内已引用）
- ⚠️ 派发时须设置 `readonly: false`（需写入 thinking/P4-dev-plan.md）
- 推荐 subagent_type：`cpp-architect`（架构设计；派发时设置 `readonly: false`）

## 输入文档

- `{task_dir}/thinking/P2-design.md` — 设计文档（必须已通过人工确认）
- `{task_dir}/thinking/P1-requirement.md` — 需求文档

## P4: 方案确定 Prompt

```
【必须先执行】读取以下文件并遵循其中的约束：
- agents/cpp-architect.md
- rules/common/wps-cpp-spec/wps-cpp-spec.mdc
- rules/common/wps-cmake-spec/wps-cmake-spec.mdc（涉及 CMakeLists.txt 时）

你的任务是将已确认的设计方案细化为可执行的实施计划。

输入：
- 读取 {task_dir}/thinking/P2-design.md（已确认的设计方案）
- 读取 {task_dir}/thinking/P1-requirement.md（需求文档，获取验收标准）

## 第一步：接口定义（接口先行）

本节必须存在（Gate 强制检查）。涉及新增类/接口/公共 API 时完整定义；不涉及时写「无新增公共接口」。

涉及新增接口时须包含：
- 头文件声明（函数签名、参数类型、返回值）
- 错误码/异常定义
- 信号槽声明（如适用）
- 向前/向后兼容性说明

## 第 1.5 步：方案架构图（Mermaid）

用 Mermaid 图展示实施方案的整体架构和数据流。要求：
- 展示涉及的模块/组件及其交互关系
- 标注通信机制（直接调用 / IPC / signal-slot / REST / event）
- 高亮新增/修改的节点
- 跨进程/跨服务时区分进程边界
- 如仅涉及单模块局部修改，可简化为类/函数级别流程图
- 节点不超过 12 个

## 第二步：任务 DAG

将设计方案拆分为可独立验证的任务序列：

  ```
  ## 任务 DAG
  | 任务 | 依赖 | 可并行 | 涉及文件 | 实施步骤 |
  |------|------|--------|---------|---------|
  | T1: xxx | 无 | 是 | file1.cpp, file1.h | 1. ... 2. ... 3. ... |
  | T2: xxx | T1 | 否 | file2.cpp | 1. ... 2. ... |
  ```

每个任务要求：
- 每步 2-5 分钟可完成
- 涉及文件列表完整
- 实施步骤具体到函数/类级别
- 无依赖的任务标注"可并行"

## 第三步：预死亡分析（实施层面）

假设实现过程中出了问题，最可能的 top 3 原因：

  ```
  ## 预死亡分析
  1. [原因] — 可能性：高/中/低 — 检测方式：... — 回滚方案：...
  2. [原因] — 可能性：高/中/低 — 检测方式：... — 回滚方案：...
  3. [原因] — 可能性：高/中/低 — 检测方式：... — 回滚方案：...
  ```

## 第四步：回滚策略

给出可直接执行的回滚步骤，确保任何一个任务实现失败后可安全回退。

产出：读取模板 conductors/dev/templates/dev-plan.template.md，按其结构填充，写入 {task_dir}/thinking/P4-dev-plan.md
末尾附：
- 方案置信度（百分比），<80% 的决策点列出不确定项和补强行动
- 确认状态标记：`状态: 待确认`

质量门禁（自检后才能继续）：
- [ ] 方案架构图已填写（Mermaid 代码块非空，非占位符）
- [ ] 接口定义完整（涉及新增接口时）
- [ ] 任务 DAG 依赖关系清晰，可并行任务已标注
- [ ] 每个任务包含细粒度实施步骤
- [ ] 预死亡分析 ≥ 3 条，含检测方式和回滚方案
- [ ] 回滚策略可直接操作
- [ ] 方案置信度已标注
- [ ] 无 TODO 占位符

⛔ P4 到此结束。将 thinking/P4-dev-plan.md 呈现给用户等待确认，用户确认后才能开始写代码。
```

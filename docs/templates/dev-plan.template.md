# 实施计划 — {feature_title}

<!--
  本模板由 P4 方案确定 subagent 填充（dev 工作流）。
  填充规则：
  - {xxx} 为占位符，必须替换为实际内容
  - 任务 DAG 必须标注依赖关系和可并行项
  - 接口定义章节必须存在（无新接口时写"无新增公共接口"）
  - 预死亡分析至少 3 条
  - 回滚策略必须可直接执行
-->

## 设计引用

> {design_summary_from_p2}

---

## 接口定义

<!--
  涉及新增类/接口/公共 API 时完整定义。
  不涉及时写「无新增公共接口」。
  Gate 强制检查本节存在。
-->

{interface_definitions_or_none}

---

## 方案架构图（Mermaid）

<!--
  用 Mermaid 图展示实施方案的整体架构和数据流。
  要求：
  - 展示涉及的模块/组件及其交互关系
  - 标注通信机制（直接调用 / IPC / signal-slot / REST / event）
  - 高亮新增/修改的节点
  - 跨进程/跨服务时用不同 participant 区分进程边界
  - 如仅涉及单模块内的局部修改，可简化为类/函数级别的流程图
  - 节点不超过 12 个
  - 语法约束参考 conductors/archscan/templates/diagrams-spec.md §Mermaid
-->

```mermaid
{architecture_diagram}
```

---

## 任务 DAG

<!--
  依赖关系：T2 依赖 T1 → T1 完成后才能启动 T2
  可并行：无依赖关系的任务可同时执行
  每个任务粒度：2-5 分钟可完成
-->

| 任务 | 依赖 | 可并行 | 涉及文件 | 实施步骤 |
|------|------|--------|---------|---------|
| T1: {task_1_name} | 无 | 是 | {files} | 1. {step_1} 2. {step_2} |
| T2: {task_2_name} | T1 | 否 | {files} | 1. {step_1} 2. {step_2} |
| T3: {task_3_name} | 无 | 是 | {files} | 1. {step_1} 2. {step_2} |

**总改动预估**：约 {estimated_lines} 行，涉及 {file_count} 个文件

---

## 预死亡分析（实施层面）

假设实现过程中出了问题，最可能的 top 3 原因：

| # | 原因 | 可能性 | 检测方式 | 回滚方案 |
|---|------|--------|---------|---------|
| 1 | {failure_1} | 高/中/低 | {detection} | {rollback} |
| 2 | {failure_2} | 高/中/低 | {detection} | {rollback} |
| 3 | {failure_3} | 高/中/低 | {detection} | {rollback} |

---

## 回滚策略

1. {rollback_step_1}
2. {rollback_step_2}

**回滚风险**：{rollback_risk_or_none}

---

## 方案置信度

| 项目 | 内容 |
|------|------|
| **总体置信度** | **{confidence}%** |
| **判定依据** | {confidence_reason} |

### 不确定项（置信度 <80% 的决策点）

| # | 不确定的决策 | 当前置信度 | 不确定原因 | 判断错误的后果 | 补强方式 |
|---|------------|-----------|-----------|--------------|---------|
| D1 | {decision_1} | {confidence}% | {reason} | {consequence} | {action} |

---

## 自检清单

- [ ] 接口定义完整（涉及新增接口时）
- [ ] 任务 DAG 依赖关系清晰，可并行任务已标注
- [ ] 每个任务包含细粒度实施步骤
- [ ] 预死亡分析 ≥ 3 条，含检测方式和回滚方案
- [ ] 回滚策略可直接操作
- [ ] 方案置信度已标注
- [ ] 无 TODO 占位符

---

## 确认状态

状态: **待确认**

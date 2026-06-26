# 需求文档 — {feature_title}

<!--
  本模板由 P1 需求解读 subagent 填充（dev 工作流）。
  填充规则：
  - {xxx} 为占位符，必须替换为实际内容
  - 置信度必须为百分比（0-100%），不接受"高/中/低"
  - 关键假设必须标注验证状态（✅/❓/⚠️）
  - 验收标准必须为 Given/When/Then 格式
  - 无 TODO 占位符
-->

## 背景与目标

### 背景

{background_description}

### 目标

{goal_list}

### 成功指标（可核验）

| 维度 | 指标 |
|------|------|
| {dimension_1} | {metric_1} |
| {dimension_2} | {metric_2} |

---

## 功能描述（详细）

{detailed_feature_description}

---

## 用户故事

| 编号 | 作为 | 我想要 | 以便于 |
|------|------|--------|--------|
| US-1 | {role} | {desire} | {benefit} |
| US-2 | {role} | {desire} | {benefit} |

---

## 验收标准（Given/When/Then）

- **AC-1**：Given {precondition}，When {action}，Then {expected_result}。
- **AC-2**：Given {precondition}，When {action}，Then {expected_result}。

---

## 非功能需求

| 编号 | 类别 | 描述 |
|------|------|------|
| NF-1 | {category} | {description} |
| NF-2 | {category} | {description} |

---

## 接口契约

### 不变更

| 条目 | 说明 |
|------|------|
| {invariant_1} | {reason} |

### 允许变更

| 条目 | 说明 |
|------|------|
| {allowed_1} | {scope} |

---

## 关键假设

<!--
  验证状态：✅ 已确认 / ❓ 待澄清 / ⚠️ 待校对
  对每个❓假设，必须在「开放问题」中提出具体的澄清问题。
-->

| # | 假设内容 | 证据来源 | 验证状态 |
|---|----------|----------|----------|
| A1 | {assumption_1} | {source} | {status} |
| A2 | {assumption_2} | {source} | {status} |

---

## 风险与不确定性

| 风险 | 影响 | 缓解 |
|------|------|------|
| {risk_1} | {impact} | {mitigation} |
| {risk_2} | {impact} | {mitigation} |

### 对抗自检（反向追问）

1. 这个需求中有哪些地方是「推测」的而非原文明确说明的？ — {answer_1}
2. 如果产品验收时说"这不是我要的"，最可能是因为哪一点理解有误？ — {answer_2}
3. 有没有遗漏的用户场景或边界条件？ — {answer_3}

---

## 排期建议

| 次序 | 内容 |
|------|------|
| {order_1} | {content_1} |
| {order_2} | {content_2} |

---

## 开放问题

- {open_question_1}

---

## 确认状态

状态: **待确认**

---

## 文档元信息

### 置信度：**{confidence}%**

- **偏高依据**：{high_reasons}
- **拉低依据**：{low_reasons}

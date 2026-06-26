# P2-Step3: 设计汇总（静态综合）

> 本文件由 conductor 在 P2-Step3 时读取（dev **静态分析 / scan** 的最终汇总）。
> **本阶段仅限静态分析**（Read/Grep/SemanticSearch/code-context-scan/engineering-map/知识库）综合信息；**运行时验证与 POC** 在后续 P3 完成后再补充到假设表（本阶段可标注「⏳ 待动态验证」）。
> 公共约定详见 `common/common-conventions.md`。
> **路径约定**：下文 `{task_dir}/` 指 conductor 派发时声明的任务目录（如 `workspace/tasks/feature-YYMMDD-xxx/`）。

## 角色约束

- agents/cpp-architect.md（prompt 内已引用）
- ⚠️ 派发时须设置 `readonly: false`（需写入 thinking/P2-design.md）
- 推荐 subagent_type：`cpp-architect`（架构设计；派发时设置 `readonly: false`）

## 输入文档

- `{task_dir}/thinking/P2-design-draft.md` — 草案设计
- `{task_dir}/thinking/P2-context-*.md` — 所有模块的上下文增强报告（如存在）
- `{task_dir}/thinking/P1-requirement.md` — 需求文档

## P2-Step3: 设计汇总 Prompt

```
【必须先执行】读取以下文件并遵循其中的约束：
- agents/cpp-architect.md
- rules/common/wps-cpp-spec/wps-cpp-spec.mdc
- rules/common/wps-cmake-spec/wps-cmake-spec.mdc（涉及 CMakeLists.txt 时）

你的任务是综合草案设计和上下文增强结果，产出最终设计文档。

输入：
- 读取 {task_dir}/thinking/P2-design-draft.md（草案设计）
- 读取 {task_dir}/thinking/P2-context-*.md 文件（上下文增强结果，如存在）
- 读取 {task_dir}/thinking/P1-requirement.md（需求文档）

## 第一步：方案整合

综合草案设计 + 上下文增强的新发现：
1. 更新方案对比（纳入新证据后方案排名是否变化？）
2. 确定推荐方案
3. 影响分析（逐模块评估改动影响）
4. 任务拆分初稿（按模块/功能点拆分，标注依赖关系）

思考方式（#1 CoT + #2 SSR）：将影响分析拆成以下可独立验证的子步骤，逐步推进：
1. 涉及哪些模块？（用 grep/搜索验证模块存在性）
2. 各模块的调用链是什么？（列出关键函数路径）
3. 修改方案对每个模块的影响？（逐模块评估，错了只重做这一步）
4. 方案是否有可执行的验证方式？（写一段伪代码/脚本说明修改后的行为预期）

## 第二步：关键技术假设清单（必填）

  ```
  ## 关键技术假设
  | # | 假设内容 | 证据类型 | 证据详情 | 置信度 |
  |---|---------|---------|---------|-------|
  | H1 | 例：CDisplayInfo 可检测到所有投屏场景 | 源码审查 | displayinfo.cpp:42 | 高 |
  | H2 | 例：第三方会议软件也会触发 CLONE 模式 | 文档链接 | xxx/wiki/... | 中 |
  ```

  证据类型（本阶段以**静态**为主）：源码确认 / 文档链接 / 行业共识 / 无证据。（**运行时验证**、**POC验证** 将在后续 P3 阶段产出后再更新本表；本阶段可标注「⏳ 待动态验证」。）
  "无证据" 的假设必须在置信度中标"低"。

## 第三步：预死亡分析（Pre-mortem）

假设这个方案已经上线，产品验收失败或用户投诉量高。
列出最可能的 top 3 失败原因：

  ```
  ## 预死亡分析
  假设方案上线后失败，最可能的原因：
  1. [原因] — 可能性：高/中/低 — 缓解措施：...
  2. [原因] — 可能性：高/中/低 — 缓解措施：...
  3. [原因] — 可能性：高/中/低 — 缓解措施：...
  ```

## 第四步：对抗审查（反方追问）

完成方案后，以反方审查者视角回答：
1. 这个方案中，哪些结论是基于"推测"而非"验证"的？
2. 什么场景下这个方案会完全失效？
3. 改动量最大/风险最高的那个任务，有没有更简单的替代路径？
4. 如果把总置信度打 5 折，最该怀疑的是哪个环节？

将追问结论写入「## 对抗审查结论」章节。

## 第五步：综合置信度评估

根据关键假设清单计算综合置信度：
- 如果存在任何"无证据 + 置信度低"的关键假设 → 整体不超过"中"
- 如果核心功能依赖的假设有"低"置信度 → 整体不超过"中偏低"
- 必须给出分项评分表，而非笼统的单一评分

## Spec Self-Review（设计自检，必须执行）

- [ ] 无占位符（搜索 TODO、TBD、待定、...）
- [ ] 无内部矛盾（前后章节的结论是否一致）
- [ ] 无歧义描述（关键决策是否有明确的"是/否"结论，而非"可以考虑"）
- [ ] 范围边界清晰（明确写出"不包含"的内容）
- [ ] 接口契约完整（输入/输出/错误处理都有定义）

## 必须产出

1. 读取模板 conductors/dev/templates/design.template.md，按其结构填充，写入 {task_dir}/thinking/P2-design.md
   文件末尾附：综合置信度评估表 + 不确定的部分 + 低置信度环节是否需人工确认或列入后续 **enhance**（运行验证/POC）

2. **任务知识库维护**（不可跳过）：
   完成 P2-design.md 后，读取 `skills/task-knowledge/SKILL.md` 并执行全部操作：
   - 复制涉及模块的全局知识到 `{task_dir}/knowledge/refs/`
   - 保存本阶段搜索/调研关键发现到 `{task_dir}/knowledge/research/`
   - 保存独立分析产物到 `{task_dir}/knowledge/session/`
   - 更新 `{task_dir}/knowledge/README.md` 索引

质量门禁（自检后才能继续）：
- [ ] 已列出至少 2 个可行方案并给出推荐理由
- [ ] 影响分析覆盖所有相关模块
- [ ] 关键技术假设清单已列出，每条标注证据类型和置信度
- [ ] 预死亡分析 top 3 已列出
- [ ] 对抗审查 4 个问题已回答
- [ ] 综合置信度基于假设清单计算，而非主观感觉
- [ ] Spec Self-Review 6 项全部通过
- [ ] knowledge/README.md 已更新（非空模板状态）
```

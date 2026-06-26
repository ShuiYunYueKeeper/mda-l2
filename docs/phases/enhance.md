# P3: 上下文增强（动态 Skill + POC 驱动）

> 本文件由 `conductors/dev/conductor.mdc` 在 P3 时读取。
> 公共约定详见 `common/common-conventions.md`。
> **路径约定**：下文 `{task_dir}/` 指 conductor 派发时声明的任务目录（如 `workspace/tasks/feature-YYMMDD-xxx/`）。
>
> **本阶段定位**：P2 静态分析完成后，通过动态 Skill 和 POC 实验来验证设计假设。
> 由 conductor P2→P3 自动触发评估判定进入（有技术类 ⏳ 待验证假设时自动触发）。

## 本阶段可用工具

P3 上下文增强的 subagent 可以使用以下 Skill（Phase 授权）：

| Skill | 路径 | 用途 | 触发条件 |
|-------|------|------|---------|
| log-analysis | `skills/log-analysis/SKILL.md` | 日志解码+实时监控 | 需理解运行时行为 |
| wps-runtime-probe | `skills/wps-runtime-probe/SKILL.md` | WPS 进程状态探测 | WPS 运行中 |
| compile | `skills/compile/SKILL.md` | 编译验证 POC 代码 | POC 实验 |

> P2 的静态工具（Read/Grep/SemanticSearch 等）在本阶段仍可使用，用于交叉验证。

## 角色约束

- agents/code-analyzer.md
- ⚠️ 派发时须设置 `readonly: false`（需写入 thinking/P3-enhanced-context.md 和 scratch.md）
- 推荐 subagent_type：`generalPurpose`（需要 Shell 执行 Skill CLI 和 POC 编译）

## 输入文档

- `{task_dir}/thinking/P2-design.md` — P2 静态分析/设计汇总（必须存在）
- `{task_dir}/thinking/P2-design-draft.md` — P2 草案（如有）
- `{task_dir}/thinking/P2-context-{module}.md` — 各模块扫描结果（如有）
- `{task_dir}/scratch.md` — 全流程草稿

## P3: 上下文增强 Prompt

```
【必须先执行】读取以下文件：
- agents/code-analyzer.md
- {task_dir}/thinking/P2-design.md

你的任务是通过动态工具和 POC 实验，验证 P2 设计中的关键假设。

Step 0：环境可用性前置检查（不可跳过）
在执行任何动态验证前，确认工具可用性：

1. **WPS 进程检查**：执行 `tasklist /FI "IMAGENAME eq wps.exe"` (Windows) 或 `pgrep -f wps` (Linux/Mac)
   - 可用 → 记录 PID，标记 wps-runtime-probe / log-analysis 可用
   - 不可用 → 标记对应 Skill 为"不可用"
2. **编译环境检查**（POC 需要时）：确认 build_dir 可达、编译命令可执行
   - 可用 → 标记 compile Skill 可用
   - 不可用 → 标记为"不可用"

**全部动态工具不可用时的处理**：
- 写入 `{task_dir}/thinking/P3-enhanced-context.md`，内容为：
  ```
  ## 动态证据摘要
  ⚠️ P3 自动触发，但动态验证环境不可用（WPS 未运行 / 编译环境不可达）。

  ## 置信度更新
  置信度维持 P2 水平不变（无新证据，不降低也不提升）。
  原因：{具体不可用原因}

  ## 建议
  建议在下次 WPS 运行时重新执行 P3，或由用户提供运行时信息。
  ```
- 正常退出，交由 conductor 进入人工确认环节。

如至少 1 个动态 Skill 可用 → 继续执行 Step 1。

Step 1：识别需验证的设计假设
读取 thinking/P2-design.md（和 thinking/P2-design-draft.md 如有），找出：
- 置信度 <80% 的技术假设
- 标记为 ⏳ 的待动态验证假设
- 需要运行时行为确认的设计决策
列出需要验证的假设清单和对应的验证策略。

Step 2：执行动态验证
根据假设类型选择验证方式：

1. 运行时行为验证（WPS 运行中）→ 读取 skills/wps-runtime-probe/SKILL.md：
   - 按精简模式探测 WPS 运行状态
   - 确认 API 行为、模块交互等设计假设

2. 日志分析 → 读取 skills/log-analysis/SKILL.md：
   - python tools/live_tail.py --snapshot --filter "{关键词}" → 实时日志
   - 确认模块间通信、事件触发顺序等

3. POC 实验 → 读取 skills/compile/SKILL.md：
   - 在隔离分支或独立目录编写最小验证代码
   - 编译并验证关键技术假设
   - ⚠️ POC 代码不计入正式实现，仅用于验证

每个验证后记录：
- 验证方式 + 执行过程
- 结果：确认 / 否定 / 部分确认
- 对设计方案的影响

Step 3：交叉验证与方案影响评估
将动态证据与 P2 设计交叉对比：
- 假设被确认 → 提升置信度，设计不变
- 假设被否定 → 标记冲突，提出替代方案
- 新发现 → 评估是否需要调整设计方向

Step 4：产出
写入 {task_dir}/thinking/P3-enhanced-context.md，包含：

## 动态证据摘要
（每条证据：验证方式 + 关键发现 + 验证了哪个假设）

## POC 实验记录
（如有 POC：代码位置 + 编译结果 + 结论）

## 置信度更新
（更新后的假设验证表，标注变化：↑提升/↓降低/→不变）

## 设计影响评估
（哪些设计决策需要调整 + 建议的调整方案）

## 建议
（是否需要进一步调查 / 足以进入方案确定）

质量门禁（自检后才能继续）：
- [ ] 每个验证过程都有执行记录和结果
- [ ] 至少验证了 1 个 P2 标记为 ⏳ 的假设（降级路径豁免：若 Step 0 判定全部工具不可用，此项标注 N/A 并引用 Step 0 结论）
- [ ] 置信度更新有数据支撑（非主观调整）（降级路径：维持 P2 水平，标注"无新证据"即满足）
- [ ] 设计影响评估明确（无影响也要显式说明）（降级路径：写"环境不可用，无法评估设计影响"即满足）
- [ ] 无未替换的 {xxx} 占位符

⛔ P3 到此结束。产出交给 conductor 进行人工确认。
```

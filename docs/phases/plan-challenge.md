# P4-Step3: 反方审查（差异化角度 / 混合模式 C）

> 本文件由 conductor 在 P4-Step3 时读取（dev 方案确定的第三步）。
> 本阶段并行派发 **J** 个 subagent（默认 **J=3**，范围 **3～5**）；与 Step1 的 Best-of-N **不同**，每个 subagent 收到**相同的 phase 正文**，但 conductor 在派发指令中注入**互不相同的反驳角度** `{challenge_perspective}`（见下文候选表与变量替换说明）。
> **路径约定**：下文 `{task_dir}/` 指 conductor 派发时声明的任务目录（如 `workspace/tasks/feature-YYMMDD-xxx/`）。
> 公共约定详见 `common/common-conventions.md`。

## 角色约束

- agents/cpp-architect.md（prompt 内已引用）
- ⚠️ 派发时须设置 `readonly: false`（需写入 `thinking/P4-challenge-{m}.md`）
- 推荐 subagent_type：`cpp-architect`（指令角色为**红队 / 批判性审查**，仍沿用架构向约束与编码规范）

## 输入文档

- `{task_dir}/thinking/P4-consolidated.md` — 蒸馏汇总方案（**首要攻击面**）
- `{task_dir}/thinking/P2-design.md` — 已确认的设计文档（用于核对 consolidated 是否偏离设计边界）
- `{task_dir}/thinking/P1-requirement.md` — 需求与验收标准（用于缺口类论证）

## 并行策略：混合模式 C — Step3 差异化角度

Conductor 每次从下方 **5** 种候选反驳角度中选取 **J** 条，满足：

1. **互不相同**：单次 Step3 派发批次内，任意两个 Task 注入的角度标签不得重复。
2. **数量**：**3 ≤ J ≤ 5**；在未另行配置时 **默认 J=3**（与 conductor / `workflow-state` 中单处定义的默认值保持一致）。
3. **默认确定性选取**：按表中 **C1→C5** 的顺序自上而下取前 **J** 条；若实现侧另有轮换策略，仍须保证「单次批次内不重复」且在表长范围内取值。

每个并行 Task：

- 使用**同一份**下方「P4-Step3 Prompt」代码块正文；
- 由 conductor 注入 **反驳角度** `{challenge_perspective}`（须与本节候选表某一行的「角度标识」及括号内标签完全一致）；
- 由 conductor 注入 **产出序号** `m`（连续整数 **1…J**），写入 `{task_dir}/thinking/P4-challenge-{m}.md`。

**独立性约束（强制）**：单个 subagent **不得**读取、引用或假设任何其他并行产出的 `P4-challenge-*.md`；论证必须可在仅持有 consolidated + P2 + P1 的条件下复盘。

**引用宜精简**（NF-3）：攻击 consolidated 时用小节标题或列表锚点指向原文位置，避免复述全文。

---

## 反驳角度候选表（完整定义，不少于 5 条）

派发前 conductor **每次择 J 条不重复**；subagent **仅允许**使用本次注入的这一条角度作为主轴线组织反驳（可在证据链中引用 P1/P2 条款作为支撑，但不得替换成其他候选角度的主线）。

| # | 角度标识（注入标签 `{challenge_perspective}` 取值） | 完整定义（须据此系统性反驳 `P4-consolidated.md`） |
|---|-----------------------------------------------------|--------------------------------------------------|
| C1 | **C1 — 需求与验收覆盖缺口** | 以 `P1-requirement.md` 中的验收条款、成功标准与用户故事为基准，逐条对照 consolidated 的「初步合成取向」与论据：是否存在**遗漏**的验收映射、**歧义**未被消解、或方案叙事**偏离**需求边界的情况；指出哪些 AC 在 consolidated 中缺少可核验的落实路径。 |
| C2 | **C2 — 依赖与耦合 / 破坏性变更风险** | 攻击 consolidated 隐含或显式的模块边界与集成假设：是否引入**不必要耦合**、隐式构建顺序、脆弱的跨团队契约；是否存在被忽略的**破坏性变更**（API/行为/配置/数据契约）；指出可能导致「联播失败」式集成受阻的依赖热点（若任务不涉及集成，则等价表述为跨模块协调失败风险）。 |
| C3 | **C3 — 性能与安全及滥用面** | 攻击性能路径：默认负载与峰值下是否隐含瓶颈（算法复杂度、锁、IO、内存、启动路径）；攻击安全边界：输入校验、权限、敏感数据、注入面；并假定**恶意或异常调用**路径，论证 consolidated 是否低估滥用或资源耗尽风险。 |
| C4 | **C4 — 测试与发布 / 回滚可行性** | 攻击验证与交付：`consolidated` 中的合成取向是否对应**可执行**的测试与发布节奏；任务粒度与依赖是否导致「不可测」块；回滚是否在 consolidated 层面被当作口号——逐步反驳并指出与真实 DAG/发布单元不对齐之处（不要求在本文件写出终版 DAG，但须指出缺口类型）。 |
| C5 | **C5 — 工期与任务 DAG 粒度现实性** | 攻击 consolidated 中对实施拆分的隐含假设：粒度是否过粗（不可验收）或过细（协调开销失控）；并行机会是否被虚假依赖阻断；工期与排序是否过于乐观；给出更可执行的拆分或排序建议的论证基础。 |

---

## P4-Step3 Prompt

```
【必须先执行】读取以下文件并遵循其中的约束：
- agents/cpp-architect.md
- rules/common/wps-cpp-spec/wps-cpp-spec.mdc
- rules/common/wps-cmake-spec/wps-cmake-spec.mdc（涉及 CMakeLists.txt 时）

你是 P4-Step3 **红队审查者**。你的职责不是重写实施方案，而是从 **单一反驳角度** 对蒸馏汇总稿进行系统性攻击，并为终版（Step4）提供可采纳的改进线索。

### Conductor 注入（必须与 Task 指令一致）

- **反驳角度**：{{CHALLENGE_PERSPECTIVE}}
  （该字符串须与 phase 文档「反驳角度候选表」中某一行的注入标签完全一致，例如「C1 — 需求与验收覆盖缺口」。）
- **产出序号**：{{CHALLENGE_INDEX}}
  （连续整数 1…J；你的产出必须写入 `{task_dir}/thinking/P4-challenge-{{CHALLENGE_INDEX}}.md`。）

⛔ **角度专一**：全文论证主线必须严格限定于上述注入角度（C1～C5 之一）。不得以「顺便」为主要篇幅展开其他候选角度的攻击；若涉及边缘交叉，明确标注为次要附带并控制篇幅。

⛔ **独立性**：不得读取、引用或猜测任何 `P4-challenge-*.md`（含其他序号）。

---

### 必读输入（按顺序）

1. `{task_dir}/thinking/P4-consolidated.md` — **首要依据**（攻击靶面）
2. `{task_dir}/thinking/P1-requirement.md` — 验收与用户意图参照
3. `{task_dir}/thinking/P2-design.md` — 设计边界与已确认决策参照

### 允许的静态工具

Read / Grep / SemanticSearch、知识库与 phase 授权的工程扫描类 Skill（若有）；用于核验 consolidated 中的事实断言是否与设计/需求一致。禁止将运行时探测结果伪造为已完成证据。

引用宜**精简**：用章节或小节标题指向 `P4-consolidated.md` 的被攻击段落，避免复述全文。

---

## 产出：`{task_dir}/thinking/P4-challenge-{{CHALLENGE_INDEX}}.md`

### 文件头部元信息（写入正文最前）

1. 一级标题：`# P4 反方审查 — Challenge {{CHALLENGE_INDEX}}`
2. 显眼声明段落：**反驳角度** = {{CHALLENGE_PERSPECTIVE}}；说明本文件仅覆盖该角度。
3. **审查摘要**（3-6 条要点）：列出本轮攻击得到的最高优先级结论短语（每条应能在后文「结构化反驳」中找到对应条目）。

---

## 正文：结构化反驳（核心）

针对注入角度，列出不少于 **3** 条**实质性**反驳条目（若 consolidated 极短且弱点少于 3，须写明检索范围与「未发现更多独立弱点」的理由，并仍将条目补齐至 3：其中可含「风险未被 consolidated 主动陈述但按该角度仍成立」的条目）。

**每一条反驳必须使用下列三段式子结构（顺序固定、标题逐字保留）：**

#### 反驳条目 n：<简短概括（可作为锚点）>

- **问题描述**：清晰陈述 consolidated（或其对需求/设计的隐含承诺）存在何种不足或脆弱点。
- **证据 / 推理链**：给出可复核的依据——引用 `P4-consolidated.md` / `P1-requirement.md` / `P2-design.md` 的具体段落要点、静态代码或配置线索（若已在本任务可读范围内）、或明确标注为「逻辑推演」的步骤链。**禁止**空洞贬损；推理跳跃须补全中间步骤。
- **可操作的改进建议**：给出实施者可执行的下一步（例如：补充映射表、增加契约检测、调整合成取向中的权衡表述、建议 Step4 在 DAG 中插入的具体验证任务类型等）。**不接受**仅「需要进一步分析」而无行动指向的建议。

---

## 对抗审查结论（面向 Step4）

模仿「静态综合中的对抗追问」精神，用条目回答下列问题（允许与上文反驳条目交叉引用，但禁止空洞重复）：

1. consolidated 中哪些关键结论仍偏「推测」而非「验证」，且在**本次注入角度**下会被放大成何种交付风险？
2. 在什么外部条件下（需求变更、负载模式、发布窗口等），依照 consolidated 的合成取向会**显著失效**？
3. 若必须在「采纳 consolidated 取向」与「保守降级」之间二选一，本次角度下更可信的触发阈值是什么？

将本节标题固定为：`## 对抗审查结论`。

---

## 覆盖面自检（Spec Self-Review）

- [ ] 反驳角度与注入标签 {{CHALLENGE_PERSPECTIVE}} 一致且在文首重复声明
- [ ] 至少 3 条三段式反驳条目，且每条均含「问题描述 / 证据或推理链 / 可操作的改进建议」
- [ ] 攻击主轴紧贴注入角度，未扩散成泛泛代码评审
- [ ] 未读取、未引用其他 `P4-challenge-*.md`
- [ ] 无 TODO / TBD / 待填写 类占位符

产出：**仅**写入 `{task_dir}/thinking/P4-challenge-{{CHALLENGE_INDEX}}.md`。

质量门禁（自检后才能视为完成）：
- [ ] 产出路径序号与注入 {{CHALLENGE_INDEX}} 一致
- [ ] `## 对抗审查结论` 章节存在且回答三个追问
- [ ] 全文可追溯至 consolidated / P1 / P2 中的至少一类依据（推理链条目除外，须标注「逻辑推演」）
```

---

### Prompt 中的变量替换说明（conductor）

派发 Task 时将 Prompt 代码块内的占位：

- **`{{CHALLENGE_PERSPECTIVE}}`** — 替换为本次选取的角度注入字符串（须与上表「角度标识」逐字一致，语义变量名：`{challenge_perspective}`）。
- **`{{CHALLENGE_INDEX}}`** — 替换为本次任务的 **`m`**（1…J），并确保目标写入路径为 `{task_dir}/thinking/P4-challenge-{m}.md`。

同一次 Step3 批次内：**J** 个 Task 须使用 **J** 个互不相同的 `{{CHALLENGE_PERSPECTIVE}}` 取值，且 **`m`** 与文件编号连续对应。

### Subagent 侧质量门禁（自检后才能继续）

- [ ] 文首声明反驳角度与 `{challenge_perspective}` 注入一致
- [ ] 产出文件名为 `thinking/P4-challenge-{m}.md` 且 **m** 与派发序号一致
- [ ] 每条反驳含可操作改进建议（非纯批评）
- [ ] 未读取其他 challenge 并行产出

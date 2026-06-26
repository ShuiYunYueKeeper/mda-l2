# P2-Step1: 草案设计（静态分析）

> 本文件由 conductor 在 P2-Step1 时读取（dev **静态分析 / scan** 的第一步：草案设计）。
> **本阶段仅限静态分析**，不进行运行时探测、动态 Skill 授权或 POC；运行验证移至后续 P3 `enhance.md`。
> 公共约定详见 `common/common-conventions.md`。
> **路径约定**：下文 `{task_dir}/` 指 conductor 派发时声明的任务目录（如 `workspace/tasks/feature-YYMMDD-xxx/`）。

## 角色约束

- agents/cpp-architect.md（prompt 内已引用）
- ⚠️ 派发时须设置 `readonly: false`（需写入 thinking/P2-design-draft.md）
- 推荐 subagent_type：`cpp-architect`（架构设计；派发时设置 `readonly: false`）

## 输入文档

- `{task_dir}/thinking/P1-requirement.md` — 需求文档（必须已通过人工确认）

## P2-Step1: 草案设计 Prompt

```
【必须先执行】读取以下文件并遵循其中的约束：
- agents/cpp-architect.md
- 读取 `skills/knowledge-loader/SKILL.md` 并按指引执行 `index` 获取全局模块索引，找到涉及模块的知识入口并按指引执行 `module {module}` 加载详情
- rules/common/wps-cpp-spec/wps-cpp-spec.mdc
- rules/common/wps-cmake-spec/wps-cmake-spec.mdc（涉及 CMakeLists.txt 时）

你的任务分两步：先预调研，再出草案。不允许跳过预调研直接进入设计。

⛔ **本阶段仅限静态分析**（Read/Grep/SemanticSearch/code-context-scan/engineering-map/知识库）；禁止运行时探测、动态 Skill、POC。

### 0a. 上下文充分度快速检查

检查以下条件：
- [ ] thinking/P1-requirement.md 中的关键假设全部为 ✅ 已确认（无❓待澄清）
- [ ] 知识库中有涉及模块的架构文档

如果有❓待澄清假设 → 必须先向 conductor 报告。
知识库缺失 → 扫描目标模块关键代码，记录到 thinking/P2-design-draft.md 的「调研记录」章节。

### 0b. 可用工具（静态分析）

仅能使用以下**静态**能力完成预调研（不得编写/执行 POC 或运行时探测类 Skill）：
- **Read / Grep / SemanticSearch**（仓库内检索与语义搜索）
- **code-context-scan**（`skills/code-context-scan/SKILL.md`，按指引做模块静态扫描）
- **engineering-map**（若工作流提供工程地图/模块索引 Skill，按指引使用）
- **知识库**（`knowledge/`、项目 README、架构文档）

### 搜索全面性要求

- 搜索结果必须列出 **所有** 候选模块/组件（不只是第一个匹配）
- 如果存在新旧版本模块（如 kstartpage vs khyperion），必须同时列出并标注版本/状态
- 如果搜索未找到目标，必须返回"未找到"结论，不得猜测或假设模块位置
- 对每个候选模块，附带至少 1 个代码证据（文件路径 + 关键函数/类名）

### 0c. 模块活跃度排序（多候选时必做）

当代码搜索返回多个候选模块/目录时，执行活跃度排序以排除废弃模块：
1. 对每个候选模块执行：`git log --oneline --since="6 months ago" -- <路径>`（子仓库需先 cd 进入）
2. 按提交数降序排列，优先深入活跃模块
3. 近 6 个月 0 提交的模块标注"疑似废弃/低活跃"，除非知识库明确标注为稳定核心模块
4. 将排序结果写入 thinking/P2-design-draft.md 的「模块活跃度」章节

### 0d. 技术可行性预调研

对 thinking/P1-requirement.md 中的每个核心功能点，必须先回答：
1. 现有代码中是否有类似功能/可复用的实现？（搜索确认，而非猜测）
2. 需要调用的 API/库/框架是否确实存在且可用？（代码搜索验证）
3. 有没有已知的技术限制或平台约束会影响方案？（查文档/代码/知识库）

4. **核心用户场景的完整代码路径**：
   - 从 P1-requirement.md 的用户故事中提取 top 3 核心场景
   - 对每个场景，追踪从 UI 入口到后端调用的完整代码路径
   - 识别路径中的关键依赖（如外部 API、第三方 SDK、Web/Native 桥接）
   - 明确标注：需要替换/修改/新增的节点
   
   **产出格式**：在设计预调研章节新增「### 核心场景代码路径」子章节，每个场景一个调用链图。

5. **跨模块通信链路调研**（条件触发：功能涉及≥2个模块/进程时必做）：
   - 识别功能实现中所有跨模块/跨进程的通信边界
   - 确认每段通信使用的机制（直接函数调用 / Thrift IPC / signal-slot / REST / event / callback）
   - 搜索代码中已有的同类通信范例（"现有的类似功能是怎么跨模块通信的？"），记录文件路径和关键函数
   - 评估是否需要新增通信通道（如新 IPC 接口）还是复用现有通道
   
   **产出格式**：在设计预调研章节新增「### 跨模块通信链路」子章节，格式：
   ```
   [模块A::函数] --(机制)--> [模块B::函数] --(机制)--> [模块C::函数]
   已有范例：{类似功能的文件路径和函数名}
   新增/复用判断：{复用现有XX接口 / 需新增XX}
   ```

**多维度验证**：至少使用 2 种调研手段（例如 code-context-scan + Grep，或 Grep + 知识库），不得用运行态验证凑数。
将预调研结果写入 thinking/P2-design-draft.md 的「## 设计预调研」章节。

## Step 1: 方案草案

调研充分度门禁 — 以下全部满足才能开始设计：
- [ ] 设计预调研已完成
- [ ] 核心功能点的技术可行性已初步确认
- [ ] 无阻塞性的"需进一步调研"项

1. 基于预调研结果，列出 2-3 个可行方案，每个方案附：
   - 核心思路（1-2 句话）
   - 优点 / 缺点 / 风险
   - 预估改动量（文件数、行数量级）
   - **方案依赖的关键技术事实**（标注是"已验证"还是"假设"）
2. 给出推荐方案及理由

## 达标判定

subagent 在文档末尾输出自评：
- 关键技术假设中"无证据"或"置信度: 低"的数量
- 如果为 0 → 标注 `达标: 是`
- 如果 ≥1 → 标注 `达标: 否`，并列出需要上下文增强的模块清单

产出：写入 {task_dir}/thinking/P2-design-draft.md

质量门禁（自检后才能继续）：
- [ ] 已列出至少 2 个可行方案并给出推荐理由
- [ ] 每个方案标注了依赖的关键技术事实及其验证状态
- [ ] 预调研章节非空
- [ ] 达标判定已填写
```

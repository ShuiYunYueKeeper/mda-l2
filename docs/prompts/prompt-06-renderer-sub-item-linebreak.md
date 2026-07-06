# AI 协作记录 — 迭代：伪子条目换行渲染修复

> 工作流：`.cursor/workflow.md` → P4 通用迭代协议（六步循环）  
> 类型：`fix(renderer)` — 预览渲染与作者意图不一致  
> 日期：2026-07-06

---

## 背景

用户在 MDA 中打开 `AGENTS.md`，发现 §9 隐性规范第 4 条下的 `4b.`–`4g.` 在预览里被并成一段。  
用户明确要求：**不得强制修改用户原文档格式**（如改成嵌套列表），应在渲染层兼容。

---

## Step 1 — 审查（Review）

### 现象

源文件中 `4.` / `4b.` / `4c.` 各占一行，预览显示为单段连续文本。

### 根因

CommonMark 有序列表只识别 `数字.` 标记；`4b.` 等「数字+字母+点」不是合法列表项，会作为第 4 条的 lazy continuation 并入同一段落。  
单行换行在 CommonMark 中不产生 `<br>`，除非行末有两空格（硬换行）。

### 影响范围

- `src/core/renderer.ts` → `preprocessForRender`
- GUI preload 复用同一 `renderMarkdown`，无需单独改 GUI
- 源文件不变；仅渲染时注入硬换行标记

### 风险

| 风险 | 应对 |
|------|------|
| 误匹配行首 `3a.` 等非列表语境 | 模式限定 `^\d+[a-z]+[.、:：)）]`，且仅在上一行非空时触发 |
| 代码围栏内样例被改写 | `buildCodeFenceMask` 跳过围栏内行 |
| 破坏「去批注后渲染等价」 | 预处理对含/不含批注的正文等效；已有测试守护 |

---

## Step 2 — 方案（Implement 前须确认）

**策略**：在 `preprocessForRender` 中新增 `preserveSubItemLineBreaks`：

1. 识别 `^\d+[a-z]+[.、:：)）]` 行（如 `4b.`、`4e、`、`4f)`）
2. 若上一行非空且不在围栏内，在上一行末补两空格 → markdown-it 输出 `<br />`
3. 后续 `5.` 等真实列表项仍为独立 `<li>`，编号不乱

**改动文件**：

- `src/core/renderer.ts` — 预处理逻辑
- `tests/core/renderer.test.ts` — 3 个用例（`4b.` 正向、顿号/括号分隔符、围栏内不处理）
- `AGENTS.md` — 4b 条补充③说明（隐性规范同步）

**人工确认点**：✅ 已确认（用户接受渲染层预处理方案，不改源文档格式）

---

## Step 3 — 自查（Self-Review）

- [x] `npm run build:ts` 通过
- [x] `git diff` 仅涉及 renderer / tests / AGENTS.md
- [x] 不改正文行、不碰 writer/parser 写入语义
- [x] 与 AGENTS.md §4b 预处理职责一致

---

## Step 4 — 验证（Verify）

```text
npm test — 79 passed（renderer +3 用例）
```

| 用例 | 结果 |
|------|------|
| `4.` / `4b.` / `4c.` / `5.` 分段含 `<br />` | ✅ |
| `4e、` / `4f)` 顿号与括号分隔符换行 | ✅ |
| 围栏内 `4b.` 不注入 `<br />` | ✅ |
| 批注不可见性既有用例 | ✅ 未回归 |

**GUI 人工验证**：✅ 已通过（2026-07-06）

1. `npm run gui -- AGENTS.md` 打开 §9 第 4 条
2. `4b.`–`4g.`（含 `4e、`、`4f)`）各自换行显示
3. 第 5 条仍为独立列表项

---

## Step 5 — 文档（Document）

| 文档 | 状态 |
|------|------|
| `AGENTS.md` 4b | ✅ 已补充③ |
| `quality.md` | ✅ 测试数 79、renderer 说明、覆盖率已同步 |
| 本文件 `docs/prompts/prompt-06-*.md` | ✅ |

---

## Step 5.5 — 提交（Commit）

**状态**：待提交（变更未入库）

建议 commit message：

```text
fix(renderer): 渲染时保留伪子条目换行（4b. / 4e、 / 4f) 等）

Co-Authored-By: Cursor <noreply@cursor.com>
```

---

## Step 6 — 下一步（Next）

- ✅ 本迭代闭环完成
- 后续迭代须遵守：Step 1 审查 → Step 2 方案确认 → 再写代码

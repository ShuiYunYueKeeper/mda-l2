# 质量保障说明（Quality Assurance）

本文件汇总 MDA 项目的质量保障策略，便于评审快速清点：测试体系、覆盖率、数据校验、
源文件安全、人工审核点、Code Review 痕迹与协作资产。

---

## 1. 测试体系

| 套件 | 文件 | 说明 |
|------|------|------|
| parser 单元测试 | `tests/core/parser.test.ts` | E1–E25 边界体系：空文件、无批注、连续批注、多段落、非法 JSON、特殊字符、CRLF、无空行段落、1MB+ 性能、围栏代码块内样例不识别等 |
| writer 单元测试 | `tests/core/writer.test.ts` | 增删改、行号越界、ID 不存在、源文件保护、原子写入失败清理、空行压缩、CRLF/LF 保留 |
| renderer 单元测试 | `tests/core/renderer.test.ts` | 批注不可见性（不含 `@anno`/字段值、去批注后渲染等价）、含括号批注、BOM 标题、围栏样例原样显示、图片 fallback、level→color |
| 配置一致性测试 | `tests/core/config.test.ts` | 锁定外置规则（枚举/配色/严重度/正则）与 core 派生值一致，防止漂移 |
| CLI 集成测试 | `tests/cli/commands.test.ts` | 四命令端到端：stdout 纯净、退出码、枚举校验、round-trip |

运行：

```bash
npm test          # jest，含覆盖率
```

**当前状态：70 用例全部通过。**

---

## 2. 覆盖率

| 指标 | 数值 |
|------|------|
| Statements | ~88% |
| Lines | ~91% |
| Functions | ~95% |

> 以 `npm test`（jest --coverage）实测为准；core 模块覆盖率最高（model 100% / renderer 100%）。

---

## 3. 数据校验与失败降级

- **枚举守卫**：`isAnnotationLevel` / `isAnnotationStatus`（`src/core/model.ts`）在 add/edit/scan 入口校验，非法值报错退出而非落盘。
- **非法 JSON 降级**：parser 遇到无法解析的批注行 → 跳过 + stderr 告警，**不崩溃**。
- **可配置规则单一真相**：枚举、级别配色、严重度、批注正则统一外置到 `src/config/annotation-schema.json`，core 从中派生，避免多处硬编码漂移。

---

## 4. 源文件安全（写入）

- **原子写入**：临时文件（`.<name>.<uuid>.tmp`）+ `fs.rename`，失败清理临时文件，绝不直接覆盖。
- **源文件保护**：`verifySourceProtection` 校验写操作只改动批注行，正文逐字节不变。
- **换行保留**：`detectEol` 保持原文件 CRLF/LF 风格。
- **空行压缩**：删除批注产生的相邻空行压缩，但不触碰正文原有空行。

---

## 5. 人工审核点（Human-in-the-loop）

| 审核点 | 触发条件 | 原因 |
|--------|----------|------|
| GUI 实机验证（硬约束） | 任何 `src/gui/**` 改动 | 自动化测试 + `build` 通过 ≠ 验证完成；渲染、双向定位、拖拽、原生模态失焦、代码块右键/快捷键等缺陷只有实机能暴露。详见 `.cursor/workflow.md` / `.claude/workflow.md` Step 4 |
| 阶段确认门禁 | P0–P3 每阶段产出后 | 设计取舍需人工确认后才进入下一阶段 |
| 截图 / 录屏 | 交付阶段 | 需人工实机操作产出素材 |

任务级人/机分工见 `docs/P3-implementation-plan.md` 的「执行主体分工」表。

---

## 6. Code Review 痕迹

- git 历史含显式 review 提交与分严重程度的问题清单 → 逐项修复 → 回归（见 `docs/prompts/prompt-05-p4-implementation.md`，含「遗留项」跟踪至闭环）。
- 提交遵循 Conventional Commits（`feat/fix/refactor/test/docs/chore`），小粒度原子提交。

---

## 7. 协作资产

| 资产 | 位置 |
|------|------|
| AI 协作指南（架构/接口/禁止事项/隐性规范） | `AGENTS.md` |
| Few-shot 正反例（易错点 ✅/❌ 对照） | `docs/few-shot-examples.md` |
| 阶段模板（需求/设计/实施） | `docs/templates/*.template.md` |
| 可配置规则 | `src/config/annotation-schema.json` |
| 阶段设计文档 | `docs/P0–P3-*.md` |
| AI 对话记录 | `docs/prompts/*.md` |

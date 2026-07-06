# MDA 项目文档索引

> 设计阶段文档（P0–P3）、AI 协作记录与质量保障均在本目录。
> 参与开发前请同时阅读根目录 [`AGENTS.md`](../AGENTS.md) 与 [`quality.md`](../quality.md)。

---

## 阶段交付文档

| 文档 | 说明 |
|------|------|
| [`P0-requirements.md`](P0-requirements.md) | 需求分析（AC、风险、验收口径） |
| [`P1-architecture.md`](P1-architecture.md) | 架构设计（分层、模块边界、数据流） |
| [`P2-detailed-design.md`](P2-detailed-design.md) | 详细设计（算法、接口、批注语法） |
| [`P3-implementation-plan.md`](P3-implementation-plan.md) | 实现计划（Phase 任务 DAG、人机分工） |

## AI 协作资产

| 路径 | 说明 |
|------|------|
| [`prompts/`](prompts/) | 各阶段 Prompt 与人机协作记录（含 P4 GUI 迭代） |
| [`few-shot-examples.md`](few-shot-examples.md) | 易错点 ✅/❌ 成对示例（core + CLI + GUI） |
| [`templates/`](templates/) | 需求 / 设计 / 开发计划模板 |
| [`screenshots/README.md`](screenshots/README.md) | GUI 截图与录屏清单（README 引用素材） |

## 工作流

项目级人机协作流程见 [`.cursor/workflow.md`](../.cursor/workflow.md)（阶段门、六步循环、GUI 实机硬约束）。

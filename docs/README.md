# MDA 项目文档索引

> 设计阶段文档（P0–P3）、AI 协作记录与质量保障均在本目录。
> 参与开发前请同时阅读根目录 [`AGENTS.md`](../AGENTS.md) 与 [`quality.md`](../quality.md)。

---

## 阶段交付文档

| 文档 | 说明 |
|------|------|
| [`P0-requirements.md`](P0-requirements.md) | 1.0 需求分析（L2 命题版，已交付） |
| [`P0-requirements-v2-commercial.md`](P0-requirements-v2-commercial.md) | **2.0 商业化需求**（AI 开发者 · Freemium · MCP） |
| [`P1-architecture.md`](P1-architecture.md) | 1.0 架构设计（分层、模块边界、数据流） |
| [`P1-architecture-v2.md`](P1-architecture-v2.md) | **2.0 架构设计**（已确认 2026-07-13） |
| [`P2-detailed-design-v2.md`](P2-detailed-design-v2.md) | **2.0 详细设计**（已确认 2026-07-13） |
| [`RELEASE-2.0.0-alpha.md`](RELEASE-2.0.0-alpha.md) | **Phase A Free 发版说明**（tag `v2.0.0-alpha`） |
| [`P2-detailed-design.md`](P2-detailed-design.md) | 详细设计（算法、接口、批注语法） |
| [`P3-implementation-plan.md`](P3-implementation-plan.md) | 实现计划（Phase 任务 DAG、人机分工） |

## 里程碑实机验收清单

| 文档 | 里程碑 | 状态 |
|------|--------|------|
| [`M2-acceptance-checklist.md`](M2-acceptance-checklist.md) | 文件管理 F8 | ✅ 已验收 |
| [`M3-acceptance-checklist.md`](M3-acceptance-checklist.md) | 编辑预览增强 F1/F2 | ✅ 已验收 |
| [`M4-acceptance-checklist.md`](M4-acceptance-checklist.md) | 选区批注 F3 | ✅ 已验收 |
| [`M5-acceptance-checklist.md`](M5-acceptance-checklist.md) | MCP / 导出 / 更新 | ✅ 已验收 |
| [`M6-acceptance-checklist.md`](M6-acceptance-checklist.md) | Phase A 集成 / Free 门禁 | ✅ 已通过（2026-07-15） |
| [`M7-acceptance-checklist.md`](M7-acceptance-checklist.md) | Phase B Pro AI | 待开工 |

## AI 协作资产

| 路径 | 说明 |
|------|------|
| [`prompts/`](prompts/) | 各阶段 Prompt 与人机协作记录（含 P4 GUI 迭代） |
| [`few-shot-examples.md`](few-shot-examples.md) | 易错点 ✅/❌ 成对示例（core + CLI + GUI） |
| [`templates/`](templates/) | 需求 / 设计 / 开发计划模板 |
| [`screenshots/README.md`](screenshots/README.md) | GUI 截图与录屏清单（README 引用素材） |

## 工作流

项目级人机协作流程见 [`.cursor/workflow.md`](../.cursor/workflow.md)（阶段门、六步循环、GUI 实机硬约束）。

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
| [`P0-requirements-v3-wysiwyg.md`](P0-requirements-v3-wysiwyg.md) | **3.0 需求：预览直接编辑（WYSIWYG）+ 源码模式**（已确认 2026-07-28） |
| [`P1-architecture-v3-wysiwyg.md`](P1-architecture-v3-wysiwyg.md) | **3.0 架构：源码即真源 + CodeMirror 6 装饰式实时预览**（已确认 2026-07-28） |
| [`P2-detailed-design-v3-wysiwyg.md`](P2-detailed-design-v3-wysiwyg.md) | **3.0 详细设计：装饰规则表 / 双模式状态机 / 批注共存算法 / E49–E86**（已确认 2026-07-28） |
| [`P3-implementation-plan-v3-wysiwyg.md`](P3-implementation-plan-v3-wysiwyg.md) | **3.0 实现步骤：M8 共 10 阶段任务 DAG**（已确认 2026-07-28） |
| [`AI交互设计.md`](AI交互设计.md) | **AI 功能完整交互设计**（指令条 / 原位 diff / 待确认区 / 只读卡片 / 要点 / 评审线；取代 P2 §5.6，**已确认 2026-09-24**） |
| [`M8-acceptance-checklist.md`](M8-acceptance-checklist.md) | Phase 预览直接编辑 | 实现中；**SEL-1 正文选区着色 ✅**（2026-08-07 复验） |

## CM6 行内定界符与编辑栏（M8）

| 文档 | 说明 |
|------|------|
| [`界定符处理方案.md`](界定符处理方案.md) | 融合 / 拆分 / 清理算法、IME 干净文档、格内搭桥、渲染探针（**✅ 2026-09-04 验收**） |
| [`编辑栏交互说明.md`](编辑栏交互说明.md) | 无选区待输入格式、工具栏切换、段头/段尾落点语义 |

**回归用例**：`tests/e2e/gui/inline-delimiter-edit.spec.ts`（正文）、`table-cell-inline-matrix.spec.ts`（格内矩阵）、`table-cell-punct-cancel.spec.ts`（顿号紧贴开定界符 + 连续输入）；单测 `tests/gui/editor/inline-input-sweep.test.ts`（300 例扫掠）。

| [`RELEASE-3.0.0.md`](RELEASE-3.0.0.md) | **3.0.0 发版说明**（tag `v3.0.0`，CM6 预览编辑稳定版） |
| [`RELEASE-2.0.0-alpha.md`](RELEASE-2.0.0-alpha.md) | Phase A Free 发版说明（tag `v2.0.0-alpha`） |
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
| [`M6b-acceptance-checklist.md`](M6b-acceptance-checklist.md) | Free 后基础体验：流程图双拷贝 / 侧栏大纲 / 调图；公式预览与复制本轮搁置 | ✅ M6b-1/3/4 已通过（2026-07-23）；M6b-2/5 ⏸ 搁置 |
| [`M7-acceptance-checklist.md`](M7-acceptance-checklist.md) | Phase B Pro AI | ⏸ 暂停验收（并入 3.0 F14） |
| [`pro-activation.md`](pro-activation.md) | Pro 购买与离线激活说明 | M7-6 |

## AI 协作资产

| 路径 | 说明 |
|------|------|
| [`prompts/`](prompts/) | 各阶段 Prompt 与人机协作记录（含 P4 GUI 迭代） |
| [`few-shot-examples.md`](few-shot-examples.md) | 易错点 ✅/❌ 成对示例（core + CLI + GUI） |
| [`templates/`](templates/) | 阶段模板（各含版本号、适用档位与退出门禁）：[需求](templates/requirement.template.md) / [架构](templates/design.template.md) / [详细设计](templates/detailed-design.template.md) / [实施计划](templates/dev-plan.template.md) |
| [`screenshots/README.md`](screenshots/README.md) | GUI 截图与录屏清单；**v3 预览编辑截图**由 `tests/e2e/capture/docs-screenshots.spec.ts` 自动采集 |
| [`packaging-windows.md`](packaging-windows.md) | Windows 签名、界面语言、自动更新与 `latest.yml` |
| `demo/软著材料/` | 软著一般交存材料（操作说明书 + 代表性源程序）；`node scripts/generate-soft-copyright-materials.js` 生成 PDF |
| [`prompts/prompt-11-gui-file-sidebar-i18n.md`](prompts/prompt-11-gui-file-sidebar-i18n.md) | P4：文件侧栏、i18n、拖动修复协作记录 |
| [`prompts/prompt-12-outline-welcome-clear-list.md`](prompts/prompt-12-outline-welcome-clear-list.md) | P4：预览左侧大纲、启动欢迎页、清空文件列表 |
| [`prompts/prompt-13-zoom-copy.md`](prompts/prompt-13-zoom-copy.md) | P4：缩放层复制（图片 / 流程图源码） |
| [`prompts/prompt-14-path-tooltip-workspace-brand.md`](prompts/prompt-14-path-tooltip-workspace-brand.md) | P4：全路径悬停 + Markdown 工作台定位 |
| [`prompts/prompt-15-docx-autosave-welcome.md`](prompts/prompt-15-docx-autosave-welcome.md) | P4：导出 Word、自动保存、欢迎页叙事 |
| [`prompts/prompt-16-scroll-anno-panel.md`](prompts/prompt-16-scroll-anno-panel.md) | P4：编辑滚动稳定、批注定位与面板习惯 |
| [`prompts/prompt-17-batch-anno-line-shift.md`](prompts/prompt-17-batch-anno-line-shift.md) | 同文件批量 `mda_add` 行号漂移翻车与沉淀 |
| [`prompts/prompt-18-settings-clear-annos.md`](prompts/prompt-18-settings-clear-annos.md) | P4：设置入口、状态默认 open、一键清空批注 |
| [`prompts/prompt-19-mermaid-dark-zoom.md`](prompts/prompt-19-mermaid-dark-zoom.md) | **本轮 P4**：Mermaid 暗黑全屏清晰度 / Timeline 连线 / 默认尺寸 |
| [`prompts/prompt-20-m6b-preview-media-scale.md`](prompts/prompt-20-m6b-preview-media-scale.md) | M6b：图片/流程图默认缩放与预览调宽 |
| [`prompts/prompt-21-overall-code-review-adjustments.md`](prompts/prompt-21-overall-code-review-adjustments.md) | 整体代码审查、修复原因与后续风险 |
| [`prompts/prompt-22-sel1-prose-selection-fail.md`](prompts/prompt-22-sel1-prose-selection-fail.md) | M8：正文选取 SEL-1 不过关记录（阻塞） |
| [`prompts/prompt-23-block-select-undo-hover.md`](prompts/prompt-23-block-select-undo-hover.md) | M8：表格单击 / 块撤销恢复选中 / 悬停 200ms（✅） |
| [`prompts/prompt-29-quote-insert-no-highlight.md`](prompts/prompt-29-quote-insert-no-highlight.md) | M8：引用插入/空块手柄；暂不做高亮块（✅） |
| [`few-shot-examples.md`](few-shot-examples.md) §10 | 缩放遮罩：矢量放大、深色底、Timeline 统一色 |
| [`few-shot-examples.md`](few-shot-examples.md) §19 | 批量 add 批注：自下而上 / 禁并行 / 空行不可作 line |
| [`few-shot-examples.md`](few-shot-examples.md) §20 | 设置入口与清空全部批注 |
| [`few-shot-examples.md`](few-shot-examples.md) §22 | KaTeX 预览清晰度与复制预览公式转图（含整表导出、禁 Blob 污染） |
| `demo/` | 团队分享草稿（**暂不入库**，见 `.gitignore`） |

## 工作流

项目级人机协作流程见 [`.cursor/workflow.md`](../.cursor/workflow.md)（适用范围与阶段裁剪、六步循环、阶段门、GUI 实机硬约束、**推理侧工程组合**）。

工作流适用于任意软件工程任务，不限于 L2 命题：技术栈相关命令由「项目适配层」声明，任务规模差异由 **T0–T5 任务分档**裁剪阶段与文档，门禁（方案确认 / 输出校验三层 / 人工验证 / 沉淀 / 提交规范）不可裁剪。

「推理侧工程组合」章节规定每步用什么推理手段：思维链 / 少样本、RAG 私域检索、工具与内置探针、任务分解子代理、多模型路由、三层输出校验、自我反思、多结果投票；并按 L0–L3 风险分档决定开哪几件。

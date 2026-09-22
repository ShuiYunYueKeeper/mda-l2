# 按项目类型裁剪模板

> 裁剪有两个相互独立的维度，都要做：
> ① **按项目类型**裁目录与约束 —— 本文；
> ② **按任务规模**裁阶段与文档 —— 见工作流「任务分档与阶段裁剪」（T0–T5 矩阵）。

初始化后按实际需求删除或改造目录。

| 项目类型 | 删除 | 保留 | 改造 |
|----------|------|------|------|
| 纯 CLI 库 | `src/gui/`、`docs/screenshots/` | core + cli + tests | workflow 删除 UI 实机约束 |
| 纯 Web 应用 | `src/cli/`（如无 CLI） | core + 前端目录 | 将 `src/gui/` 换为 `src/web/`；UI 约束改为浏览器实测 |
| 无 GUI | `src/gui/`、screenshots 相关 | 其余 | `quality.md` §5 删除 GUI 审核点 |
| 无 CLI | `src/cli/`、`tests/cli/` | core + gui | `package.json` 删除 cli bin |
| 小型脚本 | 可简化 P2/P3 | P0 + AGENTS 禁止事项 + 实现 | 跳过完整 DAG，保留六步循环 |

裁剪后更新：

- `README.md` 目录树
- `AGENTS.md` §4 架构图与 §10 文件索引
- `.cursor/workflow.md` P4 实现顺序占位

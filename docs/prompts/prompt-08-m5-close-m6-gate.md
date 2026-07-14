# Prompt 08 — M5 验收闭环与 M6 Free 门禁

> 日期：2026-07-14  
> 阶段：P4 实现 · M5 已验收 → M6 集成

## 用户意图

M5（MCP / 导出 / 更新）及后续 GUI 打磨（导出等待、跳转标脏、主题滚动、批注框 Tab 等）已人工验证通过；按迭代工作流进入 **M6 Phase A 集成与 Free 门禁**。

## AI 动作

1. 将 `docs/M5-acceptance-checklist.md` 标记为已验收；更新 `docs/README.md` 索引。
2. 产出 `docs/M6-acceptance-checklist.md`、`.project-setup/verification-report.md`。
3. M6-1：帮助对话框补齐导出 / MCP / Tab·Esc / 检查更新 / 重复行·缩进。
4. M6-2：同步 `quality.md`、截图清单待补项。
5. M6-3：`npm run build && npm test`（及可选 `dist:win`）。
6. 提交 M5 后 GUI 修复 + M6 文档；**等待用户 M6-5「Free 门禁通过」签字**，不得启动 M7。

## 待用户

- [ ] 实机扫一眼 F1 帮助表与菜单是否一致
- [ ] 回复 **「Free 门禁通过」**（或列出阻塞项）
- [ ] （可选）按 `docs/screenshots/README.md` 补 `10–17` 截图

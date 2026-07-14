# M6 Phase A 集成与 Free 门禁 — 验收清单

> 对应 P3 **M6-1～M6-5**；门禁通过前 **不得**启动 M7（Pro AI）。

```bash
npm run build && npm test
# 可选打包 smoke：
npm run dist:win
```

---

## M6-1～M6-4（准备项）

| ID | 检查 | 预期 |
|----|------|------|
| M6-1 | F1 帮助对话框 | 快捷键表含查找/跳转/导出相关说明；与菜单一致 |
| M6-2 | `AGENTS.md` / `quality.md` / `docs/screenshots/README.md` | 与 M2–M5 行为同步 |
| M6-3 | `npm test` + `npm run build`（及可选 `dist:win`） | 全绿；安装包可启动 |
| M6-4 | [`.project-setup/verification-report.md`](../.project-setup/verification-report.md) | Free 清单已勾选、遗留项已记录 |

---

## Free 可交付门禁（M6-5 · 👤）

对照 P0 Phase A / AC：

| 维度 | 验收要点 | 结论 |
|------|----------|------|
| F8 文件 | 欢迎页、最近文件、文件夹树、新建/另存为 | ☐ |
| F1/F2 编辑预览 | 同步滚动、大纲、查找替换、辅助快捷键、KaTeX | ☐ |
| F3 批注 | 段落级 + 选区级；orphan；dirty 禁用写 | ☐ |
| F6 MCP | Cursor 六 tools；scan ≈ CLI JSON | ☐ |
| 导出 / 更新 | HTML/PDF；检查更新（开发态提示） | ☐ |
| 质量 | `npm test` 全通过；无源文件保护回归 | ☐ |

**签字**：用户明确回复「Free 门禁通过」后记入 verification-report，方可进入 M7。

---

## 验收结论

- [ ] M6-1～M6-4 完成
- [ ] **M6-5 Free 可交付门禁** 用户确认

问题记录：

```
```

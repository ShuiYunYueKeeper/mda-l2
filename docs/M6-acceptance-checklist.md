# M6 Phase A 集成与 Free 门禁 — 验收清单

> 对应 P3 **M6-1～M6-5**。  
> **状态：✅ Free 门禁已通过**（用户确认 2026-07-15）

```bash
npm run build && npm test
# 可选打包 smoke：
npm run dist:win
```

---

## M6-1～M6-4（准备项）

| ID | 检查 | 预期 |
|----|------|------|
| M6-1 | F1 帮助对话框 | ✅ 快捷键表含查找/跳转/导出/MCP |
| M6-2 | `AGENTS.md` / `quality.md` / 截图清单 | ✅ 含点击定位同步规范 |
| M6-3 | `npm test` + `npm run build`（及可选 `dist:win`） | ✅ 117 全绿；打包见 verification-report |
| M6-4 | [`.project-setup/verification-report.md`](../.project-setup/verification-report.md) | ✅ |

---

## Free 可交付门禁（M6-5 · 👤）

| 维度 | 验收要点 | 结论 |
|------|----------|------|
| F8 文件 | 欢迎页、最近文件、文件夹树、新建/另存为 | ✅ |
| F1/F2 编辑预览 | 点击定位、大纲、查找替换、辅助快捷键、KaTeX | ✅ |
| F3 批注 | 段落级 + 选区级；orphan；dirty 禁用写 | ✅ |
| F6 MCP | Cursor 六 tools；scan ≈ CLI JSON | ✅ |
| 导出 / 更新 | HTML/PDF；检查更新（开发态提示） | ✅ |
| 质量 | `npm test` 全通过；无源文件保护回归 | ✅ |

**签字**：用户于 **2026-07-15** 明确回复「Free 门禁通过」。

---

## 验收结论

- [x] M6-1～M6-4 完成
- [x] **M6-5 Free 可交付门禁** 用户确认

问题记录：

```
非阻塞：截图 10–17 待补；发版前配置 build.publish.url；Ctrl+B 菜单/粗体场景共用说明已写入帮助。
```

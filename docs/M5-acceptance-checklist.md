# M5 MCP / 导出 / 自动更新 — 验收清单

> 对应 P3 **M5-2 / M5-3 / M5-4 / M5-5**；需求见 [`P0-requirements-v2-commercial.md`](P0-requirements-v2-commercial.md) AC-7、PV-8。

```bash
npm run build && npm test
```

---

## AC-7（MCP）

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 配置 Cursor MCP（见 README）并启动 `mda-mcp` | 六 tools 可见 |
| 2 | `mda_scan` 扫描 `samples/demo.md` | JSON 与 `mda-cli scan --format json` 一致 |
| 3 | `mda_add` / `mda_edit` / `mda_remove` | 与 CLI 行为一致，路径限制在工作区内 |
| 4 | `mda_read_file` | 返回 `{ content, scanResult }` |
| 5 | `mda_export_review_prompt` | 返回含批注摘要的 `prompt` 字符串 |

---

## 导出 HTML / PDF

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 打开含图/Mermaid 的 md，菜单「文件 → 导出 HTML」 | 生成单文件 HTML，图片内嵌 |
| 2 | 菜单「文件 → 导出 PDF」 | 生成 PDF，版式与预览接近 |

---

## 自动更新

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 打包版菜单「帮助 → 检查更新」 | 可触发检查（无 Release 时提示已最新或配置错误） |
| 2 | 开发模式 `npm run gui` | 提示开发模式不可用 |

---

## 自动化

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | `npm test` | 含 `tests/mcp/handlers.test.ts` 全通过 |

---

## 验收结论

- [ ] AC-7 通过
- [ ] 导出 HTML/PDF 通过
- [ ] 自动更新通过

问题记录：

```
```

# scripts — 构建与校验脚本

| 脚本 | 用途 |
|------|------|
| `copy-gui.js` | 将 GUI 静态资源拷贝到 `dist/gui/` |
| `ensure-no-bom.js` | 构建前检查关键 JSON 无 UTF-8 BOM |
| `pre-dist.js` | 发布前校验（可选） |
| `verify-release.js` | 发布物完整性检查（可选） |

按项目需要增删；复杂逻辑须有对应测试或文档说明。

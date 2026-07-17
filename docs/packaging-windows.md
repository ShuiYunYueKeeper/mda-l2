# Windows 打包说明：签名 · 语言 · 自动更新

## 1. 数字签名为空

「属性 → 数字签名」为空是因为 **当前未配置 Authenticode 代码签名证书**。  
没有证书时 electron-builder **无法**凭空写入签名；这与开源/自用分发常见情况一致。

若需签名（减少 SmartScreen 拦截）：

1. 购买代码签名证书（OV/EV），导出为 `.pfx`
2. 构建前设置环境变量后执行 `npm run dist:win`：

```bat
set CSC_LINK=C:\path\to\cert.pfx
set CSC_KEY_PASSWORD=your-password
npm run dist:win
```

或仅用主题名（证书已导入本机证书库）：

```json
"win": { "certificateSubjectName": "Your Company Name" }
```

未签名时应用已设置 `verifyUpdateCodeSignature: false`，避免「无签名包无法更新」。

---

## 2. 中英文与系统语言

| 层面 | 行为 |
|------|------|
| 界面语言切换 | **视图 → 界面语言**：跟随系统 / 中文 / English；写入用户目录，立即刷新菜单与 UI |
| 默认 | 跟随系统（`zh*` → 中文，其余 → English）；可用 `MDA_LANG=zh\|en` 强制 |
| 文案维护 | `src/gui/main/i18n.js` + `src/gui/renderer/i18n.js`；**新功能必须同时加 zh/en**（见 AGENTS.md §6） |
| Chromium 语言包 | 仅打包 `zh-CN`、`en-US`（`electronLanguages`） |
| NSIS 安装包 | 中英多语言，按系统语言默认 |

「属性 → 详细信息 → 语言」为 PE 版本资源的 LANGID，常为英语(美国)，**不等于**运行中界面语言。

---

## 3. 检查更新与 `latest.yml`

报错 `Cannot find latest.yml` / HTTP 404 表示：对应 GitHub Release **没有**上传 electron-builder 生成的更新清单与安装包。

正确发版（需 `GH_TOKEN`，权限含 `repo`）：

```bat
set GH_TOKEN=ghp_xxxx
npm run dist:win -- --publish always
```

发布后 Release 资产中应可见例如：

- `MDA-2.0.0-alpha-win-x64.exe`（或 nsis 名）
- `latest.yml`（稳定通道）或 `alpha.yml`（预发布通道）

仅上传源码 zip、手工拖 exe 而未带 `*.yml`，检查更新会失败。  
应用侧已改为友好提示，不再弹出整段 HTTP 堆栈。

`build.publish.releaseType` 对 alpha 已设为 `prerelease`；运行时 `allowPrerelease` 在版本号含 alpha/beta/rc 时自动开启。

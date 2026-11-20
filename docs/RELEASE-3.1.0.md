# MDA 3.1.0 — 发版说明

> **Tag**：`v3.1.0`  
> **日期**：2026-11-20  
> **定位**：完全免费版（移除全部 AI 与 Pro 入口）+ 原生 HTML 块渲染  
> **上一 tag**：`v3.0.0`

---

## 相对 3.0.0 的主要变化

| 变化 | 说明 |
|------|------|
| 完全免费 | 3.1.0 起不含任何 AI 功能，也没有 Pro 层级、激活码与内购。所有能力（打开 / 预览 / 编辑 / 批注 / 导出 / MCP）直接可用 |
| 入口清理 | 菜单、工具栏、块手柄菜单、右键菜单与设置面板里都不再出现 AI / Pro 项；`window.mdaAPI` 上相关桥接与主进程 IPC 一并关闭，devtools 也调不到 |
| 原生 HTML 块 | README 风格的居中头部、徽章、`<details>` 折叠区渲染成卡片；白名单清洗，脚本/内联事件/危险协议一律剔除 |
| HTML 块可插入 | 工具栏「插入」、空白行「+」或按 `/` 都能新建 HTML 块，落点直接进源码态 |
| HTML 块源码态 | 可拖选、`Ctrl+A` 只框选源码、右键复制/剪切可用、粘贴只取纯文本；双击块内不再误切源码态 |
| 复制为图片 | 视口内用实时截图；超出视口时内联样式 + 把卡内图片内联成位图，展开的 `<details>` 与含图卡片也能完整导出 |

## 本 tag 含近期修复（摘录）

- HTML 块不再吞掉紧贴其后的文字与代码块（CommonMark 的 HTML 块要到空行才结束，此前整段被卡片吃进去）
- 文末没有换行时，在卡片下方插入代码块/表格不再粘在上一行
- `data-mda-block-source` 属性里的裸 `<` 曾让导出 SVG 解析失败，已改为 XML 序列化
- 空白行占位文案不再提示「双击 Ctrl 唤起 AI」

## 安装方式

| 文件 | 用途 |
|------|------|
| `MDA-3.1.0-win-x64.exe` | Windows 安装包（NSIS，可自选目录） |
| `MDA-3.1.0-portable-win-x64.exe` | 便携版，双击即用 |
| `MDA-3.1.0-win-x64.zip` | 解压即用 |
| `latest.yml` | 应用内检查更新的清单，必须与安装包一起上传 |

macOS / Linux 包按其系统打包后另行上传，文件名规则为 `MDA-<版本>-<系统>-<架构>.<ext>`。

## 校验

SHA256：

```
8106E66DDD40B82AEEC737D0D4658D4D4117854B777D9FFFC99CB908A269CDF3  MDA-3.1.0-win-x64.exe
3A2520FBE109F39D510D858B84D55C368C3FD758F09A0C7E8EAB3C57E404F9D7  MDA-3.1.0-win-x64.exe.blockmap
40157D3036493051368FA80A1AC2BCE87B8CE32C30D8BD22525B390643059273  MDA-3.1.0-portable-win-x64.exe
2C24A4DD1E6E71879A37CAD8113AFF18BDB1AB62FA21150C8EAAE7661B6D0559  MDA-3.1.0-win-x64.zip
```

- [x] `npx jest --silent`：90 suites / 745 用例全 PASS
- [x] `toolbar` e2e 断言无 AI 按钮；全量 e2e 76 passed
- [x] `package.json` version = `3.1.0`，`build.publish.releaseType` = `release`
- [x] `release/latest.yml` 已生成，指向 `MDA-3.1.0-win-x64.exe`

## 已知问题

- 两个行内定界符 e2e 用例（`E-INL-5`、`E-CELL-8`：取消样式后连续输入两次，工具栏 `aria-pressed` 未弹回）在 3.0.0 的构建上同样失败，属既有缺陷，本次未处理。
- Windows 安装包未做代码签名，SmartScreen 可能提示未知发布者；商店 MSIX 由微软在认证后重新签名。

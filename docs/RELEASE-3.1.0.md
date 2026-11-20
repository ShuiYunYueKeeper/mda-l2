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
96527A468546B69CF729AC1BEB0D9B9C1ED893C5190898596EB4E289E3E522CB  MDA-3.1.0-win-x64.exe
AA450473A154BFD57B5E9B05F82BCE2721CFDCE05CC12688770656933CE9A6EE  MDA-3.1.0-win-x64.exe.blockmap
2EEDC13F4F3F795FA8669D5C636EA41005F2BD5C9E59BE62A009F91C92B189BE  MDA-3.1.0-portable-win-x64.exe
32A0B35A7AE0DF72D8BA9AF43D73158558E2DC0582BDFCA84B13564A3C9AF517  MDA-3.1.0-win-x64.zip
```
安装包体积（`mermaid` 从运行时依赖改为构建期依赖后）：安装包 77.5 MB、便携版 110.6 MB、zip 106.8 MB；商店 appx 114.1 MB（未签名，SHA256 `B550B513D5CEE4184D1FDF0B9E9C9CCE0AF64E6F83412032802CBD4B228BAA95`）。

- [x] `npx jest --silent`：90 suites / 745 用例全 PASS
- [x] `toolbar` e2e 断言无 AI 按钮；全量 e2e 76 passed
- [x] `package.json` version = `3.1.0`，`build.publish.releaseType` = `release`
- [x] `release/latest.yml` 已生成，指向 `MDA-3.1.0-win-x64.exe`

## 已知问题

- 两个行内定界符 e2e 用例（`E-INL-5`、`E-CELL-8`：取消样式后连续输入两次，工具栏 `aria-pressed` 未弹回）在 3.0.0 的构建上同样失败，属既有缺陷，本次未处理。
- Windows 安装包未做代码签名，SmartScreen 可能提示未知发布者；商店 MSIX 由微软在认证后重新签名。

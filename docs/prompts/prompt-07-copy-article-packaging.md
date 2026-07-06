# Prompt 07 — 复制预览到公众号、扩展名外置与 Electron 打包

> 接续 `prompt-05-p4-implementation.md` / `prompt-06-renderer-sub-item-linebreak.md`

---

## Prompt 23: 复制预览到微信公众号（不含知乎）

```
用户: 预览内容需要能复制到微信公众号，Mermaid 要转成图片；不要知乎复制；复制时不能闪烁
```

AI 动作：

- 菜单「复制预览（微信公众号）」+ `Ctrl+Shift+C`；克隆预览 DOM → Mermaid 转 base64 PNG → 本地图内嵌 → 内联样式 → `copyArticleHtml(html, text)`。
- Mermaid：视口内 `capturePageRect`，否则 SVG→PNG；**不滚动**预览。
- 剪贴板仅 `clipboard.write({ html, text })`；**禁止** `writeBuffer` 覆盖 HTML。
- **已明确不做**：知乎复制、预览区悬浮按钮、图片导出临时目录。

---

## Prompt 24: Markdown 扩展名外置 + scan 目录识别

```
用户: GUI 与 CLI scan 应统一支持 .md / .markdown / .txt / .mdc
```

AI 动作：`fileExtensions` 配置 + `isMarkdownPath`；CLI scan -r 与 GUI 打开/拖拽一致。

---

## Prompt 25: Electron 打包分发

```
用户: 打成 Windows 安装包/便携版分发
```

AI 动作：`electron-builder`、`dist:*` 脚本、`ensure-no-bom.js`、单实例锁、Windows 崩溃缓解。

---

## 验证

| 项 | 结果 |
|----|------|
| `npm test` | 79 用例通过 |
| GUI 实机 | 公众号复制无闪烁（知乎路径不存在） |

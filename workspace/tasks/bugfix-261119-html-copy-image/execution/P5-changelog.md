# P5 Changelog — HTML 块「复制为图片」导出完整卡片

> 档位：T1（导出链两处缺陷：XML 解析失败、保真度不足）
> 需求：用户「html块小手柄复制为图片失败」。

## 根因

- **`复制失败: formula export failed`**：通用导出把 `clone.outerHTML` 直接拼进
  `<foreignObject>`，而 HTML 序列化器**不转义属性值里的 `<`**（HTML5 允许、XML 禁止）。HTML 块把整段
  源码存在 `data-mda-block-source="<div align=…>"`，注入后整段 SVG 解析失败 → `img.onerror`。
- **只截到标题**：`findCm6BlockElement` 没有 `html` 映射，回退选择器命中的是整行根节点；且通用导出
  不内联应用 CSS，卡片排版/字号/图片必然失真。

## 方案

- 清属性：`dropMarkupCarryingAttrs(root)` 遍历克隆树，删掉 `data-mda-block-source` 与任何值含 `<`
  的属性；导出前另外剥掉源码面板（`.mda-cm-html-source`）。
- 映射：`findCm6BlockElement` 加
  `html: '.mda-cm-html-block[data-mda-block-from="<from>"] .mda-cm-html-frame'`，导出卡片本体。
- 专用导出 `exportHtmlBlockToPng(frameEl)`：整张卡完整落在视口内就走 `capturePageRegion` 实时截图；
  超视口则克隆 + `inlineComputedStylesDeep` 逐节点内联 computed style 后走
  `exportMeasuredHtmlToPng`（**先内联样式再 strip**，顺序反了会因结构错位把样式贴到错节点，表现为
  正文被压成一字一行）。
- 回退路径保留顶栏（`stripHtmlBlockExportChrome` 只剥拖拽手柄/源码面板/类型图标），与实时截图那条路
  观感一致。

## 文件

- `src/gui/renderer/app.js`：`exportHtmlBlockToPng`、`inlineComputedStylesDeep`、`EXPORT_INLINE_PROPS`、
  `dropMarkupCarryingAttrs`、`stripHtmlBlockExportChrome`、`findCm6BlockElement` 的 html 映射、
  `copyCm6BlockAsImage` 的 html 分支
- `tests/e2e/gui/html-block.spec.ts`：手柄 → 复制为 → 复制为图片 → 无报错弹窗 + toast「已复制图片」
- `AGENTS.md`：§9 4b3 追加 ⑧（两条导出路径与三个坑）

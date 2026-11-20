# P4 迭代记录 — HTML 块「复制为图片」导出完整卡片

> 日期：2026-11-19  
> 档位：T1  
> 用户实机：✅ 已验证（用户指示整理入库）

## 需求

用户「html块小手柄复制为图片失败」。

## 方案

- 失败信息 `formula export failed` 来自 SVG 栅格化的 `img.onerror`，根因是 HTML 序列化器不转义属性值
  里的 `<`（HTML5 允许、XML 禁止）：本 widget 把源码存在 `data-mda-block-source="<div …>"`，
  拼进 `<foreignObject>` 后整段 XML 解析失败。→ 克隆树里删掉 `data-mda-block-source` 与任何值含 `<`
  的属性（`dropMarkupCarryingAttrs`）。
- 只截到标题：`findCm6BlockElement` 缺 `html` 映射，命中整行根节点；通用导出也不内联应用 CSS。→
  补映射到 `.mda-cm-html-frame`，并新增专用导出 `exportHtmlBlockToPng`：
  视口内走 `capturePageRegion` 实时截图，超视口则「先内联 computed style、再 strip、后测量」，最后
  `exportMeasuredHtmlToPng`。
- 回退路径保留顶栏（只剥拖拽手柄 / 源码面板 / 类型图标），与实时截图路径观感一致。

## 改动

- `src/gui/renderer/app.js`：`exportHtmlBlockToPng`、`inlineComputedStylesDeep`、`EXPORT_INLINE_PROPS`、
  `dropMarkupCarryingAttrs`、`stripHtmlBlockExportChrome`、`findCm6BlockElement`、`copyCm6BlockAsImage`
- 测试：`tests/e2e/gui/html-block.spec.ts` 增「块手柄复制为图片」用例

## 测试

- `npm test`：90 suites / 743 tests 通过
- `npx playwright test tests/e2e/gui/html-block.spec.ts`：11/11；与 3 个 spec 合跑：18 passed
- 真机导出：小卡片 1538×314、README 头部 1538×1042、超视口长卡 1536×3300（20 节完整）

## 沉淀

- `AGENTS.md` §9 4b3 追加 ⑧：两条导出路径与三个坑（内联样式须在 strip 之前；回退保留顶栏；
  含裸 `<` 的属性会让 SVG 解析失败）。

## 遗留

- 待补导出图截图（见任务 P6 清单）。

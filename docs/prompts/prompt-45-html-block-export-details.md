# P4 迭代记录 — HTML 块展开 details 后「复制为图片」失败

> 日期：2026-11-20  
> 档位：T1  
> 用户实机：✅ 已验证（用户指示整理入库）

## 需求

用户「html块，展开后复制为图片失败」。

## 方案

- `formula export failed` 来自 `svgPayloadToPng` 的 `img.onerror`。卡片高过视口时走「克隆 + 内联样式」
  回退导出，克隆用 `outerHTML` 序列化——HTML 序列化器把 `<img>`/`<br>` 这类空元素写成**未自闭合标签**，
  这在 HTML 合法、在 XML 非法，拼进 `<foreignObject>` 后整段 SVG 解析失败。未展开 details 时卡里没有
  `<img>`，所以「不展开能复制、展开就失败」。→ 改用 `XMLSerializer().serializeToString`。
- SVG 以 `<img>` 方式加载时**不加载外部资源**，`file://`/`https://` 图在导出图里必是空白。→
  `inlineCloneImages` 按索引对齐 live/clone 的 `<img>`，依次尝试 canvas 取像素 → 本地读盘
  （`readFileAsDataUrl`）→ 远程 `fetch`，成功后把 `src` 换成 data URL，并摘掉 `srcset`/`loading`。
- 高度改用 `measureOffscreenBlock(clone)` 与 live rect 的较大值，刚展开的 `<details>` 不再被裁底。

## 改动

- `src/gui/renderer/app.js`：`serializeMarkupForSvg`、`inlineCloneImages`、`fetchImageAsDataUrl`、
  `exportHtmlBlockToPng` 回退分支
- `src/gui/renderer/index.html`：CSP 增 `connect-src 'self' https:`
- 测试：`tests/e2e/gui/html-block.spec.ts` 抽出 `copyBlockAsImage` 助手，新增「高过视口的卡片（走回退
  导出）带图片也能复制为图片」

## 测试

- `npm test`：90 suites / 745 tests 通过
- `npx playwright test tests/e2e/gui/html-block.spec.ts`：14/14（29.0s）
- 真机导出：README details 卡展开后 2766px 高，导出 1536×5534，9 张截图全部完整
- 真机 UI：手柄 → 复制为 → 复制为图片 → toast「已复制图片」，无报错弹窗

## 沉淀

- `AGENTS.md` §9 4b3 追加 ⑩：回退导出必须 XHTML 化（`XMLSerializer` 序列化 + 图片内联成 data URL，
  远程图需 CSP `connect-src https:`），高度取离屏实测与 live rect 的较大值。

## 遗留

- 待补导出图截图（见任务 P6 清单）。
- 远程图片的 `fetch` 依赖网络与目标站点 CORS；失败时该图在导出图里仍是空白（不报错）。

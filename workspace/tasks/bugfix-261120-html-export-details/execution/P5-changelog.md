# P5 Changelog — HTML 块展开 details 后「复制为图片」失败

> 档位：T1（回退导出路径：XML 序列化 + 图片内联）
> 需求：用户「html块，展开后复制为图片失败」。

## 根因

- **`复制失败: formula export failed`**：卡片高过视口时走「克隆 + 内联样式」回退导出，克隆用
  `outerHTML` 序列化后拼进 SVG 的 `<foreignObject>`。HTML 序列化器把 `<img>`、`<br>` 这类空元素写成
  **未自闭合标签**（XML 非法），整段 SVG 解析失败 → `svgPayloadToPng` 的 `img.onerror`。
  `<details>` 展开后卡里出现 README 截图（`<img>`），因此「未展开能复制、展开就失败」。
- **图片必然空白**：SVG 以 `<img>` 方式加载时**不加载外部资源**，`file://` / `https://` 图在导出图里
  全是空框，即使解析成功也只是半张图。
- **可能裁底**：回退高度取的是导出瞬间的 live rect，刚展开 `<details>` 时可能仍是旧高度。

## 方案

- 序列化改 `new XMLSerializer().serializeToString(clone)`（`serializeMarkupForSvg`）：空元素自闭合、
  属性按 XML 规则转义，含 `<`/换行的属性值也不会再破坏解析。
- 新增 `inlineCloneImages(liveRoot, cloneRoot)`：按索引对齐 live/clone 的 `<img>`，依次尝试
  canvas 取像素（`imgElementToDataUrl`，跨域变脏会抛错）→ 本地读盘（`fileUrlToPath` +
  `api.readFileAsDataUrl`）→ 远程 `fetchImageAsDataUrl`；同时摘掉 `srcset`/`loading`。
- 回退高度取 `measureOffscreenBlock(clone)` 与 live rect 的较大值，刚展开的 `<details>` 不再被裁底。
- CSP 增 `connect-src 'self' https:`（远程图 fetch 需要；`img-src` 此前已放行 `https:`）。

## 文件

- `src/gui/renderer/app.js`：`serializeMarkupForSvg`、`inlineCloneImages`、`fetchImageAsDataUrl`、
  `exportHtmlBlockToPng` 的回退分支（序列化 + 内联图片 + 高度实测）
- `src/gui/renderer/index.html`：CSP 增 `connect-src 'self' https:`
- `tests/e2e/gui/html-block.spec.ts`：抽出 `copyBlockAsImage` 助手；新增「高过视口的卡片（走回退导出）
  带图片也能复制为图片」（先断言卡片确实超出视口，确保覆盖回退分支）
- `AGENTS.md`：§9 4b3 追加 ⑩（两件 XHTML 化的事 + 高度实测）

## 验证要点

- 复现：README 的 details 卡展开后 645px → 2766px；修复前 `ok:false / formula export failed`，
  修复后导出 1536×5534，两张折叠区截图与全部正文都在。
- 真机 UI（手柄 → 复制为 → 复制为图片）：toast「已复制图片」、无报错弹窗。

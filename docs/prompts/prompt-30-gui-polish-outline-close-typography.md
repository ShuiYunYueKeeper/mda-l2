# P4 迭代记录 — 表格/大纲/滚动条/关闭/CM6 排版

> 日期：2026-08-04  
> 阶段：P4 / M8 GUI 打磨  
> 用户实机：✅ 已验证（大纲高亮「效果还行」；关闭卡顿与 Cursor 同类属环境现象）

## 本轮改动

| # | 需求 | 结论 |
|---|------|------|
| 1 | 表格默认全宽；`+` 列/行按钮移到列调整线头部（hover 蓝线时显示） | ✅ |
| 2 | 表格边框随列宽收缩；灰选中条与表格外框无间隙 | ✅ |
| 3 | 列调整蓝线与表格线重合（`getWrapContentOrigin`） | ✅ |
| 4 | 块拖动手柄指示蓝线：不穿过滚动条；落在目标块上方 | ✅ |
| 5 | 全局滚动条窄圆角胶囊（Chromium 去掉 `scrollbar-width` 对 `*` 的设置） | ✅ |
| 6 | CM6 大纲点击跳转 + 滚动高亮（`outline-scroll.js` / `outline-flash.js`） | ✅ 基本可用 |
| 7 | CM6 正文滚动条右侧 2px 间距 | ✅ |
| 8 | 关闭 MDA：先 hide、prefs 缓存、`app.exit(0)`；不手动 destroy CM6 | ✅ 窗口消失更快；退出后鼠标卡顿与 Cursor 同类 |
| 9 | CM6 标题/粗体/代码块字色加深（`--text-emphasis` + Cascadia Code） | ✅ |

## 实现要点

- **表格**：`table-resize.js` / `table-layout-width.js` — `syncTableWrapLayout` 计入 2px 边框；`rebuildHandles` 定位 `+` 按钮
- **块拖动**：`block-drag-handle.js` — `getDropLineBounds` / `getDropIndicatorTop` 钳制滚动条、指示线上方
- **大纲**：`outline-scroll.js` — 视口内最靠上标题优先 + `lineBlockAt`/DOM 混合；`pickOutlineActiveFromEntries`
- **关闭**：`main.js` `finishAppClose()`；`workspace-prefs.js` 内存缓存 + bounds 去重
- **排版**：`index.html` `--text-emphasis`；CM6 模拟加粗 `text-shadow` 加强；代码块 hljs token 略加深

## 测试

- `tests/gui/editor/outline-scroll.test.ts`（`headingAtOrBefore` / `pickOutlineActiveFromEntries`）
- `npm test -- tests/gui/editor`；`npm run build:editor`；`npm run build:gui`

## 文档

- `docs/M8-acceptance-checklist.md` 闸门行
- 本文件

## 遗留

- **SEL-1** 正文拖选仍 ❌ 阻塞总验收
- 大纲滚动高亮长文档边界可再调（用户已签收当前程度）
- **M8-D** 批注共存为下一阶段

## 待补截图（须用户实机）

| 建议文件名 | 拍摄要点 |
|------------|----------|
| `docs/screenshots/16-cm6-outline-scroll.png` | CM6 模式：滚动正文时大纲高亮与当前节对齐 |
| `docs/screenshots/17-table-resize-plus.png` | 表格 hover 列调整线 + 头部 `+` 按钮 |
| `docs/screenshots/18-global-scrollbar.png` | 全局窄圆角滚动条（浅色主题） |

入库后更新 `README.md`「界面截图与演示」引用。

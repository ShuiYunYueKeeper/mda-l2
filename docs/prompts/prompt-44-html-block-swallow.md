# P4 迭代记录 — HTML 块不再吞掉紧贴其后的文字与代码块

> 日期：2026-11-19  
> 档位：T1  
> 用户实机：✅ 已验证（用户指示整理入库）

## 需求

① 用户「在html块下面的粘贴文字或者插入其他块，会出现各种奇怪的现象：比如以文字形式插入到 html 块的
末尾；插入代码块后，代码块内部会有很多文字」；② 用户「补充说明在html块下面插入代码块」。

## 方案

- CommonMark 的 HTML 块要到**空行**才结束，紧贴 `</div>` 的下一行仍属同一个 `HTMLBlock`；而
  `htmlBlockRegion` 原本要求「深度归零且扫到语法树节点末尾」才收尾 → 该行被并进 region，整块被替换成
  卡片，文字就「钻进」卡片，代码围栏则被吃掉一半。
- 收尾判据改为「配平即收尾」，只有下一行又像 HTML 标签行才继续并入（`looksLikeHtmlLine`，
  `<https://…>` 自动链接不算）——GitHub 式 `<p>/<h1>/<p>` 逐行堆叠仍算同一张卡。
- 余下的尾行交给 `build-specs` 用 `tailParser()` 重新解析成正常节点（标题/段落/围栏都回来），
  `HTML_TAIL_MAX_CHARS=20000` 兜底；尾段不参与相邻块合并，合并只延长不缩短。
- 「下方插入」在文末没有换行时先补 `\n`，避免围栏粘成 `</div>``` `。

## 改动

- `src/gui/renderer/editor/model/html-block.js`、`model/build-specs.js`、`widgets/block-handle-ops.js`
- 测试：`tests/gui/editor/html-block.test.ts` 增 2 例、`tests/e2e/gui/html-block.spec.ts` 增 2 例

## 测试

- `npm test`：90 suites / 745 tests 通过
- `npx playwright test tests/e2e/gui/html-block.spec.ts`：13/13；与 3 个 spec 合跑：20 passed
- README 全篇回归：5 张卡 / 5 个 details / 泄漏 0；真机敲字与插入代码块均正常

## 沉淀

- `AGENTS.md` §9 4b3 追加 ⑨：区块收尾判据、尾行再解析、文末插入换行三层约束。

## 遗留

- 待补「卡片下方紧跟敲字 / 插入代码块」截图（见任务 P6 清单）。

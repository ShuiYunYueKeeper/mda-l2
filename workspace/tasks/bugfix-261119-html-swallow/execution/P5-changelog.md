# P5 Changelog — HTML 块不再吞掉紧贴其后的文字与代码块

> 档位：T1（三条同源缺陷：区块收尾判据、尾行归属、文末插入换行）
> 需求：① 用户「在html块下面的粘贴文字或者插入其他块，会出现各种奇怪的现象：比如以文字形式插入到
> html块的末尾；插入代码块后，代码块内部会有很多文字」；② 用户「补充说明在html块下面插入代码块」。

## 根因

- CommonMark 的 HTML 块要到**空行**才结束，所以紧贴 `</div>` 的下一行仍属于同一个 `HTMLBlock` 节点。
- `htmlBlockRegion` 原本要求「深度归零**且**扫到语法树节点末尾」才收尾 → 这一行被并进 region，
  整块替换成卡片后，文字跑进卡片、代码围栏被吃掉一半（围栏首行进了卡片、闭合围栏丢失）。
- 「下方插入」在文末（文档末尾没有换行）时没有补前导 `\n`，围栏直接粘成 `</div>``` `，
  同样落进上一块的节点范围。

## 方案

- `htmlBlockRegion` 改为**配平即收尾**；只有「下一行又像 HTML 标签行」才继续并入
  （`looksLikeHtmlLine`，`<https://…>` 自动链接不算）——GitHub 式 `<p>/<h1>/<p>` 逐行堆叠、行间无
  空行仍算同一张卡。
- `collectSyntaxNodes` 把「region 结束 → 语法节点末尾」的尾行用 `tailParser()` 重新解析成正常节点
  （标题、段落、围栏都回来了），`HTML_TAIL_MAX_CHARS=20000` 兜底；尾段不参与「只隔空行就合并」，
  合并时只允许延长上一块，避免 `from > to` 的非法区间。
- `insertSnippetNearBlock` / `insertMarkdownNearBlock` 的 below 插入：文末没有换行时先补 `\n`。

## 文件

- `src/gui/renderer/editor/model/html-block.js`：`looksLikeHtmlLine`、配平即收尾
- `src/gui/renderer/editor/model/build-specs.js`：`tailParser()`、尾段再解析、合并保护
- `src/gui/renderer/editor/widgets/block-handle-ops.js`：文末插入补前导换行
- `tests/gui/editor/html-block.test.ts`：紧贴文字 / 紧贴围栏两个用例
- `tests/e2e/gui/html-block.spec.ts`：吞内容回归、文末插入不粘行
- `AGENTS.md`：§9 4b3 追加 ⑨（三层约束）

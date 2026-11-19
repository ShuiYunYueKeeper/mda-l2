/**
 * 原生 HTML 块（Lezer `HTMLBlock`）的区域计算。
 *
 * 为什么不能直接用语法树区间：CommonMark 的 HTML 块在第 6/7 型遇到空行就结束，而 README 常见
 * `<details>` + 空行 + Markdown 正文 + `</details>` 这种写法——GitHub 是浏览器把后续内容自动嵌进
 * 未闭合标签后渲染的观感。若只替换语法树那一段，`<details>` 会在空行处被截断，正文漏在 widget 外面。
 * 故这里沿行扫描标签深度：容器标签未闭合就继续吞行，深度归零即收尾。
 */
'use strict';

const { buildCodeFenceMask } = require('./parse-math');

/** 容器型标签：未闭合时需要把后续行纳入同一块 */
const CONTAINER_TAGS = {
  article: 1,
  aside: 1,
  blockquote: 1,
  caption: 1,
  center: 1,
  dd: 1,
  details: 1,
  div: 1,
  dl: 1,
  dt: 1,
  figcaption: 1,
  figure: 1,
  footer: 1,
  h1: 1,
  h2: 1,
  h3: 1,
  h4: 1,
  h5: 1,
  h6: 1,
  header: 1,
  li: 1,
  main: 1,
  nav: 1,
  ol: 1,
  p: 1,
  picture: 1,
  pre: 1,
  section: 1,
  summary: 1,
  table: 1,
  tbody: 1,
  td: 1,
  tfoot: 1,
  th: 1,
  thead: 1,
  tr: 1,
  ul: 1,
};

const VOID_TAGS = {
  area: 1,
  base: 1,
  br: 1,
  col: 1,
  embed: 1,
  hr: 1,
  img: 1,
  input: 1,
  link: 1,
  meta: 1,
  param: 1,
  source: 1,
  track: 1,
  wbr: 1,
};

/** 与 core/html.ts 的扫描口径一致：注释与指令整体跳过 */
const TAG_RE =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

/** 单个 HTML 块最多吞这么多行：无闭合标签的脏文档不能让整篇被一个 widget 吃掉 */
const MAX_EXTEND_LINES = 400;

/**
 * 这一行是不是「又一个 HTML 标签行」（GitHub 风格头部是 `<p>` / `<h1>` / `<p>` 逐行堆叠，
 * 行间没有空行，必须并进同一张卡片）。
 * 排除 `<https://…>` 这类自动链接：它们看着像标签，其实是正文。
 * @param {string} trimmed
 * @returns {boolean}
 */
function looksLikeHtmlLine(trimmed) {
  if (trimmed.charAt(0) !== '<') return false;
  if (/^<[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  return /^<\/?[a-zA-Z!?]/.test(trimmed);
}

/**
 * @param {string} text
 * @returns {number[]}
 */
function lineStartsOf(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * @param {number[]} starts
 * @param {number} pos
 * @returns {number}
 */
function lineIndexOf(starts, pos) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * 一行内容器标签的深度变化；围栏内的行不算（代码样例里的 `<div>` 不代表真实嵌套）。
 * @param {string} line
 * @returns {number}
 */
function depthDeltaOfLine(line) {
  if (line.indexOf('<') < 0) return 0;
  let delta = 0;
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(line))) {
    if (m[1] == null) continue;
    const name = m[1].toLowerCase();
    if (!CONTAINER_TAGS[name] || VOID_TAGS[name]) continue;
    if (m[0].charAt(1) === '/') delta -= 1;
    else if (m[3] !== '/') delta += 1;
  }
  return delta;
}

/**
 * 计算 HTML 块的整块区间（贴齐行首 → 闭合行行尾，含换行）。
 * @param {string} text 全文
 * @param {number} from 语法树节点起点
 * @param {number} to 语法树节点终点
 * @returns {{ from: number, to: number, extended: boolean }}
 */
function htmlBlockRegion(text, from, to) {
  const src = text == null ? '' : String(text);
  const len = src.length;
  const start = Math.max(0, Math.min(from, len));
  const nodeEnd = Math.max(start, Math.min(to, len));
  const starts = lineStartsOf(src);
  const lines = src.split('\n');
  const startLine = lineIndexOf(starts, start);
  const mask = buildCodeFenceMask(lines);

  let depth = 0;
  let end = -1;
  let extended = false;
  const limit = Math.min(lines.length, startLine + MAX_EXTEND_LINES);

  for (let li = startLine; li < limit; li++) {
    const line = lines[li];
    const trimmed = line.trim();
    // 标签已配平后，只有「下一行又是一个 HTML 标签行」才继续并入（GitHub 风格头部是
    // `<p>`/`<h1>`/`<p>` 逐行堆叠、行间没有空行）。若这行是正文/标题/围栏等非 HTML 内容，
    // 说明用户紧贴卡片写了东西（CommonMark 的 HTML 块要到空行才结束，语法树仍把它算进
    // 这个 HTMLBlock），此时必须收尾 —— 否则这些内容会被卡片吞掉（文字跑到卡片末尾、
    // 插入的代码块被吃掉）。尾行交给 build-specs 重新解析成正常块。
    if (li > startLine && depth <= 0 && !looksLikeHtmlLine(trimmed)) break;
    let lineEnd = starts[li] + line.length;
    if (li < lines.length - 1) lineEnd += 1;
    if (!mask[li]) depth += depthDeltaOfLine(line);
    end = lineEnd;
  }

  // 未在限内闭合（作者漏写闭合标签）：退回只覆盖语法树那一块，避免整篇被吞
  if (end < 0 || depth > 0) {
    const nodeLine = lineIndexOf(starts, Math.max(start, nodeEnd - 1));
    let lineEnd = starts[nodeLine] + lines[nodeLine].length;
    if (nodeLine < lines.length - 1) lineEnd += 1;
    return { from: start, to: Math.min(lineEnd, len), extended: false };
  }
  if (end > nodeEnd) extended = true;
  return { from: start, to: Math.min(end, len), extended: extended };
}

/**
 * 该行是否落在某个 HTML 块区间内（供 blockKind 判定）。
 * @param {string} text
 * @param {number} from
 * @param {number} to
 * @returns {boolean}
 */
function isHtmlBlockRange(text, from, to) {
  const src = text == null ? '' : String(text);
  return /^\s*<[a-zA-Z!/]/.test(src.slice(from, Math.min(to, src.length)));
}

module.exports = {
  htmlBlockRegion: htmlBlockRegion,
  isHtmlBlockRange: isHtmlBlockRange,
  CONTAINER_TAGS: CONTAINER_TAGS,
  MAX_EXTEND_LINES: MAX_EXTEND_LINES,
  depthDeltaOfLine: depthDeltaOfLine,
};

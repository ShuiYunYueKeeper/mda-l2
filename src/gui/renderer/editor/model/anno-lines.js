/**
 * S24/S25：围栏外批注行隐藏区间（纯函数）。
 * 与 preload ANNO_ISH / core ANNO_REGEX 语义对齐；围栏内不隐藏。
 */
'use strict';

const ANNO_STRICT = /^\[comment\]:\s*<>\s*\(@anno\s+(\{.+?\})\)\s*$/;
const ANNO_ISH = /^\s{0,3}\[?\s*comment\s*\]?\s*:\s*<>\s*\(\s*@anno\b/;

/**
 * @param {string[]} lines
 * @returns {boolean[]}
 */
function buildFenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let fenceChar = null;
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceChar === null) {
      if (open) {
        fenceChar = open[1][0];
        fenceLen = open[1].length;
        mask[i] = true;
      }
    } else {
      mask[i] = true;
      const close = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        fenceChar = null;
        fenceLen = 0;
      }
    }
  }
  return mask;
}

/**
 * @param {string} text
 * @returns {{ from: number, to: number, malformed?: boolean }[]}
 */
function findAnnotationHideRanges(text) {
  if (!text) return [];
  const rows = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charAt(i) === '\n') {
      let contentEnd = i;
      if (contentEnd > lineStart && text.charAt(contentEnd - 1) === '\r') {
        contentEnd -= 1;
      }
      rows.push({
        text: text.slice(lineStart, contentEnd),
        from: lineStart,
        to: i < text.length ? i + 1 : Math.max(i, lineStart),
      });
      lineStart = i + 1;
    }
  }

  const mask = buildFenceMask(
    rows.map(function (r) {
      return r.text;
    })
  );
  const ranges = [];
  for (let i = 0; i < rows.length; i++) {
    if (mask[i]) continue;
    const line = rows[i].text;
    if (!line || !ANNO_ISH.test(line)) continue;
    ranges.push({
      from: rows[i].from,
      to: Math.max(rows[i].to, rows[i].from + line.length),
      malformed: !ANNO_STRICT.test(line),
    });
  }
  return ranges;
}

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * 围栏外 HTML 注释隐藏区间。整行注释走 hide-line，行内片段走 hide-mark。
 * @param {string} text
 * @returns {{ from: number, to: number, kind: 'line' | 'mark' }[]}
 */
function findHtmlCommentHideRanges(text) {
  if (!text) return [];
  const rows = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charAt(i) === '\n') {
      rows.push({ from: lineStart, to: i < text.length ? i + 1 : Math.max(i, lineStart) });
      lineStart = i + 1;
    }
  }
  const mask = buildFenceMask(
    rows.map(function (r) {
      return text.slice(r.from, r.to).replace(/\r?\n$/, '');
    })
  );
  const ranges = [];
  HTML_COMMENT_RE.lastIndex = 0;
  let m;
  while ((m = HTML_COMMENT_RE.exec(text))) {
    const from = m.index;
    const to = from + m[0].length;
    let lineIdx = 0;
    for (let r = rows.length - 1; r >= 0; r--) {
      if (from >= rows[r].from) {
        lineIdx = r;
        break;
      }
    }
    if (mask[lineIdx]) continue;
    const startRow = rows[lineIdx];
    let endRow = startRow;
    for (let r = lineIdx; r < rows.length; r++) {
      if (to <= rows[r].to || r === rows.length - 1) {
        endRow = rows[r];
        break;
      }
    }
    const before = text.slice(startRow.from, from);
    const after = text.slice(to, endRow.to).replace(/\r?\n$/, '');
    if (!before.trim() && !after.trim()) {
      ranges.push({ from: startRow.from, to: endRow.to, kind: 'line' });
    } else {
      ranges.push({ from: from, to: to, kind: 'mark' });
    }
  }
  return ranges;
}

module.exports = {
  findAnnotationHideRanges: findAnnotationHideRanges,
  findHtmlCommentHideRanges: findHtmlCommentHideRanges,
  buildFenceMask: buildFenceMask,
  ANNO_STRICT: ANNO_STRICT,
  ANNO_ISH: ANNO_ISH,
};

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

module.exports = {
  findAnnotationHideRanges: findAnnotationHideRanges,
  buildFenceMask: buildFenceMask,
  ANNO_STRICT: ANNO_STRICT,
  ANNO_ISH: ANNO_ISH,
};

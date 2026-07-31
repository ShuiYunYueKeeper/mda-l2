/**
 * 围栏代码块切片解析
 */
'use strict';

/**
 * @param {string} text
 * @param {number} from
 * @param {number} to
 * @param {number} len
 */
function alignHintLineRange(text, from, to, len) {
  let start = Math.max(0, Math.min(from, len));
  while (start > 0 && text.charAt(start - 1) !== '\n') start -= 1;
  let end = Math.max(start, Math.min(to, len));
  while (end < len && text.charAt(end) !== '\n') end += 1;
  if (end < len) end += 1;
  return { from: start, to: end };
}

/**
 * 围栏块区间：不信任语法树偏大的 to，按开/闭围栏行定位。
 * @param {string} text
 * @param {number} from
 * @param {number} to
 */
function expandFenceBlockRange(text, from, to) {
  const len = text.length;
  let start = Math.max(0, Math.min(from, len));
  while (start > 0 && text.charAt(start - 1) !== '\n') start -= 1;

  let openFrom = -1;
  /** @type {string} */
  let marker = '';
  let pos = start;
  while (pos < len) {
    const lineFrom = pos;
    const nl = text.indexOf('\n', lineFrom);
    const lineTo = nl < 0 ? len : nl;
    const line = text.slice(lineFrom, lineTo);
    const m = /^ {0,3}(`{3,}|~{3,})([^\n`~]*)$/.exec(line);
    if (m) {
      openFrom = lineFrom;
      marker = m[1];
      break;
    }
    if (line.trim()) break;
    pos = nl < 0 ? len : nl + 1;
  }

  if (openFrom < 0 || !marker) return alignHintLineRange(text, from, to, len);

  const ch = marker.charAt(0);
  const minLen = marker.length;
  let scan = text.indexOf('\n', openFrom);
  scan = scan < 0 ? len : scan + 1;
  while (scan < len) {
    const lineFrom = scan;
    const nl = text.indexOf('\n', lineFrom);
    const lineTo = nl < 0 ? len : nl;
    const line = text.slice(lineFrom, lineTo);
    const closeRe = new RegExp('^ {0,3}\\' + ch + '{' + minLen + ',}\\s*$');
    if (closeRe.test(line)) {
      return { from: openFrom, to: nl < 0 ? len : nl + 1 };
    }
    scan = nl < 0 ? len : nl + 1;
  }

  return alignHintLineRange(text, from, to, len);
}

/**
 * @param {string} slice
 * @returns {{ lang: string, code: string } | null}
 */
function parseFencedCode(slice) {
  const text = String(slice || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const m = /^( {0,3})(`{3,}|~{3,})([^\n`]*)\n([\s\S]*?)\n {0,3}\2\s*$/.exec(text);
  if (!m) {
    // 允许末尾无换行闭合
    const m2 = /^( {0,3})(`{3,}|~{3,})([^\n`]*)\n([\s\S]*?)\n? {0,3}\2\s*$/.exec(text);
    if (!m2) return null;
    return {
      lang: String(m2[3] || '').trim().split(/\s+/)[0] || '',
      code: m2[4] || '',
    };
  }
  return {
    lang: String(m[3] || '').trim().split(/\s+/)[0] || '',
    code: m[4] || '',
  };
}

module.exports = {
  parseFencedCode: parseFencedCode,
  expandFenceBlockRange: expandFenceBlockRange,
};

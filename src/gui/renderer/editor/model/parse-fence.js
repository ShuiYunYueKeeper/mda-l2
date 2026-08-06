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
 * 围栏正文行之后若出现新的块级 Markdown，视为围栏意外未闭合的终点。
 * @param {string} line
 */
function isFenceBlockBoundary(line) {
  const t = String(line || '');
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^\|/.test(t)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(t.trim())) return true;
  if (/^ {0,3}(`{3,}|~{3,})/.test(t)) return true;
  return false;
}

/**
 * 从某行起向下搜寻开围栏行（语法树 from 可能落在 @anno JSON 等围栏外文本内）。
 * @param {string} text
 * @param {number} lineStart
 * @param {number} maxLines
 */
function findFenceOpenFrom(text, lineStart, maxLines) {
  const len = text.length;
  let pos = Math.max(0, Math.min(lineStart, len));
  let lines = 0;
  while (pos < len && lines < maxLines) {
    const lineFrom = pos;
    const nl = text.indexOf('\n', lineFrom);
    const lineTo = nl < 0 ? len : nl;
    const line = text.slice(lineFrom, lineTo);
    const m = /^ {0,3}(`{3,}|~{3,})([^\n`~]*)$/.exec(line);
    if (m) return { openFrom: lineFrom, marker: m[1] };
    pos = nl < 0 ? len : nl + 1;
    lines += 1;
  }
  return null;
}

/**
 * 从开围栏行向下扩展到闭合围栏；仅当找不到闭合时，才用块级边界截断（防未闭合围栏吞正文）。
 * 注意：不能在寻找闭合符时把 `# comment` / `| table` 等代码正文当边界，
 * 否则 bash 注释等会导致 replace 区间过短 → 代码块 widget + 正文双显。
 * @param {string} text
 * @param {number} openFrom
 * @param {string} marker
 */
function expandFenceFromOpen(text, openFrom, marker) {
  const len = text.length;
  const ch = marker.charAt(0);
  const minLen = marker.length;
  const openLineEnd = text.indexOf('\n', openFrom);
  const bodyStart = openLineEnd < 0 ? len : openLineEnd + 1;
  const closeRe = new RegExp('^ {0,3}\\' + ch + '{' + minLen + ',}\\s*$');

  // Pass 1：优先找合法闭合围栏（忽略正文中的 # / | / ---）
  let scan = bodyStart;
  while (scan < len) {
    const lineFrom = scan;
    const nl = text.indexOf('\n', lineFrom);
    const lineTo = nl < 0 ? len : nl;
    const line = text.slice(lineFrom, lineTo);
    if (closeRe.test(line)) {
      return { from: openFrom, to: nl < 0 ? len : nl + 1 };
    }
    scan = nl < 0 ? len : nl + 1;
  }

  // Pass 2：未闭合 — 在后续真正的 Markdown 块级边界处截断
  scan = bodyStart;
  let lastContentEnd = bodyStart;
  while (scan < len) {
    const lineFrom = scan;
    const nl = text.indexOf('\n', lineFrom);
    const lineTo = nl < 0 ? len : nl;
    const line = text.slice(lineFrom, lineTo);
    if (lineFrom >= bodyStart && isFenceBlockBoundary(line)) {
      return { from: openFrom, to: lastContentEnd };
    }
    lastContentEnd = nl < 0 ? len : nl + 1;
    scan = lastContentEnd;
  }
  return { from: openFrom, to: lastContentEnd };
}

/**
 * 围栏块区间：不信任语法树偏大的 to，按开/闭围栏行定位。
 * @param {string} text
 * @param {number} from
 * @param {number} to
 */
function expandFenceBlockRange(text, from, to) {
  const len = text.length;
  let lineStart = Math.max(0, Math.min(from, len));
  while (lineStart > 0 && text.charAt(lineStart - 1) !== '\n') lineStart -= 1;

  const open = findFenceOpenFrom(text, lineStart, 24);
  if (!open) {
    // 找不到围栏：仅对齐 hint 行，勿信任语法树偏大的 to（与表格同类问题）
    return alignHintLineRange(text, from, Math.min(to, from + 1), len);
  }

  return expandFenceFromOpen(text, open.openFrom, open.marker);
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
      marker: m2[2],
    };
  }
  return {
    lang: String(m[3] || '').trim().split(/\s+/)[0] || '',
    code: m[4] || '',
    marker: m[2],
  };
}

/**
 * @param {string} [lang]
 * @param {string} [code]
 * @param {string} [marker] 默认 ```
 */
function serializeFencedCode(lang, code, marker) {
  const tick = marker && marker.length ? marker : '```';
  const langPart = lang ? String(lang).trim() : '';
  // 仅去首部空行；保留尾部换行（代码块末尾回车新增的空行）
  const body = String(code || '').replace(/\r\n/g, '\n').replace(/^\n+/, '');
  return tick + langPart + '\n' + body + '\n' + tick;
}

/**
 * 从可能偏大的切片中提取围栏正文（估高/展示用）。
 * @param {string} source
 */
function extractFenceCodeBody(source) {
  const parsed = parseFencedCode(source);
  if (parsed) return parsed.code;
  const text = String(source || '').replace(/\r\n/g, '\n');
  const closed = /^( {0,3})(`{3,}|~{3,})([^\n`~]*)\n([\s\S]*?)\n {0,3}\2\s*(?:\n|$)/.exec(text);
  if (closed) return closed[4];
  const open = /^( {0,3})(`{3,}|~{3,})([^\n`~]*)\n([\s\S]*)$/.exec(text);
  if (!open) return '';
  const body = open[4];
  const lines = body.split('\n');
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (isFenceBlockBoundary(lines[i])) break;
    kept.push(lines[i]);
  }
  return kept.join('\n');
}

module.exports = {
  parseFencedCode: parseFencedCode,
  serializeFencedCode: serializeFencedCode,
  expandFenceBlockRange: expandFenceBlockRange,
  extractFenceCodeBody: extractFenceCodeBody,
};

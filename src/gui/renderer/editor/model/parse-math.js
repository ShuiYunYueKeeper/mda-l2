/**
 * S15/S16：行内 `$...$` 与块级 `$$...$$` 扫描（围栏感知，与 core buildCodeFenceMask 一致）。
 */
'use strict';

/**
 * @param {string[]} lines
 * @returns {boolean[]}
 */
function buildCodeFenceMask(lines) {
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
 * @returns {number[]}
 */
function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/**
 * @param {number} pos
 * @param {number[]} lineStarts
 */
function lineIndexAt(pos, lineStarts) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * @param {number} lineIdx
 * @param {number[]} lineStarts
 * @param {string} text
 */
function lineEndAt(lineIdx, lineStarts, text) {
  if (lineIdx + 1 < lineStarts.length) {
    let end = lineStarts[lineIdx + 1] - 1;
    if (end > lineStarts[lineIdx] && text.charCodeAt(end) === 13) end -= 1;
    return end;
  }
  return text.length;
}

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isWordChar(ch) {
  return /[\w\d]/.test(ch);
}

/**
 * @param {string} text
 * @param {number} pos — `$` 位置
 */
function isValidInlineOpen(text, pos) {
  const prev = pos > 0 ? text.charAt(pos - 1) : '';
  const next = pos + 1 < text.length ? text.charAt(pos + 1) : '';
  if (text.charAt(pos) !== '$' || next === '$') return false;
  if (prev === '$' || prev === '\\') return false;
  if (prev && !isWhitespace(prev) && isWordChar(prev)) return false;
  return true;
}

/**
 * @param {string} text
 * @param {number} pos — 闭合 `$` 位置
 */
function isValidInlineClose(text, pos) {
  const prev = pos > 0 ? text.charAt(pos - 1) : '';
  const next = pos + 1 < text.length ? text.charAt(pos + 1) : '';
  if (text.charAt(pos) !== '$' || prev === '$') return false;
  if (next === '$') return false;
  if (next && !isWhitespace(next) && isWordChar(next)) return false;
  return true;
}

/**
 * @param {string} text
 * @param {number} start
 */
function findInlineClose(text, start) {
  let match = start;
  while (match < text.length) {
    const idx = text.indexOf('$', match);
    if (idx < 0) return -1;
    let pos = idx - 1;
    while (pos >= start && text.charAt(pos) === '\\') pos -= 1;
    if (((idx - pos) % 2) === 1) {
      if (isValidInlineClose(text, idx)) return idx;
    }
    match = idx + 1;
  }
  return -1;
}

/**
 * @param {string} text
 * @param {number} from
 * @param {number} to
 * @param {{ from: number, to: number }[]} blocked
 */
function overlapsBlocked(from, to, blocked) {
  for (let i = 0; i < blocked.length; i++) {
    const b = blocked[i];
    if (from < b.to && to > b.from) return true;
  }
  return false;
}

/**
 * @param {string} text
 * @param {number} pos
 * @param {{ from: number, to: number }[]} inlineCodeRanges
 */
function inInlineCode(pos, inlineCodeRanges) {
  for (let i = 0; i < inlineCodeRanges.length; i++) {
    const r = inlineCodeRanges[i];
    if (pos >= r.from && pos < r.to) return true;
  }
  return false;
}

/**
 * @param {string} text
 * @returns {{ from: number, to: number }[]}
 */
function findInlineCodeRanges(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (text.charCodeAt(i) !== 96) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < text.length && text.charCodeAt(j) === 96) j += 1;
    const tickLen = j - i;
    const close = text.indexOf('`'.repeat(tickLen), j);
    if (close < 0) break;
    out.push({ from: i, to: close + tickLen });
    i = close + tickLen;
  }
  return out;
}

/**
 * @param {string} text
 * @param {number} lineIdx
 * @param {number[]} lineStarts
 * @param {boolean[]} fenceMask
 */
function tryParseBlockMathAtLine(text, lineIdx, lineStarts, fenceMask) {
  if (fenceMask[lineIdx]) return null;
  const from = lineStarts[lineIdx];
  const lineEnd = lineEndAt(lineIdx, lineStarts, text);
  const line = text.slice(from, lineEnd);
  const open = line.match(/^ {0,3}\$\$/);
  if (!open) return null;

  const openPos = from + open.index + 2;
  const firstRest = text.slice(openPos, lineEnd);

  // 单行 $$...$$
  const closeAt = firstRest.lastIndexOf('$$');
  if (closeAt > 0 && closeAt === firstRest.length - 2) {
    const body = firstRest.slice(0, closeAt);
    if (!body.includes('$$')) {
      const tex = body.trim();
      if (tex) return { from: from, to: lineEnd, tex: tex, endLine: lineIdx };
    }
  }

  if (firstRest.includes('$$')) return null;

  let texLines = [firstRest];
  for (let j = lineIdx + 1; j < lineStarts.length; j++) {
    if (fenceMask[j]) return null;
    const lFrom = lineStarts[j];
    const lEnd = lineEndAt(j, lineStarts, text);
    const lText = text.slice(lFrom, lEnd);
    const trimmed = lText.trim();
    if (trimmed.endsWith('$$')) {
      const closeIdx = lText.lastIndexOf('$$');
      const body = lText.slice(0, closeIdx);
      texLines.push(body);
      const tex = texLines.join('\n').replace(/^\n+|\n+$/g, '');
      const to = lEnd;
      return { from: from, to: to, tex: tex, endLine: j };
    }
    if (trimmed.includes('$$')) return null;
    texLines.push(lText);
  }
  return null;
}

/**
 * @param {string} text
 * @returns {{ kind: 'math-inline'|'math-block', from: number, to: number, tex: string }[]}
 */
function findMathRanges(text) {
  if (!text) return [];
  const body = text.replace(/^\uFEFF/, '');
  const bomSkip = text.length - body.length;
  const lines = body.split(/\r?\n/);
  const fenceMask = buildCodeFenceMask(lines);
  const lineStarts = buildLineStarts(body);
  const inlineCodeRanges = findInlineCodeRanges(body);
  const blocked = [];
  const out = [];

  for (let lineIdx = 0; lineIdx < lineStarts.length; lineIdx++) {
    const block = tryParseBlockMathAtLine(body, lineIdx, lineStarts, fenceMask);
    if (block) {
      out.push({
        kind: 'math-block',
        from: block.from + bomSkip,
        to: block.to + bomSkip,
        tex: block.tex,
      });
      blocked.push({ from: block.from, to: block.to });
      lineIdx = block.endLine;
    }
  }

  let pos = 0;
  while (pos < body.length) {
    if (inInlineCode(pos, inlineCodeRanges)) {
      pos += 1;
      continue;
    }
    const lineIdx = lineIndexAt(pos, lineStarts);
    if (fenceMask[lineIdx]) {
      const nextLine = lineIdx + 1 < lineStarts.length ? lineStarts[lineIdx + 1] : body.length;
      pos = nextLine;
      continue;
    }
    if (body.charCodeAt(pos) !== 36) {
      pos += 1;
      continue;
    }
    if (body.charAt(pos + 1) === '$') {
      pos += 2;
      continue;
    }
    if (!isValidInlineOpen(body, pos)) {
      pos += 1;
      continue;
    }
    const close = findInlineClose(body, pos + 1);
    if (close < 0) {
      pos += 1;
      continue;
    }
    if (close - pos <= 1) {
      pos += 1;
      continue;
    }
    const slice = body.slice(pos, close + 1);
    if (slice.indexOf('\n') >= 0) {
      pos += 1;
      continue;
    }
    const from = pos;
    const to = close + 1;
    if (overlapsBlocked(from, to, blocked)) {
      pos += 1;
      continue;
    }
    out.push({
      kind: 'math-inline',
      from: from + bomSkip,
      to: to + bomSkip,
      tex: body.slice(pos + 1, close),
    });
    pos = to;
  }

  out.sort(function (a, b) {
    return a.from - b.from || a.to - b.to;
  });
  return out;
}

/**
 * @param {string} source
 * @returns {{ tex: string } | null}
 */
function parseMathInline(source) {
  if (!source || source.charAt(0) !== '$' || source.charAt(1) === '$') return null;
  if (source.charAt(source.length - 1) !== '$') return null;
  const tex = source.slice(1, -1);
  if (!tex || tex.indexOf('\n') >= 0) return null;
  return { tex: tex };
}

/**
 * @param {string} source
 * @returns {{ tex: string } | null}
 */
function parseMathBlock(source) {
  if (!source || !source.startsWith('$$')) return null;
  const close = source.lastIndexOf('$$');
  if (close <= 1) return null;
  const tex = source.slice(2, close).replace(/^\n+|\n+$/g, '');
  return { tex: tex };
}

/**
 * @param {string} tex
 */
function serializeMathInline(tex) {
  return '$' + String(tex == null ? '' : tex) + '$';
}

/**
 * @param {string} tex
 */
function serializeMathBlock(tex) {
  const body = String(tex == null ? '' : tex).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!body.includes('\n')) return '$$' + body + '$$';
  return '$$\n' + body + '\n$$';
}

module.exports = {
  buildCodeFenceMask: buildCodeFenceMask,
  findMathRanges: findMathRanges,
  parseMathInline: parseMathInline,
  parseMathBlock: parseMathBlock,
  serializeMathInline: serializeMathInline,
  serializeMathBlock: serializeMathBlock,
};

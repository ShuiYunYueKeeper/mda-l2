/**
 * 采纳写入规划（纯函数）：把 AI 结果变成 CM6 changes，批注行逐字节保留在原位。
 */
'use strict';

const { annoRanges, splitLines } = require('./ai-context');

const BLOCK_START_RE = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~|\$\$)/;

/** @param {string} s */
function paragraphs(s) {
  return String(s || '').split(/\n[ \t]*\n+/).map((p) => p.replace(/^\n+|\n+$/g, '')).filter((p) => p.trim());
}

/**
 * [from,to) 去掉批注行后的正文片段；片段首尾空行收缩掉（空行属于分隔，不属于正文）。
 * @returns {{ from: number, to: number }[]}
 */
function proseSegments(text, from, to, ranges) {
  const cuts = ranges.filter((r) => r.from < to && r.to > from);
  const raw = [];
  let p = from;
  for (const r of cuts) {
    if (r.from > p) raw.push({ from: p, to: r.from });
    p = Math.max(p, r.to);
  }
  if (p < to) raw.push({ from: p, to });
  const out = [];
  for (const seg of raw) {
    let a = seg.from;
    let b = seg.to;
    while (a < b && /\s/.test(text.charAt(a))) a++;
    while (b > a && /\s/.test(text.charAt(b - 1))) b--;
    if (a < b) out.push({ from: a, to: b });
  }
  return out;
}

/**
 * 替换作用范围。范围内无批注行 → 一次替换；有批注行 → 按段落把结果分给各正文片段。
 * @param {string} text
 * @param {{ from: number, to: number }} scope
 * @param {string} result
 * @returns {{ ok: true, changes: {from:number,to:number,insert:string}[], cursor: number }
 *   | { ok: false, reason: 'anno-split' }}
 */
function planReplace(text, scope, result) {
  const ranges = annoRanges(text);
  const inside = ranges.some((r) => r.from < scope.to && r.to > scope.from);
  if (!inside) {
    return {
      ok: true,
      changes: [{ from: scope.from, to: scope.to, insert: result }],
      cursor: scope.from + result.length,
    };
  }
  const segs = proseSegments(text, scope.from, scope.to, ranges);
  const counts = segs.map((s) => paragraphs(text.slice(s.from, s.to)).length);
  const parts = paragraphs(result);
  const total = counts.reduce((a, b) => a + b, 0);
  if (!segs.length || total !== parts.length) return { ok: false, reason: 'anno-split' };
  const changes = [];
  let k = 0;
  for (let i = 0; i < segs.length; i++) {
    const insert = parts.slice(k, k + counts[i]).join('\n\n');
    k += counts[i];
    changes.push({ from: segs[i].from, to: segs[i].to, insert });
  }
  let cursor = scope.from;
  let delta = 0;
  for (const c of changes) {
    delta += c.insert.length - (c.to - c.from);
    cursor = c.to + delta;
  }
  return { ok: true, changes, cursor };
}

/**
 * 插入点若紧挨在批注行下方（中间只有空行），插入的新段落会抢走这条批注的归属段落；
 * 此时把插入点挪到这组批注行之前。
 */
function avoidStealingAnnotation(text, pos) {
  const rows = splitLines(text);
  const ranges = annoRanges(text);
  const isAnnoRow = (row) => ranges.some((r) => r.from === row.from);
  let idx = rows.findIndex((r) => pos >= r.from && pos <= r.to);
  if (idx < 0) return pos;
  if (rows[idx].text.trim() && !isAnnoRow(rows[idx])) return pos;
  let i = idx - 1;
  while (i >= 0 && !rows[i].text.trim()) i--;
  if (i < 0 || !isAnnoRow(rows[i])) return pos;
  while (i > 0 && isAnnoRow(rows[i - 1])) i--;
  return rows[i].from;
}

/**
 * 在 pos 处插入独立块：与前后非空内容各隔一个空行。
 * @param {string} text
 * @param {number} pos 必须在行首或行尾
 * @param {string} block
 */
function planInsertBlock(text, pos, block) {
  const at = avoidStealingAnnotation(text, pos);
  const before = text.slice(0, at);
  const after = text.slice(at);
  let lead = '';
  if (before && !/\n\n$/.test(before) && before.trim()) lead = /\n$/.test(before) ? '\n' : '\n\n';
  let trail = '';
  if (after.trim()) {
    const m = /^\n*/.exec(after);
    const nl = m ? m[0].length : 0;
    trail = nl >= 2 ? '' : (nl === 1 ? '\n' : '\n\n');
  }
  const insert = lead + block + trail;
  return {
    ok: true,
    changes: [{ from: at, to: at, insert }],
    cursor: at + lead.length + block.length,
  };
}

/**
 * 在作用范围所在最后一行之后插入（翻译「插入到下方」、解释「插入到下方」）。
 */
function planInsertAfter(text, scope, block) {
  const nl = text.indexOf('\n', Math.max(scope.from, scope.to - 1));
  const lineEnd = nl < 0 ? text.length : nl;
  return planInsertBlock(text, lineEnd, block);
}

/**
 * 续写 / 帮我写：光标在空行或行尾时按块插入；在行中间或结果是一句续写时直接接在光标后。
 */
function planInsertAtCursor(text, pos, result) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const nl = text.indexOf('\n', pos);
  const lineEnd = nl < 0 ? text.length : nl;
  const lineText = text.slice(lineStart, lineEnd);
  const atEnd = !text.slice(pos, lineEnd).trim();
  if (!lineText.trim()) return planInsertBlock(text, lineStart, result);
  const blocky = /\n\s*\n/.test(result) || BLOCK_START_RE.test(result);
  if (atEnd && blocky) return planInsertBlock(text, lineEnd, result.replace(/^\n+/, ''));
  return {
    ok: true,
    changes: [{ from: pos, to: pos, insert: result }],
    cursor: pos + result.length,
  };
}

module.exports = {
  paragraphs,
  proseSegments,
  planReplace,
  planInsertBlock,
  planInsertAfter,
  planInsertAtCursor,
  avoidStealingAnnotation,
};

/**
 * AI 作用范围解析 + 请求载荷构建（纯函数，输入为 CM6 文档全文）。
 * 批注行在这里就剔除，模型永远看不到 `@anno`（main 进程另有一道兜底）。
 */
'use strict';

const { findAnnotationHideRanges } = require('../../model/anno-lines');
const { buildCodeFenceMask } = require('../../model/parse-math');
const { blockKindAtPos, isBlockOnlyKind, canUseSelectionAnnoForRange } = require('../../model/anno-add-context');

const LIMITS = { before: 6000, after: 1500, scope: 8000 };

/** @typedef {'generate'|'rewrite'|'read'} AiKind */

/**
 * @param {string} text
 * @returns {{ from: number, to: number, text: string }[]}
 */
function splitLines(text) {
  const rows = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      rows.push({ from: start, to: i, text: text.slice(start, i) });
      start = i + 1;
    }
  }
  return rows;
}

function lineIndexAt(rows, pos) {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rows[mid].from <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function isBlank(s) {
  return !String(s || '').trim();
}

/**
 * 围栏外批注行区间（整行，含行尾换行）。
 * @param {string} text
 */
function annoRanges(text) {
  return findAnnotationHideRanges(text).map((r) => ({ from: r.from, to: r.to }));
}

/**
 * 删掉 [from,to) 内的批注行，返回剩余文本。
 * @param {string} text
 * @param {number} from
 * @param {number} to
 * @param {{from:number,to:number}[]} [ranges]
 */
function stripAnnoInRange(text, from, to, ranges) {
  const list = ranges || annoRanges(text);
  let out = '';
  let p = from;
  for (const r of list) {
    if (r.to <= from || r.from >= to) continue;
    const a = Math.max(from, r.from);
    if (a > p) out += text.slice(p, a);
    p = Math.max(p, Math.min(to, r.to));
  }
  if (p < to) out += text.slice(p, to);
  return out;
}

/**
 * 光标所在块：围栏代码整段；标题单行；其余为连续非空行（批注行也算在段内，发送前剔除）。
 * @returns {{ from: number, to: number, kind: string }}
 */
function fenceBlocks(rows) {
  const blocks = [];
  let open = null;
  for (let i = 0; i < rows.length; i++) {
    if (!open) {
      const m = rows[i].text.match(/^ {0,3}(`{3,}|~{3,})/);
      if (m) open = { start: i, ch: m[1][0], len: m[1].length };
    } else {
      const c = rows[i].text.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (c && c[1][0] === open.ch && c[1].length >= open.len) {
        blocks.push({ start: open.start, end: i });
        open = null;
      }
    }
  }
  if (open) blocks.push({ start: open.start, end: rows.length - 1 });
  return blocks;
}

function blockAround(text, pos) {
  const rows = splitLines(text);
  const idx = lineIndexAt(rows, pos);
  const fence = buildCodeFenceMask(rows.map((r) => r.text));
  if (fence[idx]) {
    const blk = fenceBlocks(rows).find((b) => idx >= b.start && idx <= b.end);
    const a = blk ? blk.start : idx;
    const b = blk ? blk.end : idx;
    return { from: rows[a].from, to: rows[b].to, kind: blockKindAtPos(text, pos) };
  }
  if (/^\s*#{1,6}(?:\s|$)/.test(rows[idx].text)) {
    return { from: rows[idx].from, to: rows[idx].to, kind: 'heading' };
  }
  if (isBlank(rows[idx].text)) {
    return { from: rows[idx].from, to: rows[idx].to, kind: 'blank' };
  }
  let a = idx;
  let b = idx;
  while (a > 0 && !isBlank(rows[a - 1].text) && !fence[a - 1] && !/^\s*#{1,6}(?:\s|$)/.test(rows[a - 1].text)) a--;
  while (b < rows.length - 1 && !isBlank(rows[b + 1].text) && !fence[b + 1] && !/^\s*#{1,6}(?:\s|$)/.test(rows[b + 1].text)) b++;
  return { from: rows[a].from, to: rows[b].to, kind: blockKindAtPos(text, pos) };
}

/**
 * @param {string} text  CM6 全文（LF）
 * @param {{ from: number, to: number, head?: number }} sel
 * @param {AiKind} kind
 * @returns {{ ok: true, from: number, to: number, inline: boolean, source: 'selection'|'block'|'cursor', scopeText: string, hasAnno: boolean }
 *   | { ok: false, reason: 'widget'|'empty'|'anno-only' }}
 */
function resolveAiScope(text, sel, kind) {
  const len = text.length;
  const from0 = Math.max(0, Math.min(sel.from, len));
  const to0 = Math.max(from0, Math.min(sel.to, len));

  if (kind === 'generate') {
    const pos = to0;
    return { ok: true, from: pos, to: pos, inline: false, source: 'cursor', scopeText: '', hasAnno: false };
  }

  let from;
  let to;
  let inline = false;
  let source;
  if (from0 < to0) {
    source = 'selection';
    if (kind === 'rewrite' && !canUseSelectionAnnoForRange(text, from0, to0)) {
      return { ok: false, reason: 'widget' };
    }
    const rows = splitLines(text);
    const a = lineIndexAt(rows, from0);
    const b = lineIndexAt(rows, Math.max(from0, to0 - 1));
    if (a === b) {
      const row = rows[a];
      const lead = row.text.length - row.text.replace(/^\s+/, '').length;
      const trail = row.text.replace(/\s+$/, '').length;
      const coversLine = from0 <= row.from + lead && to0 >= row.from + trail;
      if (coversLine) {
        from = row.from;
        to = row.to;
      } else {
        from = from0;
        to = to0;
        inline = true;
      }
    } else {
      // 跨行选区扩成整行，避免把半个列表项 / 半行表格送给模型
      from = rows[a].from;
      to = rows[b].to;
    }
  } else {
    source = 'block';
    const blk = blockAround(text, from0);
    if (blk.kind === 'blank') return { ok: false, reason: 'empty' };
    if (isBlockOnlyKind(blk.kind)) {
      if (kind === 'rewrite') return { ok: false, reason: 'widget' };
      if (blk.kind !== 'code' && blk.kind !== 'table' && blk.kind !== 'math' && blk.kind !== 'mermaid') {
        return { ok: false, reason: 'widget' };
      }
    }
    from = blk.from;
    to = blk.to;
  }

  const ranges = annoRanges(text);
  const hasAnno = ranges.some((r) => r.from < to && r.to > from);
  const scopeText = stripAnnoInRange(text, from, to, ranges);
  if (isBlank(text.slice(from, to))) return { ok: false, reason: 'empty' };
  if (isBlank(scopeText)) return { ok: false, reason: 'anno-only' };
  return { ok: true, from, to, inline, source, scopeText, hasAnno };
}

/**
 * 作用范围之前的 ATX 标题路径（围栏感知）。
 * @param {string} text
 * @param {number} pos
 * @returns {string[]}
 */
function headingPathAt(text, pos) {
  const rows = splitLines(text.slice(0, pos));
  const fence = buildCodeFenceMask(rows.map((r) => r.text));
  /** @type {{ level: number, title: string }[]} */
  const stack = [];
  for (let i = 0; i < rows.length; i++) {
    if (fence[i]) continue;
    const m = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(rows[i].text);
    if (!m) continue;
    const level = m[1].length;
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, title: m[2].replace(/[*_`~]/g, '').slice(0, 80) });
  }
  return stack.map((s) => s.title);
}

/**
 * @param {string} text
 * @param {{ from: number, to: number, inline: boolean, scopeText: string }} scope
 * @param {AiKind} kind
 * @param {{ fileName?: string }} [meta]
 */
function buildAiPayload(text, scope, kind, meta) {
  const payload = {
    fileName: (meta && meta.fileName) || '',
    headingPath: headingPathAt(text, scope.from),
  };
  if (kind === 'generate') {
    const ranges = annoRanges(text);
    const before = stripAnnoInRange(text, 0, scope.from, ranges);
    const after = stripAnnoInRange(text, scope.to, text.length, ranges);
    payload.before = before.length > LIMITS.before ? before.slice(before.length - LIMITS.before) : before;
    payload.after = after.slice(0, LIMITS.after);
    return payload;
  }
  payload.scope = scope.scopeText.slice(0, LIMITS.scope);
  payload.inline = !!scope.inline;
  return payload;
}

module.exports = {
  LIMITS,
  splitLines,
  annoRanges,
  stripAnnoInRange,
  blockAround,
  resolveAiScope,
  headingPathAt,
  buildAiPayload,
};

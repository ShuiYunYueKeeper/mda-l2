/**
 * GFM 表格轻量解析（表格 v1 渲染用）。
 */
'use strict';

/** 列宽 / 行高 meta 上限（防止异常 meta 把 CM6 块高度撑到数万像素） */
const MAX_TABLE_COL_WIDTH = 4000;
const MAX_TABLE_ROW_HEIGHT = 600;
const MAX_TABLE_WIDGET_HEIGHT = 12000;

/**
 * @param {unknown[]} arr
 * @param {number} max
 */
function sanitizeLayoutNumbers(arr, max) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function (v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(Math.round(n), max);
  });
}

/**
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

function splitRow(line) {
  let s = line.trim();
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '\\' && i + 1 < s.length) {
      cur += s.charAt(i + 1);
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function escapeCell(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, ' ');
}

function isSepRow(line) {
  const cells = splitRow(line);
  if (!cells.length) return false;
  // GFM：分隔格须为 :-+:- 形态，至少一个连字符（非固定 3 个）
  return cells.every(function (c) {
    return /^:?-+:?$/.test(c);
  });
}

function alignOf(sep) {
  const left = sep.charAt(0) === ':';
  const right = sep.charAt(sep.length - 1) === ':';
  if (left && right) return 'center';
  if (right) return 'right';
  return 'left';
}

/**
 * @param {string} tableText 整表源码（可含末尾换行）
 * @returns {{ headers: string[], aligns: string[], rows: string[][] } | null}
 */
function parseGfmTable(tableText) {
  const lines = String(tableText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(function (l, i, arr) {
      return l.length > 0 || i < arr.length - 1;
    })
    .filter(function (l) {
      return l.trim().length > 0;
    });
  if (lines.length < 2) return null;
  if (!isSepRow(lines[1])) return null;
  const headers = splitRow(lines[0]);
  const aligns = splitRow(lines[1]).map(alignOf);
  while (aligns.length < headers.length) aligns.push('left');
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    while (cells.length < headers.length) cells.push('');
    rows.push(cells.slice(0, headers.length));
  }
  return { headers: headers, aligns: aligns.slice(0, headers.length), rows: rows };
}

function alignSep(align) {
  if (align === 'center') return ':---:';
  if (align === 'right') return '---:';
  return '---';
}

function formatRow(cells) {
  return '| ' + cells.map(escapeCell).join(' | ') + ' |';
}

function formatSepRow(aligns) {
  return '| ' + aligns.map(alignSep).join(' | ') + ' |';
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @returns {string}
 */
function serializeGfmTable(parsed) {
  const headers = parsed.headers || [];
  const aligns = parsed.aligns || [];
  const rows = parsed.rows || [];
  const lines = [formatRow(headers), formatSepRow(aligns)];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].slice(0, headers.length);
    while (row.length < headers.length) row.push('');
    lines.push(formatRow(row));
  }
  return lines.join('\n');
}

const TABLE_META_RE = /^\[comment\]:\s*<>\s*\(@mda-table\s+(\{.+?\})\)\s*$/;

/**
 * @param {string} line
 */
function parseTableMetaLine(line) {
  const m = String(line || '').trim().match(TABLE_META_RE);
  if (!m) return null;
  try {
    const meta = JSON.parse(m[1]);
    return meta && typeof meta === 'object' ? meta : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][], colWidths?: number[], rowHeights?: number[] }} parsed
 * @returns {boolean}
 */
function hasTableLayoutMeta(parsed) {
  if (!parsed) return false;
  const cw = parsed.colWidths || [];
  const rh = parsed.rowHeights || [];
  return cw.some(function (w) {
    return w > 0;
  }) || rh.some(function (h) {
    return h > 0;
  });
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][], colWidths?: number[], rowHeights?: number[] }} parsed
 * @returns {string}
 */
function serializeGfmTableBlock(parsed) {
  const body = serializeGfmTable(parsed);
  if (!hasTableLayoutMeta(parsed)) return body;
  const meta = {};
  if (parsed.colWidths && parsed.colWidths.length) meta.colWidths = parsed.colWidths;
  if (parsed.rowHeights && parsed.rowHeights.length) meta.rowHeights = parsed.rowHeights;
  return '[comment]: <> (@mda-table ' + JSON.stringify(meta) + ')\n' + body;
}

/**
 * @param {string} blockText 可含 @mda-table meta 行
 * @returns {{ headers: string[], aligns: string[], rows: string[][], colWidths?: number[], rowHeights?: number[] } | null}
 */
function parseGfmTableBlock(blockText) {
  const lines = String(blockText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(function (l, i, arr) {
      return l.length > 0 || i < arr.length - 1;
    });
  let start = 0;
  let meta = null;
  if (lines.length > 0) {
    meta = parseTableMetaLine(lines[0]);
    if (meta) start = 1;
  }
  const parsed = parseGfmTable(lines.slice(start).join('\n'));
  if (!parsed) return null;
  if (meta) {
    if (Array.isArray(meta.colWidths)) {
      parsed.colWidths = sanitizeLayoutNumbers(meta.colWidths, MAX_TABLE_COL_WIDTH);
    }
    if (Array.isArray(meta.rowHeights)) {
      parsed.rowHeights = sanitizeLayoutNumbers(meta.rowHeights, MAX_TABLE_ROW_HEIGHT);
    }
  }
  return parsed;
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][], colWidths?: number[], rowHeights?: number[] }} a
 * @param {{ headers: string[], aligns: string[], rows: string[][], colWidths?: number[], rowHeights?: number[] }} b
 */
function tableLayoutEqual(a, b) {
  const cwA = a && a.colWidths ? a.colWidths : [];
  const cwB = b && b.colWidths ? b.colWidths : [];
  const rhA = a && a.rowHeights ? a.rowHeights : [];
  const rhB = b && b.rowHeights ? b.rowHeights : [];
  if (cwA.length !== cwB.length || rhA.length !== rhB.length) return false;
  for (let i = 0; i < cwA.length; i++) {
    if ((cwA[i] || 0) !== (cwB[i] || 0)) return false;
  }
  for (let i = 0; i < rhA.length; i++) {
    if ((rhA[i] || 0) !== (rhB[i] || 0)) return false;
  }
  return true;
}

/**
 * @param {HTMLTableElement} table
 * @returns {{ headers: string[], aligns: string[], rows: string[][] } | null}
 */
function normalizeCellText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n');
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} a
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} b
 */
function tablesEqual(a, b) {
  if (!a || !b) return false;
  if (a.headers.length !== b.headers.length) return false;
  for (let i = 0; i < a.headers.length; i++) {
    if (a.headers[i] !== b.headers[i]) return false;
    const al = a.aligns[i] || 'left';
    const bl = b.aligns[i] || 'left';
    if (al !== bl) return false;
  }
  if (a.rows.length !== b.rows.length) return false;
  for (let r = 0; r < a.rows.length; r++) {
    const rowA = a.rows[r];
    const rowB = b.rows[r];
    for (let c = 0; c < a.headers.length; c++) {
      if ((rowA[c] || '') !== (rowB[c] || '')) return false;
    }
  }
  return true;
}

function readTableFromDom(table) {
  if (!table) return null;
  const headers = [];
  const ths = table.querySelectorAll('thead th');
  const colWidths = [];
  for (let i = 0; i < ths.length; i++) {
    headers.push(normalizeCellText(ths[i].textContent).trim());
    const w = parseInt(ths[i].style.width || '', 10);
    colWidths.push(w > 0 ? w : 0);
  }
  if (!headers.length) return null;
  const aligns = [];
  for (let i = 0; i < headers.length; i++) {
    const th = ths[i];
    const align = th && th.style.textAlign ? th.style.textAlign : 'left';
    aligns.push(align === 'center' || align === 'right' ? align : 'left');
  }
  const rows = [];
  const rowHeights = [];
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    const hh = parseInt(headerRow.style.height || '', 10);
    rowHeights.push(hh > 0 ? hh : 0);
  }
  const trs = table.querySelectorAll('tbody tr');
  for (let r = 0; r < trs.length; r++) {
    const cells = [];
    const tds = trs[r].querySelectorAll('td');
    for (let c = 0; c < headers.length; c++) {
      cells.push(tds[c] ? normalizeCellText(tds[c].textContent).trim() : '');
    }
    rows.push(cells);
    const rh = parseInt(trs[r].style.height || '', 10);
    rowHeights.push(rh > 0 ? rh : 0);
  }
  const out = { headers: headers, aligns: aligns, rows: rows };
  if (table.getAttribute('data-mda-layout') === 'fixed') {
    if (colWidths.some(function (w) {
      return w > 0;
    })) out.colWidths = colWidths;
    if (rowHeights.some(function (h) {
      return h > 0;
    })) out.rowHeights = rowHeights;
  }
  return out;
}

function isTableLine(line) {
  const t = String(line || '').trim();
  return t.length > 0 && t.charAt(0) === '|';
}

/**
 * 按 parseGfmTable 实际行数收缩区间，避免 Lezer 节点 to 偏大时吞掉表格后正文。
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {{ from: number, to: number } | null}
 */
function clampGfmTableRangeByParse(text, start, end) {
  const len = text.length;
  const block = text.slice(start, end);
  const parsed = parseGfmTable(block);
  if (!parsed) return null;
  const needLines = 2 + parsed.rows.length;
  let counted = 0;
  let pos = start;
  let tableEnd = start;
  while (pos < end && counted < needLines) {
    const lineFrom = pos;
    const nextNl = text.indexOf('\n', lineFrom);
    const lineTo = nextNl < 0 ? len : nextNl;
    const line = text.slice(lineFrom, lineTo);
    if (!line.trim()) break;
    if (!isTableLine(line)) break;
    counted += 1;
    tableEnd = nextNl < 0 ? len : nextNl + 1;
    pos = tableEnd;
  }
  if (counted < needLines) return null;
  return { from: start, to: tableEnd };
}

/**
 * 将 Table 节点区间扩到相邻的 GFM 表格行，避免漏行导致「源码 + widget」双显。
 * 不信任语法树偏大的 to：只向前扫描连续 | 行，再按 parseGfmTable 收缩。
 * @param {string} text
 * @param {number} from
 * @param {number} to
 */
function expandGfmTableRange(text, from, to) {
  const len = text.length;
  let start = Math.max(0, Math.min(from, len));
  while (start > 0 && text.charAt(start - 1) !== '\n') start -= 1;

  let seed = start;
  if (!isTableLine(text.slice(seed, text.indexOf('\n', seed) < 0 ? len : text.indexOf('\n', seed)))) {
    let pos = seed;
    let found = false;
    for (let i = 0; i < 4 && pos < len; i++) {
      const lineFrom = pos;
      const nextNl = text.indexOf('\n', lineFrom);
      const lineTo = nextNl < 0 ? len : nextNl;
      if (isTableLine(text.slice(lineFrom, lineTo))) {
        seed = lineFrom;
        found = true;
        break;
      }
      pos = nextNl < 0 ? len : nextNl + 1;
    }
    if (!found) {
      return alignHintLineRange(text, from, to, len);
    }
  }

  start = seed;
  let scan = start;
  while (scan > 0) {
    const prev = text.lastIndexOf('\n', scan - 1);
    const lineFrom = prev < 0 ? 0 : prev + 1;
    const line = text.slice(lineFrom, scan);
    if (!isTableLine(line)) break;
    start = lineFrom;
    scan = lineFrom;
  }

  let end = start;
  while (end < len) {
    const lineFrom = end;
    const nextNl = text.indexOf('\n', lineFrom);
    const lineTo = nextNl < 0 ? len : nextNl;
    const line = text.slice(lineFrom, lineTo);
    if (!line.trim()) break;
    if (!isTableLine(line)) break;
    end = nextNl < 0 ? len : nextNl + 1;
  }

  const clamped = clampGfmTableRangeByParse(text, start, end);
  if (clamped) return clamped;
  return alignHintLineRange(text, from, to, len);
}

/**
 * 表格块区间（含可选 @mda-table meta 行）。
 * @param {string} text
 * @param {number} from
 * @param {number} to
 */
function expandTableBlockRange(text, from, to) {
  const gfm = expandGfmTableRange(text, from, to);
  let blockFrom = gfm.from;
  if (blockFrom > 0) {
    const lineEnd = blockFrom - 1;
    const lineStart = lineEnd > 0 ? text.lastIndexOf('\n', lineEnd - 1) + 1 : 0;
    const line = text.slice(lineStart, lineEnd);
    if (parseTableMetaLine(line)) blockFrom = lineStart;
  }
  return { from: blockFrom, to: gfm.to };
}

module.exports = {
  MAX_TABLE_COL_WIDTH: MAX_TABLE_COL_WIDTH,
  MAX_TABLE_ROW_HEIGHT: MAX_TABLE_ROW_HEIGHT,
  MAX_TABLE_WIDGET_HEIGHT: MAX_TABLE_WIDGET_HEIGHT,
  parseGfmTable: parseGfmTable,
  parseGfmTableBlock: parseGfmTableBlock,
  serializeGfmTable: serializeGfmTable,
  serializeGfmTableBlock: serializeGfmTableBlock,
  parseTableMetaLine: parseTableMetaLine,
  hasTableLayoutMeta: hasTableLayoutMeta,
  tableLayoutEqual: tableLayoutEqual,
  readTableFromDom: readTableFromDom,
  expandGfmTableRange: expandGfmTableRange,
  expandTableBlockRange: expandTableBlockRange,
  splitRow: splitRow,
  escapeCell: escapeCell,
  tablesEqual: tablesEqual,
  normalizeCellText: normalizeCellText,
  sanitizeLayoutNumbers: sanitizeLayoutNumbers,
};

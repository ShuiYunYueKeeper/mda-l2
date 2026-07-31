/**
 * GFM 表格轻量解析（表格 v1 渲染用）。
 */
'use strict';

function splitRow(line) {
  let s = line.trim();
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
  return s.split('|').map(function (c) {
    return c.trim();
  });
}

function isSepRow(line) {
  const cells = splitRow(line);
  if (!cells.length) return false;
  return cells.every(function (c) {
    return /^:?-{3,}:?$/.test(c);
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
  return '| ' + cells.join(' | ') + ' |';
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @returns {string}
 */
function serializeGfmTable(parsed) {
  const headers = parsed.headers || [];
  const aligns = parsed.aligns || [];
  const rows = parsed.rows || [];
  const lines = [formatRow(headers), formatRow(aligns.map(alignSep))];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].slice(0, headers.length);
    while (row.length < headers.length) row.push('');
    lines.push(formatRow(row));
  }
  return lines.join('\n');
}

/**
 * @param {HTMLTableElement} table
 * @returns {{ headers: string[], aligns: string[], rows: string[][] } | null}
 */
function readTableFromDom(table) {
  if (!table) return null;
  const headers = [];
  const ths = table.querySelectorAll('thead th');
  for (let i = 0; i < ths.length; i++) {
    headers.push((ths[i].textContent || '').trim());
  }
  if (!headers.length) return null;
  const aligns = [];
  for (let i = 0; i < headers.length; i++) {
    const th = ths[i];
    const align = th && th.style.textAlign ? th.style.textAlign : 'left';
    aligns.push(align === 'center' || align === 'right' ? align : 'left');
  }
  const rows = [];
  const trs = table.querySelectorAll('tbody tr');
  for (let r = 0; r < trs.length; r++) {
    const cells = [];
    const tds = trs[r].querySelectorAll('td');
    for (let c = 0; c < headers.length; c++) {
      cells.push(tds[c] ? (tds[c].textContent || '').trim() : '');
    }
    rows.push(cells);
  }
  return { headers: headers, aligns: aligns, rows: rows };
}

function isTableLine(line) {
  const t = String(line || '').trim();
  return t.length > 0 && t.charAt(0) === '|';
}

/**
 * 将 Table 节点区间扩到相邻的 GFM 表格行，避免漏行导致「源码 + widget」双显。
 * @param {string} text
 * @param {number} from
 * @param {number} to
 */
function expandGfmTableRange(text, from, to) {
  const len = text.length;
  let start = Math.max(0, Math.min(from, len));
  let end = Math.max(start, Math.min(to, len));
  while (start > 0 && text.charAt(start - 1) !== '\n') start -= 1;
  if (end < len) {
    if (end > 0 && text.charAt(end - 1) !== '\n') {
      while (end < len && text.charAt(end) !== '\n') end += 1;
      if (end < len) end += 1;
    }
  }
  let scan = start;
  while (scan > 0) {
    const prev = text.lastIndexOf('\n', scan - 1);
    const lineFrom = prev < 0 ? 0 : prev + 1;
    const line = text.slice(lineFrom, scan);
    if (!isTableLine(line)) break;
    start = lineFrom;
    scan = lineFrom;
  }
  while (end < len) {
    const lineFrom = end;
    const nextNl = text.indexOf('\n', lineFrom);
    const lineTo = nextNl < 0 ? len : nextNl;
    const line = text.slice(lineFrom, lineTo);
    if (!line.trim()) {
      end = nextNl < 0 ? len : nextNl + 1;
      continue;
    }
    if (!isTableLine(line)) break;
    end = nextNl < 0 ? len : nextNl + 1;
  }
  if (end < start) end = start;
  return { from: start, to: end };
}

module.exports = {
  parseGfmTable: parseGfmTable,
  serializeGfmTable: serializeGfmTable,
  readTableFromDom: readTableFromDom,
  expandGfmTableRange: expandGfmTableRange,
  splitRow: splitRow,
};

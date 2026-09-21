/**
 * CM6 预览模式：表格块内查找匹配 DOM 高亮（块 widget 遮盖文档装饰层）。
 */
'use strict';

const { parseTableMetaLine, splitRow, isSepRow } = require('./model/parse-table');
const { markdownToVisibleOffset } = require('./widgets/table-cell-content');
const {
  FIND_MARK_CLS,
  FIND_ACTIVE_CLS,
  clearContainerFindMarks,
  applyVisibleHighlightsInContainer,
} = require('./widget-find-dom');

/**
 * @param {string} line
 * @param {number} lineStart
 * @returns {{ col: number, docFrom: number, docTo: number }[]}
 */
function cellContentRangesInLine(line, lineStart) {
  const ranges = [];
  let i = 0;
  const s = String(line || '');
  if (s.charAt(i) === '|') i += 1;
  let col = 0;
  while (i <= s.length) {
    while (i < s.length && s.charAt(i) === ' ') i += 1;
    const start = i;
    while (i < s.length) {
      if (s.charAt(i) === '\\' && i + 1 < s.length) {
        i += 2;
        continue;
      }
      if (s.charAt(i) === '|') break;
      i += 1;
    }
    ranges.push({ col: col, docFrom: lineStart + start, docTo: lineStart + i });
    col += 1;
    if (i < s.length && s.charAt(i) === '|') i += 1;
    else break;
  }
  return ranges;
}

/**
 * @param {string} blockText
 * @param {number} blockFrom
 * @returns {{ row: number, col: number, docFrom: number, docTo: number }[]}
 */
function buildTableCellDocMap(blockText, blockFrom) {
  const normalized = String(blockText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  let lineStart = blockFrom;
  let tableLineIdx = -1;
  const cells = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const trimmed = line.trim();
    const nextLineStart = lineStart + line.length + (li < lines.length - 1 ? 1 : 0);

    if (!trimmed) {
      lineStart = nextLineStart;
      continue;
    }
    if (parseTableMetaLine(line)) {
      lineStart = nextLineStart;
      continue;
    }
    if (!trimmed.startsWith('|')) {
      lineStart = nextLineStart;
      continue;
    }
    tableLineIdx += 1;
    if (tableLineIdx === 1 || isSepRow(line)) {
      lineStart = nextLineStart;
      continue;
    }
    const row = tableLineIdx === 0 ? -1 : tableLineIdx - 2;

    const colRanges = cellContentRangesInLine(line, lineStart);
    const parts = splitRow(line);
    for (let c = 0; c < colRanges.length; c++) {
      const r = colRanges[c];
      if (r.docTo <= r.docFrom) continue;
      cells.push({
        row: row,
        col: c,
        docFrom: r.docFrom,
        docTo: r.docTo,
        markdown: parts[c] != null ? parts[c] : '',
      });
    }
    lineStart = nextLineStart;
  }
  return cells;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @returns {{ from: number, to: number }[]}
 */
function getTableBlockRanges(view) {
  const ranges = [];
  if (!view || !view.dom) return ranges;
  const blocks = view.dom.querySelectorAll('.mda-cm-table-block');
  for (let i = 0; i < blocks.length; i++) {
    const from = parseInt(blocks[i].getAttribute('data-mda-block-from') || '', 10);
    const to = parseInt(blocks[i].getAttribute('data-mda-block-to') || '', 10);
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
      ranges.push({ from: from, to: to });
    }
  }
  return ranges;
}

/**
 * @param {HTMLElement} cell
 */
function clearCellFindMarks(cell) {
  clearContainerFindMarks(cell);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function clearTableFindHighlights(view) {
  if (!view || !view.dom) return;
  const cells = view.dom.querySelectorAll('.mda-cm-table th, .mda-cm-table td');
  for (let i = 0; i < cells.length; i++) clearCellFindMarks(cells[i]);
}

/**
 * @param {HTMLElement} tableRoot
 * @param {number} row
 * @param {number} col
 * @returns {HTMLElement | null}
 */
function queryTableCell(tableRoot, row, col) {
  if (!tableRoot) return null;
  const table = tableRoot.querySelector('table');
  if (!table) return null;
  const sel =
    (row < 0 ? 'thead th' : 'tbody td') +
    '[data-mda-row="' + row + '"][data-mda-col="' + col + '"]';
  return table.querySelector(sel);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ start: number, end: number }[]} matches
 * @param {number} activeIndex
 */
function applyTableFindHighlights(view, matches, activeIndex) {
  if (!view || !view.dom) return;
  clearTableFindHighlights(view);
  if (!matches || !matches.length) return;

  const doc = view.state.doc.toString();
  const blocks = view.dom.querySelectorAll('.mda-cm-table-block');
  /** @type {Map<HTMLElement, { visStart: number, visEnd: number, cls: string }[]>} */
  const cellRanges = new Map();

  for (let bi = 0; bi < blocks.length; bi++) {
    const root = blocks[bi];
    const blockFrom = parseInt(root.getAttribute('data-mda-block-from') || '', 10);
    const blockTo = parseInt(root.getAttribute('data-mda-block-to') || '', 10);
    if (!Number.isFinite(blockFrom) || !Number.isFinite(blockTo) || blockTo <= blockFrom) {
      continue;
    }
    const blockText = doc.slice(blockFrom, blockTo);
    const cellMap = buildTableCellDocMap(blockText, blockFrom);

    for (let mi = 0; mi < matches.length; mi++) {
      const m = matches[mi];
      if (m.end <= m.start) continue;
      if (m.end <= blockFrom || m.start >= blockTo) continue;

      const isActive = mi === activeIndex;
      const cls = isActive ? FIND_ACTIVE_CLS : FIND_MARK_CLS;
      const matchFrom = Math.max(m.start, blockFrom);
      const matchTo = Math.min(m.end, blockTo);

      for (let ci = 0; ci < cellMap.length; ci++) {
        const cellInfo = cellMap[ci];
        if (matchTo <= cellInfo.docFrom || matchFrom >= cellInfo.docTo) continue;

        const localFrom = Math.max(0, matchFrom - cellInfo.docFrom);
        const localTo = Math.min(cellInfo.docTo - cellInfo.docFrom, matchTo - cellInfo.docFrom);
        const cellMd = doc.slice(cellInfo.docFrom, cellInfo.docTo);
        const visStart = markdownToVisibleOffset(cellMd, localFrom);
        const visEnd = markdownToVisibleOffset(cellMd, localTo);
        if (visEnd <= visStart) continue;

        const cellEl = queryTableCell(root, cellInfo.row, cellInfo.col);
        if (!cellEl) continue;
        if (!cellRanges.has(cellEl)) cellRanges.set(cellEl, []);
        cellRanges.get(cellEl).push({ visStart: visStart, visEnd: visEnd, cls: cls });
      }
    }
  }

  cellRanges.forEach(function (ranges, cell) {
    applyVisibleHighlightsInContainer(cell, ranges);
  });
}

module.exports = {
  applyTableFindHighlights: applyTableFindHighlights,
  clearTableFindHighlights: clearTableFindHighlights,
  buildTableCellDocMap: buildTableCellDocMap,
  getTableBlockRanges: getTableBlockRanges,
};

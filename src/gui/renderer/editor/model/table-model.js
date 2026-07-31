/**
 * GFM 表格结构化编辑（纯函数，不碰 DOM）。
 */
'use strict';

/**
 * @typedef {{ kind: 'none' }} TableSelNone
 * @typedef {{ kind: 'cell', row: number, col: number }} TableSelCell
 * @typedef {{ kind: 'row', row: number }} TableSelRow
 * @typedef {{ kind: 'col', col: number }} TableSelCol
 * @typedef {{ kind: 'rect', row1: number, col1: number, row2: number, col2: number }} TableSelRect
 * @typedef {TableSelNone | TableSelCell | TableSelRow | TableSelCol | TableSelRect} TableSelection
 */

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 */
function cloneTableData(parsed) {
  const out = {
    headers: parsed.headers.slice(),
    aligns: (parsed.aligns || []).slice(),
    rows: parsed.rows.map(function (row) {
      return row.slice();
    }),
  };
  if (parsed.colWidths) out.colWidths = parsed.colWidths.slice();
  if (parsed.rowHeights) out.rowHeights = parsed.rowHeights.slice();
  return out;
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 */
function emptyRow(parsed) {
  return parsed.headers.map(function () {
    return '';
  });
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {number} bodyIndex 0-based；rows.length 表示末尾之后
 * @param {'before'|'after'} position
 */
function insertTableRow(parsed, bodyIndex, position) {
  const row = emptyRow(parsed);
  const idx = position === 'before' ? bodyIndex : bodyIndex + 1;
  parsed.rows.splice(Math.max(0, Math.min(idx, parsed.rows.length)), 0, row);
  if (parsed.rowHeights) {
    const at = Math.max(0, Math.min(idx, parsed.rows.length - 1)) + 1;
    parsed.rowHeights.splice(at, 0, 0);
  }
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {number} colIndex
 * @param {'before'|'after'} position
 */
function insertTableColumn(parsed, colIndex, position) {
  const idx = position === 'before' ? colIndex : colIndex + 1;
  const at = Math.max(0, Math.min(idx, parsed.headers.length));
  parsed.headers.splice(at, 0, '');
  parsed.aligns.splice(at, 0, 'left');
  if (parsed.colWidths) parsed.colWidths.splice(at, 0, 0);
  for (let r = 0; r < parsed.rows.length; r++) {
    parsed.rows[r].splice(at, 0, '');
  }
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {number} bodyIndex
 */
function deleteTableRow(parsed, bodyIndex) {
  if (bodyIndex < 0 || bodyIndex >= parsed.rows.length) return;
  parsed.rows.splice(bodyIndex, 1);
  if (parsed.rowHeights && parsed.rowHeights.length > bodyIndex + 1) {
    parsed.rowHeights.splice(bodyIndex + 1, 1);
  }
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {number} colIndex
 */
function deleteTableColumn(parsed, colIndex) {
  if (parsed.headers.length <= 1) return;
  if (colIndex < 0 || colIndex >= parsed.headers.length) return;
  parsed.headers.splice(colIndex, 1);
  parsed.aligns.splice(colIndex, 1);
  if (parsed.colWidths) parsed.colWidths.splice(colIndex, 1);
  for (let r = 0; r < parsed.rows.length; r++) {
    parsed.rows[r].splice(colIndex, 1);
  }
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {number} row -1=表头
 * @param {number} col
 */
function cellAt(parsed, row, col) {
  if (col < 0 || col >= parsed.headers.length) return '';
  if (row === -1) return parsed.headers[col] || '';
  if (row < 0 || row >= parsed.rows.length) return '';
  return parsed.rows[row][col] || '';
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {number} row
 * @param {number} col
 * @param {string} value
 */
function setCellAt(parsed, row, col, value) {
  if (col < 0 || col >= parsed.headers.length) return;
  if (row === -1) {
    parsed.headers[col] = value;
    return;
  }
  if (row < 0 || row >= parsed.rows.length) return;
  parsed.rows[row][col] = value;
}

/**
 * @param {TableSelection} sel
 * @returns {{ row1: number, col1: number, row2: number, col2: number } | null}
 */
function selectionBounds(sel) {
  if (!sel || sel.kind === 'none') return null;
  if (sel.kind === 'cell') {
    return { row1: sel.row, col1: sel.col, row2: sel.row, col2: sel.col };
  }
  if (sel.kind === 'row') {
    return {
      row1: sel.row,
      col1: 0,
      row2: sel.row,
      col2: Number.MAX_SAFE_INTEGER,
    };
  }
  if (sel.kind === 'col') {
    return {
      row1: -1,
      col1: sel.col,
      row2: Number.MAX_SAFE_INTEGER,
      col2: sel.col,
    };
  }
  if (sel.kind === 'rect') {
    return {
      row1: Math.min(sel.row1, sel.row2),
      col1: Math.min(sel.col1, sel.col2),
      row2: Math.max(sel.row1, sel.row2),
      col2: Math.max(sel.col1, sel.col2),
    };
  }
  return null;
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {TableSelection} sel
 */
function clearTableSelection(parsed, sel) {
  const b = selectionBounds(sel);
  if (!b) return;
  const maxRow = parsed.rows.length - 1;
  const maxCol = parsed.headers.length - 1;
  const row2 = b.row2 === Number.MAX_SAFE_INTEGER ? maxRow : b.row2;
  const col2 = b.col2 === Number.MAX_SAFE_INTEGER ? maxCol : b.col2;
  for (let r = b.row1; r <= row2; r++) {
    for (let c = b.col1; c <= col2; c++) {
      setCellAt(parsed, r, c, '');
    }
  }
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {TableSelection} sel
 * @returns {string}
 */
function extractTableTSV(parsed, sel) {
  const b = selectionBounds(sel);
  if (!b) return '';
  const maxRow = parsed.rows.length - 1;
  const maxCol = parsed.headers.length - 1;
  const row2 = b.row2 === Number.MAX_SAFE_INTEGER ? maxRow : b.row2;
  const col2 = b.col2 === Number.MAX_SAFE_INTEGER ? maxCol : b.col2;
  const lines = [];
  for (let r = b.row1; r <= row2; r++) {
    const cells = [];
    for (let c = b.col1; c <= col2; c++) {
      cells.push(cellAt(parsed, r, c));
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

/**
 * @param {string} tsv
 * @returns {string[][]}
 */
function parseClipboardTable(tsv) {
  const text = String(tsv || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text) return [];
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i].split('\t'));
  }
  return out;
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {number} startRow -1=表头
 * @param {number} startCol
 * @param {string} tsv
 */
function pasteTableTSV(parsed, startRow, startCol, tsv) {
  const grid = parseClipboardTable(tsv);
  if (!grid.length) return;
  for (let r = 0; r < grid.length; r++) {
    const targetRow = startRow + r;
    if (targetRow >= 0) {
      while (parsed.rows.length <= targetRow) {
        insertTableRow(parsed, parsed.rows.length, 'before');
      }
    }
    for (let c = 0; c < grid[r].length; c++) {
      const targetCol = startCol + c;
      while (parsed.headers.length <= targetCol) {
        insertTableColumn(parsed, parsed.headers.length, 'before');
      }
      setCellAt(parsed, targetRow, targetCol, grid[r][c]);
    }
  }
}

/**
 * @param {TableSelection} sel
 * @returns {{ row: number, col: number } | null}
 */
function selectionAnchor(sel) {
  const b = selectionBounds(sel);
  if (!b) return null;
  return { row: b.row1, col: b.col1 };
}

module.exports = {
  cloneTableData: cloneTableData,
  insertTableRow: insertTableRow,
  insertTableColumn: insertTableColumn,
  deleteTableRow: deleteTableRow,
  deleteTableColumn: deleteTableColumn,
  clearTableSelection: clearTableSelection,
  extractTableTSV: extractTableTSV,
  pasteTableTSV: pasteTableTSV,
  parseClipboardTable: parseClipboardTable,
  selectionBounds: selectionBounds,
  selectionAnchor: selectionAnchor,
  cellAt: cellAt,
  setCellAt: setCellAt,
};

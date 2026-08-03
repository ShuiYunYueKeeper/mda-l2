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
 * 整列选区（含 gutter 拖选多列）：覆盖表头到末行。
 * @param {TableSelection} sel
 */
function isFullColumnSelection(sel) {
  const b = selectionBounds(sel);
  if (!b) return false;
  return b.row1 === -1 && b.row2 === Number.MAX_SAFE_INTEGER;
}

/**
 * 整行选区（含 gutter 拖选多行）：覆盖整行所有列。
 * @param {TableSelection} sel
 */
function isFullRowSelection(sel) {
  const b = selectionBounds(sel);
  if (!b) return false;
  return b.col1 === 0 && b.col2 === Number.MAX_SAFE_INTEGER;
}

/**
 * 选区覆盖整张表（表头+全部正文行+全部列）→ 删除应整表移除，勿留最后一列。
 * @param {{ headers: string[], rows: string[][] }} parsed
 * @param {TableSelection} sel
 */
function isEntireTableSelection(parsed, sel) {
  if (!parsed || !parsed.headers || !parsed.headers.length) return false;
  const b = selectionBounds(sel);
  if (!b) return false;
  const maxCol = parsed.headers.length - 1;
  const maxRow = Math.max(0, (parsed.rows || []).length - 1);
  const col2 = b.col2 === Number.MAX_SAFE_INTEGER ? maxCol : b.col2;
  const row2 = b.row2 === Number.MAX_SAFE_INTEGER ? maxRow : b.row2;
  if (b.row1 !== -1) return false;
  if (b.col1 > 0 || col2 < maxCol) return false;
  if ((parsed.rows || []).length === 0) return col2 >= maxCol;
  return row2 >= maxRow;
}

/**
 * @param {string} s
 */
function escapeHtmlCell(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} cell
 */
function escapeMdCell(cell) {
  return String(cell == null ? '' : cell)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

/**
 * @param {string[]} cells
 */
function formatMdRow(cells) {
  return '| ' + cells.map(escapeMdCell).join(' | ') + ' |';
}

/**
 * @param {string[]} aligns
 */
function formatMdSep(aligns) {
  return (
    '| ' +
    aligns
      .map(function (a) {
        if (a === 'center') return ':---:';
        if (a === 'right') return '---:';
        return '---';
      })
      .join(' | ') +
    ' |'
  );
}

/**
 * 供剪贴板 text/plain：粘贴到 CM6 正文时成为 GFM 表格（再渲染为表格 widget）。
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {TableSelection} sel
 * @returns {string}
 */
function extractTableMarkdown(parsed, sel) {
  const b = selectionBounds(sel);
  if (!b) return '';
  const maxRow = parsed.rows.length - 1;
  const maxCol = parsed.headers.length - 1;
  const row2 = b.row2 === Number.MAX_SAFE_INTEGER ? maxRow : b.row2;
  const col2 = b.col2 === Number.MAX_SAFE_INTEGER ? maxCol : b.col2;
  const cols = [];
  for (let c = b.col1; c <= col2; c++) cols.push(c);
  if (!cols.length) return '';

  /** @type {string[]} */
  let headers;
  /** @type {string[]} */
  let aligns;
  /** @type {string[][]} */
  const body = [];

  if (b.row1 === -1) {
    headers = cols.map(function (c) {
      return cellAt(parsed, -1, c);
    });
    aligns = cols.map(function (c) {
      return (parsed.aligns && parsed.aligns[c]) || 'left';
    });
    for (let r = 0; r <= row2; r++) {
      body.push(
        cols.map(function (c) {
          return cellAt(parsed, r, c);
        })
      );
    }
  } else {
    headers = cols.map(function () {
      return '';
    });
    aligns = cols.map(function (c) {
      return (parsed.aligns && parsed.aligns[c]) || 'left';
    });
    for (let r = b.row1; r <= row2; r++) {
      body.push(
        cols.map(function (c) {
          return cellAt(parsed, r, c);
        })
      );
    }
  }

  const lines = [formatMdRow(headers), formatMdSep(aligns)];
  for (let i = 0; i < body.length; i++) lines.push(formatMdRow(body[i]));
  return lines.join('\n');
}

/**
 * 供剪贴板 text/html：粘贴到 Word/WPS/Excel 时保持表格结构。
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {TableSelection} sel
 * @returns {string}
 */
function extractTableHtml(parsed, sel) {
  const b = selectionBounds(sel);
  if (!b) return '';
  const maxRow = parsed.rows.length - 1;
  const maxCol = parsed.headers.length - 1;
  const row2 = b.row2 === Number.MAX_SAFE_INTEGER ? maxRow : b.row2;
  const col2 = b.col2 === Number.MAX_SAFE_INTEGER ? maxCol : b.col2;
  const parts = ['<table>'];
  for (let r = b.row1; r <= row2; r++) {
    parts.push('<tr>');
    for (let c = b.col1; c <= col2; c++) {
      const tag = r === -1 ? 'th' : 'td';
      parts.push('<' + tag + '>' + escapeHtmlCell(cellAt(parsed, r, c)) + '</' + tag + '>');
    }
    parts.push('</tr>');
  }
  parts.push('</table>');
  return parts.join('');
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
 * @param {string} tsvOrMd
 * @returns {string[][]}
 */
function parseClipboardTable(tsvOrMd) {
  const text = String(tsvOrMd || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return [];

  // GFM 表格：粘贴正文 / 表内互贴
  const mdLines = text.split('\n').filter(function (l) {
    return l.trim().length > 0;
  });
  if (
    mdLines.length >= 2 &&
    /^\s*\|/.test(mdLines[0]) &&
    /^\s*\|?\s*:?-{3,}/.test(mdLines[1].replace(/\|/g, '|'))
  ) {
    const sepLooks =
      mdLines[1].indexOf('---') >= 0 || mdLines[1].indexOf(':--') >= 0 || mdLines[1].indexOf('--:') >= 0;
    if (sepLooks) {
      const splitMd = function (line) {
        let s = String(line || '').trim();
        if (s.charAt(0) === '|') s = s.slice(1);
        if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
        return s.split('|').map(function (c) {
          return c.replace(/^\s+|\s+$/g, '').replace(/\\\|/g, '|');
        });
      };
      const headers = splitMd(mdLines[0]);
      const out = [headers];
      for (let i = 2; i < mdLines.length; i++) {
        const cells = splitMd(mdLines[i]);
        while (cells.length < headers.length) cells.push('');
        out.push(cells.slice(0, Math.max(headers.length, cells.length)));
      }
      return out;
    }
  }

  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('\t') >= 0) {
      out.push(lines[i].split('\t'));
    } else {
      out.push([lines[i]]);
    }
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

/**
 * @param {string} text
 * @returns {boolean}
 */
function clipboardLooksLikeGfmTable(text) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(function (l) {
      return l.trim().length > 0;
    });
  if (lines.length < 2) return false;
  if (!/^\s*\|/.test(lines[0])) return false;
  return lines[1].indexOf('---') >= 0;
}

/**
 * CM6 粘贴：优先 text/plain 的 GFM 表格，避免 HTML 被摊成「单元格空格拼接」丢列。
 * @returns {(event: ClipboardEvent, view: import('@codemirror/view').EditorView) => boolean}
 */
function createTableMarkdownPasteHandler() {
  return function (event, view) {
    if (!event || !view || !event.clipboardData) return false;
    const plain = event.clipboardData.getData('text/plain') || '';
    if (!clipboardLooksLikeGfmTable(plain)) return false;
    event.preventDefault();
    const insert = String(plain).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\n+|\n+$/g, '');
    const sel = view.state.selection.main;
    const before = sel.from > 0 ? view.state.doc.sliceString(sel.from - 1, sel.from) : '\n';
    const after =
      sel.to < view.state.doc.length ? view.state.doc.sliceString(sel.to, sel.to + 1) : '\n';
    const prefix = before === '\n' ? '' : '\n';
    const suffix = after === '\n' ? '\n' : '\n\n';
    const text = prefix + insert + suffix;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection: { anchor: sel.from + text.length },
      userEvent: 'input.paste',
    });
    return true;
  };
}

module.exports = {
  cloneTableData: cloneTableData,
  insertTableRow: insertTableRow,
  insertTableColumn: insertTableColumn,
  deleteTableRow: deleteTableRow,
  deleteTableColumn: deleteTableColumn,
  clearTableSelection: clearTableSelection,
  extractTableTSV: extractTableTSV,
  extractTableHtml: extractTableHtml,
  extractTableMarkdown: extractTableMarkdown,
  pasteTableTSV: pasteTableTSV,
  parseClipboardTable: parseClipboardTable,
  selectionBounds: selectionBounds,
  selectionAnchor: selectionAnchor,
  isFullColumnSelection: isFullColumnSelection,
  isFullRowSelection: isFullRowSelection,
  isEntireTableSelection: isEntireTableSelection,
  clipboardLooksLikeGfmTable: clipboardLooksLikeGfmTable,
  createTableMarkdownPasteHandler: createTableMarkdownPasteHandler,
  cellAt: cellAt,
  setCellAt: setCellAt,
};

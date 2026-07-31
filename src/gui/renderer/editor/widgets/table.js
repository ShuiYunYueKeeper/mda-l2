'use strict';

const {
  parseGfmTable,
  serializeGfmTable,
  readTableFromDom,
} = require('../model/parse-table');
const { BlockReplaceWidget, DEFAULT_LINE_HEIGHT } = require('./block-widget-base');

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @returns {HTMLTableElement}
 */
function buildTableElement(parsed) {
  const table = document.createElement('table');
  table.className = 'mda-cm-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (let i = 0; i < parsed.headers.length; i++) {
    const th = document.createElement('th');
    th.setAttribute('contenteditable', 'true');
    th.setAttribute('spellcheck', 'true');
    th.textContent = parsed.headers[i];
    const align = parsed.aligns[i] || 'left';
    if (align !== 'left') th.style.textAlign = align;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (let r = 0; r < parsed.rows.length; r++) {
    const tr = document.createElement('tr');
    const row = parsed.rows[r];
    for (let c = 0; c < parsed.headers.length; c++) {
      const td = document.createElement('td');
      td.setAttribute('contenteditable', 'true');
      td.setAttribute('spellcheck', 'true');
      td.textContent = row[c] != null ? row[c] : '';
      const align = parsed.aligns[c] || 'left';
      if (align !== 'left') td.style.textAlign = align;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {TableWidget} widget
 * @param {HTMLElement} root
 */
function syncTableToDoc(view, widget, root) {
  const table = root.querySelector('table');
  const parsed = readTableFromDom(table);
  if (!parsed || !view) return;
  const newSource = serializeGfmTable(parsed);
  const blockText = view.state.doc.sliceString(widget.from, widget.to);
  const trailing = blockText.endsWith('\n') ? '\n' : '';
  const normalizedOld = widget.source.replace(/\r\n/g, '\n').replace(/\n$/, '');
  if (newSource === normalizedOld) return;
  widget.source = newSource;
  view.dispatch({
    changes: { from: widget.from, to: widget.to, insert: newSource + trailing },
  });
}

/**
 * @param {HTMLElement} cell
 * @param {HTMLTableElement} table
 * @param {number} delta
 */
function focusAdjacentCell(cell, table, delta) {
  const cells = table.querySelectorAll('th[contenteditable], td[contenteditable]');
  let idx = -1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === cell) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return;
  const next = cells[idx + delta];
  if (!next) return;
  next.focus();
  const range = document.createRange();
  range.selectNodeContents(next);
  range.collapse(false);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * @param {HTMLTableElement} table
 * @param {import('@codemirror/view').EditorView} view
 * @param {TableWidget} widget
 * @param {HTMLElement} root
 */
function wireTableEditing(table, view, widget, root) {
  const cells = table.querySelectorAll('th[contenteditable], td[contenteditable]');
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    cell.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
    cell.addEventListener('focus', function (e) {
      e.stopPropagation();
    });
    cell.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        focusAdjacentCell(cell, table, e.shiftKey ? -1 : 1);
      }
    });
    cell.addEventListener('blur', function () {
      syncTableToDoc(view, widget, root);
    });
  }
}

class TableWidget extends BlockReplaceWidget {
  /**
   * @param {string} source
   * @param {{ from?: number, to?: number, lineHeight?: number }} [opts]
   */
  constructor(source, opts) {
    super(source, opts);
    this.opts = opts || {};
    const parsed = parseGfmTable(this.source);
    const rowCount = parsed ? 1 + parsed.rows.length : this._lineCount;
    this._minHeight = Math.max(rowCount * 36 + 16, this._lineCount * DEFAULT_LINE_HEIGHT);
  }
  get estimatedHeight() {
    if (this._measured > 0) return this._measured;
    const parsed = parseGfmTable(this.source);
    if (parsed) {
      const rows = 1 + parsed.rows.length;
      return Math.max(rows * 36 + 16, this._lineCount * this._lineHeight);
    }
    return super.estimatedHeight;
  }
  eq(other) {
    return other instanceof TableWidget && other.source === this.source;
  }
  toDOM(view) {
    const self = this;
    const root = document.createElement('div');
    root.className = 'mda-cm-table-block';
    root.setAttribute('contenteditable', 'false');

    const parsed = parseGfmTable(this.source);
    if (parsed) {
      const wrap = document.createElement('div');
      wrap.className = 'mda-cm-table-wrap table-wrap';
      const table = buildTableElement(parsed);
      wrap.appendChild(table);
      root.appendChild(wrap);
      wireTableEditing(table, view, self, root);
    } else {
      const fallback = document.createElement('pre');
      fallback.className = 'mda-cm-table-fallback';
      fallback.textContent = this.source;
      root.appendChild(fallback);
    }

    root.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });

    this.bindMeasure(view, root);
    return root;
  }
}

module.exports = {
  TableWidget: TableWidget,
  buildTableElement: buildTableElement,
  syncTableToDoc: syncTableToDoc,
};

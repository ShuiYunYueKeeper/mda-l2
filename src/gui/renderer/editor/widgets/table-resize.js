/**
 * 表格列宽 / 行高拖拽调整。
 * 默认：表格铺满预览区宽度；仅在用户拖拽或源码含 @mda-table meta 时锁定像素尺寸。
 */
'use strict';

const { hasTableLayoutMeta, MAX_TABLE_COL_WIDTH, MAX_TABLE_ROW_HEIGHT } = require('../model/parse-table');

const MIN_COL_WIDTH = 48;
const MIN_ROW_HEIGHT = 28;

function capLayout(n, max) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(Math.round(v), max);
}

/**
 * @param {{ headers: string[], rows: string[][], colWidths?: number[], rowHeights?: number[] }} parsed
 */
function ensureLayoutArrays(parsed) {
  if (!parsed.colWidths) parsed.colWidths = [];
  if (!parsed.rowHeights) parsed.rowHeights = [];
  const ncol = parsed.headers.length;
  const nrow = 1 + parsed.rows.length;
  while (parsed.colWidths.length < ncol) parsed.colWidths.push(0);
  while (parsed.rowHeights.length < nrow) parsed.rowHeights.push(0);
  if (parsed.colWidths.length > ncol) parsed.colWidths.length = ncol;
  if (parsed.rowHeights.length > nrow) parsed.rowHeights.length = nrow;
}

/**
 * @param {HTMLElement | null} wrap
 */
function clearTableWrapLayout(wrap) {
  if (!wrap) return;
  wrap.removeAttribute('data-mda-snap');
  wrap.removeAttribute('data-mda-overflow');
  wrap.classList.remove('mda-cm-table-resizing-active');
  wrap.style.width = '';
  wrap.style.maxWidth = '';
}

/**
 * @param {HTMLElement | null} wrap
 * @param {HTMLTableElement} table
 * @param {number} totalW
 */
function syncTableWrapLayout(wrap, table, totalW) {
  if (!wrap || !table) return;
  wrap.setAttribute('data-mda-snap', '1');
  const parent = wrap.parentElement;
  const limit = parent ? parent.clientWidth : 0;
  if (limit > 0 && totalW > limit + 1) {
    wrap.setAttribute('data-mda-overflow', '1');
    wrap.style.width = '100%';
    wrap.style.maxWidth = '100%';
  } else {
    wrap.removeAttribute('data-mda-overflow');
    wrap.style.width = totalW + 'px';
    wrap.style.maxWidth = '100%';
  }
}

/**
 * @param {HTMLTableElement} table
 * @param {HTMLElement | null} [wrap]
 */
function clearTableLayout(table, wrap) {
  if (!table) return;
  table.style.tableLayout = '';
  table.style.width = '';
  table.style.height = '';
  table.style.minWidth = '';
  table.style.maxWidth = '';
  table.removeAttribute('data-mda-layout');
  const cells = table.querySelectorAll('th, td');
  for (let i = 0; i < cells.length; i++) {
    cells[i].style.width = '';
    cells[i].style.minWidth = '';
    cells[i].style.maxWidth = '';
    cells[i].style.height = '';
    cells[i].style.boxSizing = '';
  }
  const rows = table.querySelectorAll('tr');
  for (let r = 0; r < rows.length; r++) rows[r].style.height = '';
  clearTableWrapLayout(wrap || table.parentElement);
}

/**
 * @param {HTMLTableElement} table
 * @param {{ headers: string[], rows: string[][], colWidths?: number[], rowHeights?: number[] }} parsed
 */
function captureLayoutFromTable(table, parsed) {
  if (!table || !parsed) return;
  ensureLayoutArrays(parsed);
  const ths = table.querySelectorAll('thead th');
  for (let c = 0; c < ths.length; c++) {
    parsed.colWidths[c] = capLayout(
      Math.max(MIN_COL_WIDTH, ths[c].getBoundingClientRect().width),
      MAX_TABLE_COL_WIDTH
    );
  }
  const headerRow = table.querySelector('thead tr');
  const bodyRows = table.querySelectorAll('tbody tr');
  const visualRows = [];
  if (headerRow) visualRows.push(headerRow);
  for (let i = 0; i < bodyRows.length; i++) visualRows.push(bodyRows[i]);
  for (let r = 0; r < visualRows.length; r++) {
    parsed.rowHeights[r] = capLayout(
      Math.max(MIN_ROW_HEIGHT, visualRows[r].getBoundingClientRect().height),
      MAX_TABLE_ROW_HEIGHT
    );
  }
  table.setAttribute('data-mda-layout', 'fixed');
}

/**
 * @param {HTMLTableElement} table
 * @param {{ headers: string[], rows: string[][], colWidths?: number[], rowHeights?: number[] }} parsed
 * @param {HTMLElement | null} [wrap]
 * @returns {number} totalW
 */
function applyTableLayout(table, parsed, wrap) {
  wrap = wrap || table.parentElement;
  if (!table || !parsed || !hasTableLayoutMeta(parsed)) {
    clearTableLayout(table, wrap);
    return 0;
  }
  ensureLayoutArrays(parsed);
  table.setAttribute('data-mda-layout', 'fixed');
  table.style.tableLayout = 'fixed';
  table.style.width = 'auto';
  table.style.minWidth = '0';
  table.style.maxWidth = 'none';

  const ths = table.querySelectorAll('thead th');
  let totalW = 0;
  for (let c = 0; c < ths.length; c++) {
    const w = capLayout(Math.max(MIN_COL_WIDTH, parsed.colWidths[c] || MIN_COL_WIDTH), MAX_TABLE_COL_WIDTH);
    parsed.colWidths[c] = w;
    totalW += w;
    const cells = table.querySelectorAll(
      'thead th[data-mda-col="' + c + '"], tbody td[data-mda-col="' + c + '"]'
    );
    for (let i = 0; i < cells.length; i++) {
      cells[i].style.width = w + 'px';
      cells[i].style.minWidth = w + 'px';
      cells[i].style.maxWidth = w + 'px';
      cells[i].style.boxSizing = 'border-box';
    }
  }
  table.style.width = totalW + 'px';

  const headerRow = table.querySelector('thead tr');
  const bodyRows = table.querySelectorAll('tbody tr');
  const visualRows = [];
  if (headerRow) visualRows.push(headerRow);
  for (let i = 0; i < bodyRows.length; i++) visualRows.push(bodyRows[i]);
  let totalH = 0;
  for (let r = 0; r < visualRows.length; r++) {
    const h = capLayout(Math.max(MIN_ROW_HEIGHT, parsed.rowHeights[r] || MIN_ROW_HEIGHT), MAX_TABLE_ROW_HEIGHT);
    parsed.rowHeights[r] = h;
    totalH += h;
    const row = visualRows[r];
    row.style.height = h + 'px';
    const cells = row.querySelectorAll('th, td');
    for (let i = 0; i < cells.length; i++) {
      cells[i].style.height = h + 'px';
      cells[i].style.boxSizing = 'border-box';
    }
  }
  table.style.height = totalH + 'px';
  syncTableWrapLayout(wrap, table, totalW);
  return totalW;
}

/**
 * @param {HTMLElement} wrap
 * @param {HTMLTableElement} table
 * @param {{
 *   getParsed: () => object,
 *   onLayoutCommit?: (parsed: object) => void,
 *   t?: Function,
 * }} ctx
 */
function attachTableGridResize(wrap, table, ctx) {
  const overlay = document.createElement('div');
  overlay.className = 'mda-cm-table-resize-layer';
  overlay.setAttribute('aria-hidden', 'true');
  wrap.appendChild(overlay);

  /** @type {{ kind: 'col', col: number, startX: number, startW: number } | { kind: 'row', row: number, startY: number, startH: number } | null} */
  let dragging = null;
  let layoutCaptured = false;

  /** @type {HTMLElement | null} */
  let activeHandle = null;

  function rebuildHandles() {
    overlay.innerHTML = '';
    if (!table.isConnected || !wrap.isConnected) return;
    const wrapRect = wrap.getBoundingClientRect();
    const layerW = table.offsetWidth || wrapRect.width;
    const ths = table.querySelectorAll('thead th');
    for (let c = 0; c < ths.length; c++) {
      const rect = ths[c].getBoundingClientRect();
      const handle = document.createElement('div');
      handle.className = 'mda-cm-table-col-resize-handle';
      handle.dataset.col = String(c);
      handle.setAttribute('data-i18n-title', 'widgetTableResizeCol');
      if (ctx.t) handle.title = ctx.t('widgetTableResizeCol');
      handle.style.left = rect.right - wrapRect.left - 4 + 'px';
      handle.style.top = '0';
      handle.style.height = wrapRect.height + 'px';
      overlay.appendChild(handle);
    }
    const rows = table.querySelectorAll('tr');
    for (let r = 0; r < rows.length; r++) {
      const rect = rows[r].getBoundingClientRect();
      const handle = document.createElement('div');
      handle.className = 'mda-cm-table-row-resize-handle';
      handle.dataset.row = String(r);
      handle.setAttribute('data-i18n-title', 'widgetTableResizeRow');
      if (ctx.t) handle.title = ctx.t('widgetTableResizeRow');
      handle.style.top = rect.bottom - wrapRect.top - 4 + 'px';
      handle.style.left = '0';
      handle.style.width = layerW + 'px';
      overlay.appendChild(handle);
    }
  }

  function ensureCaptured() {
    if (layoutCaptured) return;
    const parsed = ctx.getParsed();
    captureLayoutFromTable(table, parsed);
    applyTableLayout(table, parsed, wrap);
    layoutCaptured = true;
    rebuildHandles();
  }

  overlay.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    const colHandle =
      e.target && e.target.closest ? e.target.closest('.mda-cm-table-col-resize-handle') : null;
    const rowHandle =
      e.target && e.target.closest ? e.target.closest('.mda-cm-table-row-resize-handle') : null;
    if (!colHandle && !rowHandle) return;
    e.preventDefault();
    e.stopPropagation();
    ensureCaptured();
    const parsed = ctx.getParsed();
    wrap.classList.add('mda-cm-table-resizing-active');
    if (colHandle) {
      const col = parseInt(colHandle.getAttribute('data-col') || '0', 10);
      activeHandle = colHandle;
      activeHandle.classList.add('mda-cm-table-resize-dragging');
      const th = table.querySelectorAll('thead th')[col];
      const startW = th
        ? th.getBoundingClientRect().width
        : parsed.colWidths[col] || MIN_COL_WIDTH;
      dragging = { kind: 'col', col: col, startX: e.clientX, startW: startW };
      document.body.classList.add('mda-cm-table-resizing-col');
    } else if (rowHandle) {
      const row = parseInt(rowHandle.getAttribute('data-row') || '0', 10);
      activeHandle = rowHandle;
      activeHandle.classList.add('mda-cm-table-resize-dragging');
      const tr = table.querySelectorAll('tr')[row];
      const startH = tr
        ? tr.getBoundingClientRect().height
        : parsed.rowHeights[row] || MIN_ROW_HEIGHT;
      dragging = { kind: 'row', row: row, startY: e.clientY, startH: startH };
      document.body.classList.add('mda-cm-table-resizing-row');
    }
    document.body.classList.add('mda-cm-table-resizing');
  });

  function onMove(e) {
    if (!dragging) return;
    const parsed = ctx.getParsed();
    if (dragging.kind === 'col') {
      const nw = Math.max(
        MIN_COL_WIDTH,
        Math.round(dragging.startW + (e.clientX - dragging.startX))
      );
      parsed.colWidths[dragging.col] = nw;
      applyTableLayout(table, parsed, wrap);
      rebuildHandles();
      if (activeHandle) activeHandle.classList.add('mda-cm-table-resize-dragging');
    } else {
      const nh = Math.max(
        MIN_ROW_HEIGHT,
        Math.round(dragging.startH + (e.clientY - dragging.startY))
      );
      parsed.rowHeights[dragging.row] = nh;
      applyTableLayout(table, parsed, wrap);
      rebuildHandles();
      if (activeHandle) activeHandle.classList.add('mda-cm-table-resize-dragging');
    }
  }

  function endDrag() {
    if (activeHandle) {
      activeHandle.classList.remove('mda-cm-table-resize-dragging');
      activeHandle = null;
    }
    wrap.classList.remove('mda-cm-table-resizing-active');
    document.body.classList.remove('mda-cm-table-resizing');
    document.body.classList.remove('mda-cm-table-resizing-col', 'mda-cm-table-resizing-row');
  }

  function onUp() {
    if (!dragging) return;
    dragging = null;
    endDrag();
    if (typeof ctx.onLayoutCommit === 'function') {
      ctx.onLayoutCommit(ctx.getParsed());
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  return {
    applyLayout: function (parsed) {
      layoutCaptured = hasTableLayoutMeta(parsed);
      if (layoutCaptured) applyTableLayout(table, parsed, wrap);
      else clearTableLayout(table, wrap);
      rebuildHandles();
    },
    rebuildHandles: rebuildHandles,
    dispose: function () {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      endDrag();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },
  };
}

module.exports = {
  attachTableGridResize: attachTableGridResize,
  applyTableLayout: applyTableLayout,
  clearTableLayout: clearTableLayout,
  clearTableWrapLayout: clearTableWrapLayout,
  syncTableWrapLayout: syncTableWrapLayout,
  captureLayoutFromTable: captureLayoutFromTable,
  ensureLayoutArrays: ensureLayoutArrays,
};

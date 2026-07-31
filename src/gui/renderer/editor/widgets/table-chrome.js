/**
 * M8-C3 表格竞品式交互：行/列选区、增删、剪贴板、右键菜单。
 */
'use strict';

const {
  cloneTableData,
  insertTableRow,
  insertTableColumn,
  deleteTableRow,
  deleteTableColumn,
  clearTableSelection,
  extractTableTSV,
  pasteTableTSV,
  selectionAnchor,
  selectionBounds,
} = require('../model/table-model');
const { copyText, uiT } = require('./widget-common');
const { attachTableGridResize, applyTableLayout, ensureLayoutArrays } = require('./table-resize');
const { hasTableLayoutMeta } = require('../model/parse-table');
const {
  setTableLayoutSession,
  applyTableLayoutSession,
  migrateTableLayoutSession,
} = require('./table-layout-session');

/** @type {string} */
let internalClipboard = '';

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @returns {HTMLTableElement}
 */
function renderTableElement(parsed) {
  const table = document.createElement('table');
  table.className = 'mda-cm-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.setAttribute('data-mda-row', '-1');
  for (let i = 0; i < parsed.headers.length; i++) {
    const th = document.createElement('th');
    th.setAttribute('contenteditable', 'true');
    th.setAttribute('spellcheck', 'true');
    th.setAttribute('data-mda-row', '-1');
    th.setAttribute('data-mda-col', String(i));
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
    tr.setAttribute('data-mda-row', String(r));
    const row = parsed.rows[r];
    for (let c = 0; c < parsed.headers.length; c++) {
      const td = document.createElement('td');
      td.setAttribute('contenteditable', 'true');
      td.setAttribute('spellcheck', 'true');
      td.setAttribute('data-mda-row', String(r));
      td.setAttribute('data-mda-col', String(c));
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
 * @param {HTMLElement} table
 * @param {import('../model/table-model').TableSelection} selection
 */
function applySelectionHighlight(table, selection) {
  const cells = table.querySelectorAll('th, td');
  for (let i = 0; i < cells.length; i++) {
    cells[i].classList.remove('mda-cm-table-cell-selected');
  }
  const b = selectionBounds(selection);
  if (!b || !table) return;
  const maxCol = table.querySelectorAll('thead th').length - 1;
  const maxRow = table.querySelectorAll('tbody tr').length - 1;
  const row2 = b.row2 === Number.MAX_SAFE_INTEGER ? maxRow : b.row2;
  const col2 = b.col2 === Number.MAX_SAFE_INTEGER ? maxCol : b.col2;
  for (let r = b.row1; r <= row2; r++) {
    for (let c = b.col1; c <= col2; c++) {
      const cell = table.querySelector(
        (r === -1 ? 'thead th' : 'tbody td') + '[data-mda-col="' + c + '"]' +
          (r === -1 ? '' : '[data-mda-row="' + r + '"]')
      );
      if (cell) cell.classList.add('mda-cm-table-cell-selected');
    }
  }
}

/**
 * @param {HTMLElement} host
 * @param {{ items: { id: string, i18nKey: string, disabled?: boolean }[] }} spec
 * @param {(id: string) => void} onAction
 * @param {(key: string) => string} t
 */
function openTableMenu(host, spec, onAction, t) {
  closeTableMenu();
  const menu = document.createElement('div');
  menu.className = 'mda-cm-table-menu';
  menu.setAttribute('role', 'menu');
  for (let i = 0; i < spec.items.length; i++) {
    const item = spec.items[i];
    if (item.id === '---') {
      const sep = document.createElement('div');
      sep.className = 'mda-cm-table-menu-sep';
      menu.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mda-cm-table-menu-item';
    btn.dataset.action = item.id;
    btn.dataset.i18nKey = item.i18nKey;
    btn.textContent = uiT(item.i18nKey, t);
    btn.disabled = !!item.disabled;
    btn.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      closeTableMenu();
      onAction(item.id);
    });
    menu.appendChild(btn);
  }
  host.appendChild(menu);
  menu.addEventListener('mousedown', function (e) {
    e.stopPropagation();
  });
  requestAnimationFrame(function () {
    const rect = host.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = Math.min(spec.x - rect.left, rect.width - menuRect.width - 4);
    let top = Math.min(spec.y - rect.top, rect.height - menuRect.height - 4);
    if (left < 4) left = 4;
    if (top < 4) top = 4;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  });
}

function closeTableMenu() {
  if (typeof document === 'undefined') return;
  const menus = document.querySelectorAll('.mda-cm-table-menu');
  for (let i = 0; i < menus.length; i++) menus[i].remove();
}

/**
 * @param {{
 *   view: import('@codemirror/view').EditorView,
 *   widget: { from: number, to: number, source: string },
 *   root: HTMLElement,
 *   parsed: { headers: string[], aligns: string[], rows: string[][] },
 *   t?: Function,
 *   copyFn?: Function,
 *   onParsedChange: (parsed: object) => void,
 *   readParsedFromDom: () => object | null,
 *   blockSource?: string,
 *   onDeleteTable?: () => void,
 * }} ctx
 */
function mountTableChrome(ctx) {
  const t = ctx.t;
  const stage = document.createElement('div');
  stage.className = 'mda-cm-table-stage';

  const grid = document.createElement('div');
  grid.className = 'mda-cm-table-grid';

  const body = document.createElement('div');
  body.className = 'mda-cm-table-body';

  const tableWrap = document.createElement('div');
  tableWrap.className = 'mda-cm-table-wrap table-wrap';

  const colGutterClip = document.createElement('div');
  colGutterClip.className = 'mda-cm-table-col-gutter-clip';
  colGutterClip.setAttribute('aria-hidden', 'true');

  const colGutter = document.createElement('div');
  colGutter.className = 'mda-cm-table-col-gutter';

  const chrome = document.createElement('div');
  chrome.className = 'mda-cm-table-chrome';
  chrome.setAttribute('aria-hidden', 'true');

  const rowGutter = document.createElement('div');
  rowGutter.className = 'mda-cm-table-row-gutter';

  colGutterClip.appendChild(colGutter);

  const addColBtn = document.createElement('button');
  addColBtn.type = 'button';
  addColBtn.className = 'mda-cm-table-add-btn mda-cm-table-add-col';
  addColBtn.setAttribute('data-i18n-title', 'widgetTableAddCol');
  addColBtn.title = uiT('widgetTableAddCol', t);
  addColBtn.textContent = '+';

  const addRowBtn = document.createElement('button');
  addRowBtn.type = 'button';
  addRowBtn.className = 'mda-cm-table-add-btn mda-cm-table-add-row';
  addRowBtn.setAttribute('data-i18n-title', 'widgetTableAddRow');
  addRowBtn.title = uiT('widgetTableAddRow', t);
  addRowBtn.textContent = '+';

  body.appendChild(tableWrap);
  chrome.appendChild(colGutterClip);
  chrome.appendChild(rowGutter);
  body.appendChild(chrome);
  grid.appendChild(body);
  grid.appendChild(addColBtn);
  grid.appendChild(addRowBtn);
  stage.appendChild(grid);

  let parsed = cloneTableData(ctx.parsed);
  applyTableLayoutSession(ctx.blockSource || '', parsed);
  /** @type {string} */
  let blockSource = ctx.blockSource || '';
  /** @type {import('../model/table-model').TableSelection} */
  let selection = { kind: 'none' };
  let dragAnchor = null;
  let mutating = false;
  /** @type {ReturnType<typeof attachTableGridResize> | null} */
  let resizeCtl = null;

  stage.setAttribute('tabindex', '-1');

  function syncFromDomIfNeeded() {
    if (mutating) return;
    const live = ctx.readParsedFromDom();
    if (!live) return;
    const prevColWidths = parsed.colWidths ? parsed.colWidths.slice() : null;
    const prevRowHeights = parsed.rowHeights ? parsed.rowHeights.slice() : null;
    parsed = live;
    if (!hasTableLayoutMeta(parsed)) {
      if (prevColWidths && prevColWidths.some(function (w) {
        return w > 0;
      })) {
        parsed.colWidths = prevColWidths;
      }
      if (prevRowHeights && prevRowHeights.some(function (h) {
        return h > 0;
      })) {
        parsed.rowHeights = prevRowHeights;
      }
    }
  }

  function syncGutterLayout(table) {
    if (!table) return;
    const tableW = table.offsetWidth;
    const wrapW = tableWrap.clientWidth;
    const wrapH = tableWrap.clientHeight;
    const scrollLeft = tableWrap.scrollLeft || 0;
    colGutterClip.style.width = wrapW + 'px';
    colGutter.style.width = tableW + 'px';
    colGutter.style.transform = 'translateX(' + -scrollLeft + 'px)';
    rowGutter.style.height = wrapH + 'px';
    const ths = table.querySelectorAll('thead th');
    const colBars = colGutter.querySelectorAll('.mda-cm-table-col-bar');
    for (let i = 0; i < ths.length; i++) {
      if (colBars[i]) {
        const rect = ths[i].getBoundingClientRect();
        const w = Math.max(0, Math.round(rect.width));
        colBars[i].style.width = w + 'px';
        colBars[i].style.flex = '0 0 ' + w + 'px';
      }
    }
    const headerRow = table.querySelector('thead tr');
    const headerBar = rowGutter.querySelector('[data-row="-1"]');
    if (headerRow && headerBar) headerBar.style.height = headerRow.offsetHeight + 'px';
    const trs = table.querySelectorAll('tbody tr');
    const rowBars = rowGutter.querySelectorAll('.mda-cm-table-row-bar:not([data-row="-1"])');
    for (let r = 0; r < trs.length; r++) {
      if (rowBars[r]) rowBars[r].style.height = trs[r].offsetHeight + 'px';
    }
  }

  function commitParsed() {
    const prevSource = blockSource;
    if (hasTableLayoutMeta(parsed)) {
      setTableLayoutSession(prevSource, parsed);
    }
    ctx.onParsedChange(cloneTableData(parsed));
    let newSource = prevSource;
    if (ctx.widget && ctx.widget.source) {
      newSource = String(ctx.widget.source || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n$/, '');
    }
    if (newSource !== prevSource) {
      migrateTableLayoutSession(prevSource, newSource);
    }
    blockSource = newSource;
    if (hasTableLayoutMeta(parsed)) {
      setTableLayoutSession(blockSource, parsed);
    }
  }

  function commitLayout() {
    /* 列宽/行高为会话态，不写回 Markdown（与图片宽度一致，不标脏） */
    setTableLayoutSession(blockSource, parsed);
  }

  function clearTableInteraction() {
    closeTableMenu();
    const active = document.activeElement;
    if (active && tableWrap.contains(active) && typeof active.blur === 'function') {
      active.blur();
    }
    if (typeof window.getSelection === 'function') {
      const domSel = window.getSelection();
      if (domSel && domSel.rangeCount) domSel.removeAllRanges();
    }
    setSelection({ kind: 'none' });
  }

  /** 结构变更：写文档并本地刷新，避免 CM 重建延迟导致「无反应」 */
  function mutate(fn) {
    mutating = true;
    try {
      syncFromDomIfNeeded();
      applyTableLayoutSession(blockSource, parsed);
      if (hasTableLayoutMeta(parsed)) ensureLayoutArrays(parsed);
      fn(parsed);
      commitParsed();
      if (ctx.root.isConnected) {
        renderLocal();
      }
    } finally {
      mutating = false;
    }
  }

  /** 仅刷新本地 DOM（不触发写回） */
  function renderLocal() {
    const old = tableWrap.querySelector('table');
    if (old) old.remove();
    const table = renderTableElement(parsed);
    tableWrap.appendChild(table);
    wireCells(table);
    rebuildGutters();
    applySelectionHighlight(table, selection);
    if (resizeCtl) resizeCtl.applyLayout(parsed);
    else applyTableLayout(table, parsed, tableWrap);
    if (hasTableLayoutMeta(parsed)) {
      setTableLayoutSession(blockSource, parsed);
    }
    if (resizeCtl) resizeCtl.rebuildHandles();
    requestAnimationFrame(function () {
      syncGutterLayout(table);
      if (resizeCtl) resizeCtl.rebuildHandles();
    });
    return table;
  }

  function rebuildGutters() {
    colGutter.innerHTML = '';
    for (let c = 0; c < parsed.headers.length; c++) {
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'mda-cm-table-col-bar';
      bar.dataset.col = String(c);
      bar.setAttribute('aria-label', uiT('widgetTableSelectCol', t, { n: c + 1 }));
      colGutter.appendChild(bar);
    }
    rowGutter.innerHTML = '';
    const headerBar = document.createElement('button');
    headerBar.type = 'button';
    headerBar.className = 'mda-cm-table-row-bar';
    headerBar.dataset.row = '-1';
    headerBar.setAttribute('aria-label', uiT('widgetTableHeaderRow', t));
    rowGutter.appendChild(headerBar);
    for (let r = 0; r < parsed.rows.length; r++) {
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'mda-cm-table-row-bar';
      bar.dataset.row = String(r);
      bar.setAttribute('aria-label', uiT('widgetTableSelectRow', t, { n: r + 1 }));
      rowGutter.appendChild(bar);
    }
  }

  function setSelection(sel) {
    selection = sel;
    const table = tableWrap.querySelector('table');
    if (table) applySelectionHighlight(table, selection);
    highlightGutters();
    const rowCol =
      sel.kind === 'row' || sel.kind === 'col' || sel.kind === 'rect';
    stage.classList.toggle('mda-cm-table-rowcol-focus', rowCol);
    if (rowCol) {
      stage.focus();
      if (typeof ctx.pinEditor === 'function') ctx.pinEditor();
    }
  }

  function handleDeleteKey(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return false;
    if (selection.kind === 'row' && selection.row >= 0) {
      e.preventDefault();
      e.stopPropagation();
      runMenuAction('delete-row');
      return true;
    }
    if (selection.kind === 'col') {
      e.preventDefault();
      e.stopPropagation();
      runMenuAction('delete-col');
      return true;
    }
    if (selection.kind === 'rect' || (selection.kind === 'cell' && e.key === 'Delete')) {
      const anchor = selectionAnchor(selection);
      if (!anchor) return false;
      const active = document.activeElement;
      const inCell =
        active &&
        active.closest &&
        active.closest('th[contenteditable], td[contenteditable]') &&
        tableWrap.contains(active);
      if (inCell && selection.kind === 'cell') return false;
      e.preventDefault();
      e.stopPropagation();
      runMenuAction('clear');
      return true;
    }
    return false;
  }

  function highlightGutters() {
    const colBars = colGutter.querySelectorAll('.mda-cm-table-col-bar');
    const rowBars = rowGutter.querySelectorAll('.mda-cm-table-row-bar');
    for (let i = 0; i < colBars.length; i++) colBars[i].classList.remove('mda-cm-table-gutter-active');
    for (let i = 0; i < rowBars.length; i++) rowBars[i].classList.remove('mda-cm-table-gutter-active');
    if (selection.kind === 'col') {
      const bar = colGutter.querySelector('[data-col="' + selection.col + '"]');
      if (bar) bar.classList.add('mda-cm-table-gutter-active');
    }
    if (selection.kind === 'row') {
      const bar = rowGutter.querySelector('[data-row="' + selection.row + '"]');
      if (bar) bar.classList.add('mda-cm-table-gutter-active');
    }
  }

  function menuItems() {
    const hasSel = selection.kind !== 'none';
    const anchor = selectionAnchor(selection);
    const isBodyRow = selection.kind === 'row' && selection.row >= 0;
    const canDeleteRow = isBodyRow && parsed.rows.length > 0;
    const canDeleteCol = selection.kind === 'col' && parsed.headers.length > 1;
    const items = [];

    if (hasSel) {
      items.push({ id: 'copy', i18nKey: 'copyBtn' });
      items.push({ id: 'cut', i18nKey: 'widgetTableCut' });
    }
    if (anchor) {
      items.push({ id: 'paste', i18nKey: 'widgetTablePaste' });
    }

    if (selection.kind === 'row') {
      if (items.length) items.push({ id: '---' });
      items.push({ id: 'insert-row-above', i18nKey: 'widgetTableInsertRowAbove' });
      items.push({ id: 'insert-row-below', i18nKey: 'widgetTableInsertRowBelow' });
    } else if (selection.kind === 'col') {
      if (items.length) items.push({ id: '---' });
      items.push({ id: 'insert-col-left', i18nKey: 'widgetTableInsertColLeft' });
      items.push({ id: 'insert-col-right', i18nKey: 'widgetTableInsertColRight' });
    }

    if (canDeleteRow || canDeleteCol) {
      if (items.length) items.push({ id: '---' });
      if (canDeleteRow) items.push({ id: 'delete-row', i18nKey: 'widgetTableDeleteRow' });
      if (canDeleteCol) items.push({ id: 'delete-col', i18nKey: 'widgetTableDeleteCol' });
    }

    if (hasSel) {
      if (items.length) items.push({ id: '---' });
      let clearKey = 'widgetTableClear';
      if (selection.kind === 'row') clearKey = 'widgetTableClearRow';
      else if (selection.kind === 'col') clearKey = 'widgetTableClearCol';
      items.push({ id: 'clear', i18nKey: clearKey });
    }

    if (items.length) items.push({ id: '---' });
    items.push({ id: 'delete-table', i18nKey: 'widgetTableDeleteTable' });

    return items;
  }

  function runMenuAction(id) {
    const anchor = selectionAnchor(selection);
    if (id === 'copy' || id === 'cut') {
      syncFromDomIfNeeded();
      const text = extractTableTSV(parsed, selection);
      if (!text) return;
      internalClipboard = text;
      copyText(text, ctx.copyFn);
      if (id === 'cut') {
        mutate(function (p) {
          clearTableSelection(p, selection);
        });
      }
      return;
    }
    if (id === 'paste') {
      if (!anchor) return;
      const applyPaste = function (text) {
        const payload = text || internalClipboard;
        if (!payload) return;
        mutate(function (p) {
          pasteTableTSV(p, anchor.row, anchor.col, payload);
        });
      };
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(applyPaste).catch(function () {
          applyPaste(internalClipboard);
        });
      } else {
        applyPaste(internalClipboard);
      }
      return;
    }
    if (id === 'clear') {
      mutate(function (p) {
        clearTableSelection(p, selection);
      });
      return;
    }
    if (id === 'delete-table') {
      closeTableMenu();
      if (typeof ctx.onDeleteTable === 'function') ctx.onDeleteTable();
      return;
    }
    if (id === 'delete-row' && selection.kind === 'row' && selection.row >= 0) {
      const idx = selection.row;
      mutate(function (p) {
        deleteTableRow(p, idx);
      });
      setSelection({ kind: 'none' });
      return;
    }
    if (id === 'delete-col' && selection.kind === 'col') {
      const idx = selection.col;
      mutate(function (p) {
        deleteTableColumn(p, idx);
      });
      setSelection({ kind: 'none' });
      return;
    }
    if (!anchor) return;
    if (id === 'insert-row-above') {
      const ref = anchor.row < 0 ? 0 : anchor.row;
      mutate(function (p) {
        insertTableRow(p, ref, 'before');
      });
      return;
    }
    if (id === 'insert-row-below') {
      const ref = anchor.row < 0 ? 0 : anchor.row;
      mutate(function (p) {
        insertTableRow(p, ref, 'after');
      });
      return;
    }
    if (id === 'insert-col-left') {
      mutate(function (p) {
        insertTableColumn(p, anchor.col, 'before');
      });
      return;
    }
    if (id === 'insert-col-right') {
      mutate(function (p) {
        insertTableColumn(p, anchor.col, 'after');
      });
      return;
    }
  }

  function openMenuAt(clientX, clientY) {
    openTableMenu(
      stage,
      { x: clientX, y: clientY, items: menuItems() },
      runMenuAction,
      t
    );
  }

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
    const range = document.createElement ? document.createRange() : null;
    if (!range) return;
    range.selectNodeContents(next);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function wireCells(table) {
    const cells = table.querySelectorAll('th[contenteditable], td[contenteditable]');
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      let cellContentDirty = false;
      cell.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        if (!e.target.closest('.mda-cm-table-menu')) closeTableMenu();
        e.stopPropagation();
        const row = parseInt(cell.getAttribute('data-mda-row') || '0', 10);
        const col = parseInt(cell.getAttribute('data-mda-col') || '0', 10);
        if (e.shiftKey && dragAnchor) {
          setSelection({ kind: 'rect', row1: dragAnchor.row, col1: dragAnchor.col, row2: row, col2: col });
        } else {
          dragAnchor = { row: row, col: col };
          setSelection({ kind: 'cell', row: row, col: col });
        }
        requestAnimationFrame(function () {
          if (document.activeElement !== cell) cell.focus();
        });
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
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection.kind !== 'cell') {
          e.preventDefault();
          runMenuAction('copy');
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selection.kind !== 'cell') {
          e.preventDefault();
          runMenuAction('cut');
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selection.kind !== 'cell') {
          e.preventDefault();
          runMenuAction('paste');
        }
      });
      cell.addEventListener('blur', function () {
        requestAnimationFrame(function () {
          if (mutating) return;
          if (!cellContentDirty) return;
          cellContentDirty = false;
          if (!ctx.root.isConnected || !table.isConnected) return;
          if (table.contains(document.activeElement)) return;
          syncFromDomIfNeeded();
          commitParsed();
        });
      });
      cell.addEventListener('input', function () {
        cellContentDirty = true;
        setSelection({ kind: 'cell', row: parseInt(cell.getAttribute('data-mda-row') || '0', 10), col: parseInt(cell.getAttribute('data-mda-col') || '0', 10) });
      });
    }
  }

  colGutter.addEventListener('mousedown', function (e) {
    const bar = e.target && e.target.closest ? e.target.closest('.mda-cm-table-col-bar') : null;
    if (!bar) return;
    closeTableMenu();
    e.preventDefault();
    e.stopPropagation();
    setSelection({ kind: 'col', col: parseInt(bar.dataset.col || '0', 10) });
  });

  rowGutter.addEventListener('mousedown', function (e) {
    const bar = e.target && e.target.closest ? e.target.closest('.mda-cm-table-row-bar') : null;
    if (!bar) return;
    closeTableMenu();
    e.preventDefault();
    e.stopPropagation();
    setSelection({ kind: 'row', row: parseInt(bar.dataset.row || '0', 10) });
  });

  stage.addEventListener('keydown', function (e) {
    handleDeleteKey(e);
  });

  addColBtn.addEventListener('mousedown', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });
  addColBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    mutate(function (p) {
      insertTableColumn(p, p.headers.length - 1, 'after');
    });
  });

  addRowBtn.addEventListener('mousedown', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });
  addRowBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    mutate(function (p) {
      insertTableRow(p, p.rows.length, 'before');
    });
  });

  stage.addEventListener('contextmenu', function (e) {
    if (!stage.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    openMenuAt(e.clientX, e.clientY);
  });

  stage.addEventListener('mousedown', function (e) {
    if (!(e.target && e.target.closest && e.target.closest('.mda-cm-table-menu'))) {
      closeTableMenu();
    }
    if (e.target && e.target.closest && e.target.closest('.mda-cm-table-chrome')) {
      e.stopPropagation();
      return;
    }
    if (
      e.target &&
      e.target.closest &&
      e.target.closest('.mda-cm-table-col-gutter-clip, .mda-cm-table-col-gutter')
    ) {
      e.stopPropagation();
      return;
    }
    if (
      e.target &&
      e.target.closest &&
      e.target.closest('.mda-cm-table-col-resize-handle, .mda-cm-table-row-resize-handle')
    ) {
      e.stopPropagation();
      return;
    }
    if (e.target && e.target.closest && e.target.closest('th[contenteditable], td[contenteditable]')) {
      return;
    }
    e.stopPropagation();
    if (
      e.target === stage ||
      e.target === grid ||
      e.target === body ||
      e.target === chrome
    ) {
      clearTableInteraction();
    }
  });

  function onDocPointer(e) {
    if (!stage.isConnected) {
      document.removeEventListener('mousedown', onDocPointer, true);
      return;
    }
    if (e.target && stage.contains(e.target)) return;
    clearTableInteraction();
  }
  document.addEventListener('mousedown', onDocPointer, true);

  function onTableWrapScroll() {
    const table = tableWrap.querySelector('table');
    if (!table) return;
    syncGutterLayout(table);
    if (resizeCtl) resizeCtl.rebuildHandles();
  }
  tableWrap.addEventListener('scroll', onTableWrapScroll, { passive: true });

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(function () {
      const table = tableWrap.querySelector('table');
      if (table) syncGutterLayout(table);
      if (resizeCtl) resizeCtl.rebuildHandles();
    });
    resizeObserver.observe(tableWrap);
  }

  renderLocal();
  const firstTable = tableWrap.querySelector('table');
  if (firstTable) {
    resizeCtl = attachTableGridResize(tableWrap, firstTable, {
      getParsed: function () {
        return parsed;
      },
      onLayoutCommit: function () {
        commitLayout();
      },
      t: t,
    });
  }

  return {
    stage: stage,
    getParsed: function () {
      syncFromDomIfNeeded();
      return parsed;
    },
    flush: function () {
      if (mutating || !ctx.root.isConnected) return;
      const table = tableWrap.querySelector('table');
      if (!table || !table.isConnected) return;
      const live = ctx.readParsedFromDom();
      if (!live) return;
      parsed = live;
      mutating = true;
      try {
        if (hasTableLayoutMeta(parsed)) {
          setTableLayoutSession(blockSource, parsed);
        }
        ctx.onParsedChange(cloneTableData(parsed));
      } finally {
        mutating = false;
      }
    },
    dispose: function () {
      document.removeEventListener('mousedown', onDocPointer, true);
      tableWrap.removeEventListener('scroll', onTableWrapScroll);
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (resizeCtl) {
        resizeCtl.dispose();
        resizeCtl = null;
      }
      closeTableMenu();
    },
    refreshI18n: function (tFn) {
      const tt = tFn || t;
      addColBtn.title = uiT('widgetTableAddCol', tt);
      addRowBtn.title = uiT('widgetTableAddRow', tt);
    },
  };
}

module.exports = {
  mountTableChrome: mountTableChrome,
  renderTableElement: renderTableElement,
  closeTableMenu: closeTableMenu,
  applySelectionHighlight: applySelectionHighlight,
};

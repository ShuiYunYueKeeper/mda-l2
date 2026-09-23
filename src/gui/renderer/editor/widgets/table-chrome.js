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
  extractTableHtml,
  extractTableMarkdown,
  pasteTableTSV,
  selectionAnchor,
  selectionBounds,
  isFullColumnSelection,
  isFullRowSelection,
  isEntireTableSelection,
} = require('../model/table-model');
const { copyText, uiT, clearBlockWidgetSelection, clearMediaSelection, HOVER_LEAVE_MS } = require('./widget-common');
const { attachWidgetEditablePointerIsolation } = require('../widget-editable-guard');
const {
  shouldPreserveDomSelection,
  clearCmSelectionIfAny,
  collapseWidgetDomAt,
  restoreWidgetDomCaret,
} = require('../context-selection');
const { isWidgetDomMenuGuard } = require('../widget-context-menu-guard');
const { menuIconHtml } = require('./block-menu-icons');
const { MOD_KEY } = require('./block-handle-menu');
const { attachTableGridResize, applyTableLayout, ensureLayoutArrays } = require('./table-resize');
const { hasTableLayoutMeta } = require('../model/parse-table');
const {
  setTableLayoutSession,
  applyTableLayoutSession,
  migrateTableLayoutSession,
} = require('./table-layout-session');
const {
  setCellMarkdownContent,
  selectTableMathAtom,
  handleTableMathDeleteKey,
  tableCellImageMarkdownAbs,
  applyInlineFormatToTableCell,
  getCellInlineFlags,
} = require('./table-cell-content');
const { undo, redo } = require('@codemirror/commands');
const { attachBlockDragHandle } = require('./block-drag-handle');
const { setSelectedBlock } = require('./block-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedMermaidBlock } = require('./mermaid-selection');
const { clearSelectedInlineMath } = require('./inline-math-selection');
const { toggleWidgetPendingMark } = require('../state/pending-inline-format');

/** @type {string} */
let internalClipboard = '';

/** @type {HTMLElement | null} */
let activeTableSubmenu = null;
let tableSubOpenTimer = 0;
let tableSubCloseTimer = 0;
const TABLE_SUB_CLOSE_MS = HOVER_LEAVE_MS;

const TABLE_CELL_IMAGE_COPY_AS = [
  { id: 'copy-as-markdown', i18nKey: 'blockMenuCopyAsMarkdown', icon: 'markdown' },
  { id: 'copy-as-image', i18nKey: 'blockMenuCopyAsImage', icon: 'copyAsImage' },
];

/**
 * @param {{
 *   widget?: { from?: number, to?: number, source?: string },
 *   blockSource?: string,
 * }} ctx
 */
function rememberTableBlockSelected(ctx) {
  clearSelectedImageBlock();
  clearSelectedMermaidBlock();
  clearSelectedInlineMath();
  const w = ctx.widget || {};
  if (w.from != null && w.to != null) {
    setSelectedBlock({
      kind: 'table',
      from: w.from,
      to: w.to,
      source: w.source || ctx.blockSource || '',
    });
  }
}

/**
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 * @param {{ resolveImageUrl?: Function }} [opts]
 * @returns {HTMLTableElement}
 */
/**
 * 格内 DOM 选区是否为空（无选区时字符格式只武装待输入格式，不改已有文本）。
 * @param {HTMLElement} cell
 */
function isCellSelectionCollapsed(cell) {
  if (typeof window === 'undefined' || !window.getSelection) return true;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return true;
  const range = sel.getRangeAt(0);
  if (!cell.contains(range.startContainer) || !cell.contains(range.endContainer)) return true;
  return range.toString().length === 0;
}

function renderTableElement(parsed, opts) {
  opts = opts || {};
  const cellOpts = { resolveImageUrl: opts.resolveImageUrl };
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
    setCellMarkdownContent(th, parsed.headers[i], cellOpts);
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
      setCellMarkdownContent(td, row[c] != null ? row[c] : '', cellOpts);
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
  // 单击进格编辑（kind=cell）：不铺整格蓝底，仅 caret / 文字 ::selection
  // 行列/多格框选（row/col/rect）仍高亮
  if (!selection || selection.kind === 'none' || selection.kind === 'cell') return;
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
 * @param {string} label
 * @param {string} [icon]
 * @param {string} [keyHint]
 */
function tableMenuItemInner(label, icon, keyHint) {
  return (
    menuIconHtml(icon || '') +
    '<span class="mda-menu-label">' +
    label +
    '</span>' +
    (keyHint ? '<span class="mda-menu-key">' + keyHint + '</span>' : '')
  );
}

/**
 * @param {string} label
 * @param {string} [icon]
 */
function submenuItemInner(label, icon) {
  return (
    menuIconHtml(icon || '') +
    '<span class="mda-menu-label">' +
    label +
    '</span>'
  );
}

/**
 * @param {HTMLElement} parentItem
 * @param {HTMLElement} submenu
 */
function placeTableSubmenu(parentItem, submenu) {
  document.body.appendChild(submenu);
  const pr = parentItem.getBoundingClientRect();
  const pad = 6;
  let left = pr.right - 4;
  let top = pr.top - 4;
  submenu.style.left = left + 'px';
  submenu.style.top = top + 'px';
  if (left + submenu.offsetWidth > window.innerWidth - pad) {
    left = pr.left - submenu.offsetWidth + 4;
    submenu.style.left = left + 'px';
  }
  if (top + submenu.offsetHeight > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - submenu.offsetHeight - pad);
    submenu.style.top = top + 'px';
  }
}

/**
 * @param {(key: string) => string} t
 * @param {{ id: string, i18nKey: string, icon?: string }[]} items
 * @param {(id: string) => void} onPick
 */
function buildTableSubmenu(t, items, onPick) {
  const sub = document.createElement('div');
  sub.className = 'mda-context-menu mda-block-handle-submenu';
  sub.setAttribute('role', 'menu');
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const row = document.createElement('div');
    row.className = 'mda-menu-item';
    row.setAttribute('role', 'menuitem');
    row.dataset.act = it.id;
    row.innerHTML = submenuItemInner(uiT(it.i18nKey, t), it.icon);
    sub.appendChild(row);
  }
  sub.addEventListener('mousedown', function (e) {
    const item = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!item) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    closeTableMenu();
    onPick(item.dataset.act || '');
  });
  sub.addEventListener('mouseenter', function () {
    window.clearTimeout(tableSubCloseTimer);
    tableSubCloseTimer = 0;
  });
  sub.addEventListener('mouseleave', function () {
    window.clearTimeout(tableSubCloseTimer);
    tableSubCloseTimer = window.setTimeout(closeTableSubmenu, TABLE_SUB_CLOSE_MS);
  });
  return sub;
}

/**
 * @param {HTMLElement} host
 * @param {{ items: { id: string, i18nKey: string, disabled?: boolean, icon?: string, key?: string, submenu?: { id: string, i18nKey: string, icon?: string }[] }[], x: number, y: number }} spec
 * @param {(id: string) => void} onAction
 * @param {(key: string) => string} t
 */
function openTableMenu(host, spec, onAction, t) {
  closeTableMenu();
  const menu = document.createElement('div');
  menu.className = 'mda-context-menu mda-block-handle-menu mda-cm-table-menu';
  menu.setAttribute('role', 'menu');
  for (let i = 0; i < spec.items.length; i++) {
    const item = spec.items[i];
    if (item.id === '---') {
      const sep = document.createElement('div');
      sep.className = 'mda-menu-sep';
      sep.setAttribute('aria-hidden', 'true');
      menu.appendChild(sep);
      continue;
    }
    if (item.submenu && item.submenu.length) {
      const row = document.createElement('div');
      row.className = 'mda-menu-item mda-menu-has-sub mda-cm-table-menu-item';
      row.setAttribute('role', 'menuitem');
      row.innerHTML =
        tableMenuItemInner(uiT(item.i18nKey, t), item.icon, '<span class="mda-menu-chevron" aria-hidden="true">\u203a</span>');
      row.addEventListener('mouseenter', function () {
        window.clearTimeout(tableSubCloseTimer);
        tableSubCloseTimer = 0;
        window.clearTimeout(tableSubOpenTimer);
        tableSubOpenTimer = window.setTimeout(function () {
          closeTableSubmenu();
          activeTableSubmenu = buildTableSubmenu(t, item.submenu, onAction);
          placeTableSubmenu(row, activeTableSubmenu);
        }, 100);
      });
      row.addEventListener('mouseleave', function (ev) {
        window.clearTimeout(tableSubOpenTimer);
        tableSubOpenTimer = 0;
        const rt = ev.relatedTarget;
        if (activeTableSubmenu && rt && activeTableSubmenu.contains(/** @type {Node} */ (rt))) return;
        window.clearTimeout(tableSubCloseTimer);
        tableSubCloseTimer = window.setTimeout(closeTableSubmenu, TABLE_SUB_CLOSE_MS);
      });
      menu.appendChild(row);
      continue;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'mda-menu-item mda-cm-table-menu-item' +
      (item.disabled ? ' disabled' : '') +
      (item.danger ? ' mda-menu-danger' : '');
    btn.dataset.action = item.id;
    btn.dataset.i18nKey = item.i18nKey;
    btn.innerHTML = tableMenuItemInner(uiT(item.i18nKey, t), item.icon, item.key);
    btn.disabled = !!item.disabled;
    if (!item.disabled) {
      btn.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        closeTableMenu();
        onAction(item.id);
      });
    }
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

function closeTableSubmenu() {
  window.clearTimeout(tableSubOpenTimer);
  window.clearTimeout(tableSubCloseTimer);
  tableSubOpenTimer = 0;
  tableSubCloseTimer = 0;
  if (activeTableSubmenu && activeTableSubmenu.parentNode) {
    activeTableSubmenu.parentNode.removeChild(activeTableSubmenu);
  }
  activeTableSubmenu = null;
}

function closeTableMenu() {
  if (typeof document === 'undefined') return;
  closeTableSubmenu();
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
 *   copyHtmlFn?: (html: string, text: string) => void,
 *   resolveImageUrl?: Function,
 *   onOpenZoom?: Function,
 *   onCopyImage?: (img: HTMLImageElement) => void,
 *   onPasteTableCellImage?: (wrap: HTMLElement) => Promise<{ line: string, href: string, alt?: string, title?: string } | null>,
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

  body.appendChild(tableWrap);
  chrome.appendChild(colGutterClip);
  chrome.appendChild(rowGutter);
  body.appendChild(chrome);
  grid.appendChild(body);
  stage.appendChild(grid);

  const widget = ctx.widget || {};
  attachBlockDragHandle(
    stage,
    ctx.view,
    { from: widget.from, to: widget.to, source: ctx.blockSource || widget.source },
    {
      blockRoot: ctx.root,
      blockSelector: '.mda-cm-table-block',
      replaceOnHover: false,
      blockKind: 'table',
      blockMenuHandlers: ctx.blockMenuHandlers,
      t: t,
      onMoveBlock: ctx.onMoveTableBlock,
    }
  );

  let parsed = cloneTableData(ctx.parsed);
  applyTableLayoutSession(ctx.blockSource || '', parsed);
  /** @type {string} */
  let blockSource = ctx.blockSource || '';
  /** @type {import('../model/table-model').TableSelection} */
  let selection = { kind: 'none' };
  let dragAnchor = null;
  let mutating = false;
  /** @type {{ cell: HTMLElement, wrap: HTMLElement } | null} */
  let activeCellImageTarget = null;
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
    const domSel = typeof window.getSelection === 'function' ? window.getSelection() : null;
    if (domSel && domSel.rangeCount > 0) {
      const range = domSel.getRangeAt(0);
      if (tableWrap.contains(range.commonAncestorContainer)) {
        domSel.removeAllRanges();
      }
    }
    setSelection({ kind: 'none' });
  }

  /** 结构变更：写文档并本地刷新，避免 CM 重建延迟导致「无反应」 */
  function mutate(fn) {
    // 必须在置 mutating 之前把格内未提交的编辑读回来：syncFromDomIfNeeded 自身以 mutating
    // 早退（那是给 renderLocal 拆 DOM 时误触发的 blur 用的），置位后再调等于空转，
    // fn 会在旧 parsed 上加行/列，renderLocal 随即用它重建 —— 正在编辑的单元格内容就没了。
    syncFromDomIfNeeded();
    mutating = true;
    try {
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
    const table = renderTableElement(parsed, {
      resolveImageUrl: ctx.resolveImageUrl,
    });
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
    }
    // 单元格点击会 stopPropagation，根节点 pin 不到；任意表格选区都须钉 CM6 选区，
    // 否则写回后撤销会把光标还原到文档头。
    if (sel.kind !== 'none' && typeof ctx.pinEditor === 'function') {
      ctx.pinEditor();
    }
  }

  function handleDeleteKey(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return false;
    // 全表选中：删除整表，避免删列逻辑「至少保留一列」残留
    if (isEntireTableSelection(parsed, selection)) {
      e.preventDefault();
      e.stopPropagation();
      runMenuAction('delete-table');
      return true;
    }
    if (
      (selection.kind === 'row' && selection.row >= 0) ||
      (isFullRowSelection(selection) && selectionBounds(selection) && selectionBounds(selection).row1 >= 0)
    ) {
      e.preventDefault();
      e.stopPropagation();
      runMenuAction('delete-row');
      return true;
    }
    if (selection.kind === 'col' || isFullColumnSelection(selection)) {
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
    const b = selectionBounds(selection);
    if (!b) return;
    const maxCol = parsed.headers.length - 1;
    const maxRow = parsed.rows.length - 1;
    const col2 = b.col2 === Number.MAX_SAFE_INTEGER ? maxCol : Math.min(b.col2, maxCol);
    const row2 = b.row2 === Number.MAX_SAFE_INTEGER ? maxRow : Math.min(b.row2, maxRow);
    if (selection.kind === 'col' || isFullColumnSelection(selection)) {
      for (let c = b.col1; c <= col2; c++) {
        const bar = colGutter.querySelector('[data-col="' + c + '"]');
        if (bar) bar.classList.add('mda-cm-table-gutter-active');
      }
    }
    if (selection.kind === 'row' || isFullRowSelection(selection)) {
      for (let r = b.row1; r <= row2; r++) {
        const bar = rowGutter.querySelector('[data-row="' + r + '"]');
        if (bar) bar.classList.add('mda-cm-table-gutter-active');
      }
    }
  }

  function cellImageMenuItems() {
    return [
      { id: 'copy', i18nKey: 'copyBtn', icon: 'copy', key: MOD_KEY + 'C' },
      { id: 'cut', i18nKey: 'widgetTableCut', icon: 'cut', key: MOD_KEY + 'X' },
      { id: 'paste', i18nKey: 'widgetTablePaste', icon: 'paste', key: MOD_KEY + 'V' },
      { id: '---' },
      {
        id: 'copy-as',
        i18nKey: 'blockMenuCopyAs',
        icon: 'copyAs',
        submenu: TABLE_CELL_IMAGE_COPY_AS,
      },
      { id: '---' },
      { id: 'clear', i18nKey: 'widgetTableClear', icon: 'delete' },
    ];
  }

  /**
   * @param {HTMLElement} wrap
   * @param {{ line: string, href: string, alt?: string, title?: string }} payload
   */
  function applyTableCellImageUpdate(wrap, payload) {
    wrap.setAttribute('data-mda-image-source', payload.line);
    wrap.setAttribute('data-mda-image-src', payload.href);
    wrap.setAttribute('data-mda-image-alt', payload.alt || '');
    if (payload.title) wrap.setAttribute('data-mda-image-title', payload.title);
    else wrap.removeAttribute('data-mda-image-title');
    const img = wrap.querySelector('img');
    if (img) {
      img.setAttribute('alt', payload.alt || '');
      if (payload.title) img.setAttribute('title', payload.title);
      else img.removeAttribute('title');
      const resolved =
        typeof ctx.resolveImageUrl === 'function'
          ? ctx.resolveImageUrl(payload.href)
          : payload.href;
      if (resolved) img.setAttribute('src', resolved);
    }
  }

  /**
   * @param {HTMLElement} wrap
   */
  function removeCellImageWrap(wrap) {
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
  }

  /**
   * @param {HTMLElement} cell
   * @param {HTMLElement} wrap
   */
  function pasteCellImage(cell, wrap) {
    if (typeof ctx.onPasteTableCellImage !== 'function') return;
    Promise.resolve(ctx.onPasteTableCellImage(wrap))
      .then(function (payload) {
        if (!payload || !payload.line) return;
        applyTableCellImageUpdate(wrap, payload);
        syncFromDomIfNeeded();
        commitParsed();
        if (cell && typeof cell.focus === 'function') cell.focus();
      })
      .catch(function () {
        /* ignore */
      });
  }

  /**
   * @param {string} id
   */
  function runCellImageMenuAction(id) {
    const target = activeCellImageTarget;
    activeCellImageTarget = null;
    if (!target) return;
    const cell = target.cell;
    const wrap = target.wrap;
    const img = wrap.querySelector('img');
    const row = parseInt(cell.getAttribute('data-mda-row') || '0', 10);
    const col = parseInt(cell.getAttribute('data-mda-col') || '0', 10);

    if (id === 'copy' || id === 'copy-as-image') {
      if (img && typeof ctx.onCopyImage === 'function') ctx.onCopyImage(img);
      return;
    }
    if (id === 'cut') {
      if (img && typeof ctx.onCopyImage === 'function') ctx.onCopyImage(img);
      removeCellImageWrap(wrap);
      syncFromDomIfNeeded();
      commitParsed();
      return;
    }
    if (id === 'paste') {
      pasteCellImage(cell, wrap);
      return;
    }
    if (id === 'copy-as-markdown') {
      const text = tableCellImageMarkdownAbs(wrap, ctx.resolveImageUrl);
      if (text) copyText(text, ctx.copyFn);
      return;
    }
    if (id === 'clear') {
      setSelection({ kind: 'cell', row: row, col: col });
      mutate(function (p) {
        clearTableSelection(p, { kind: 'cell', row: row, col: col });
      });
    }
  }

  function menuItems(clientX, clientY, targetCell) {
    const domTextAtClick =
      targetCell &&
      shouldPreserveDomSelection(/** @type {HTMLElement} */ (targetCell), clientX, clientY);
    const tableStructuralSel = selection.kind !== 'none' && selection.kind !== 'cell';
    const hasClipboard = !!(domTextAtClick || tableStructuralSel);
    const anchor = selectionAnchor(selection);
    const b = selectionBounds(selection);
    const isBodyRow =
      (selection.kind === 'row' && selection.row >= 0) ||
      (isFullRowSelection(selection) && b && b.row1 >= 0);
    const isColSel = selection.kind === 'col' || isFullColumnSelection(selection);
    const canDeleteRow = isBodyRow && parsed.rows.length > 0;
    const canDeleteCol = isColSel && parsed.headers.length > 1;
    const inCell = !!targetCell;
    const items = [];

    items.push({
      id: 'copy',
      i18nKey: 'copyBtn',
      icon: 'copy',
      key: MOD_KEY + 'C',
      disabled: !hasClipboard,
    });
    items.push({
      id: 'cut',
      i18nKey: 'widgetTableCut',
      icon: 'cut',
      key: MOD_KEY + 'X',
      disabled: !hasClipboard,
    });
    if (anchor) {
      items.push({
        id: 'paste',
        i18nKey: 'widgetTablePaste',
        icon: 'paste',
        key: MOD_KEY + 'V',
      });
    }

    if (isBodyRow || (selection.kind === 'row' && selection.row === -1)) {
      if (items.length) items.push({ id: '---' });
      items.push({ id: 'insert-row-above', i18nKey: 'widgetTableInsertRowAbove', icon: 'insertRowAbove' });
      items.push({ id: 'insert-row-below', i18nKey: 'widgetTableInsertRowBelow', icon: 'insertRowBelow' });
    } else if (isColSel) {
      if (items.length) items.push({ id: '---' });
      items.push({ id: 'insert-col-left', i18nKey: 'widgetTableInsertColLeft', icon: 'insertColLeft' });
      items.push({ id: 'insert-col-right', i18nKey: 'widgetTableInsertColRight', icon: 'insertColRight' });
    }

    if (canDeleteRow || canDeleteCol) {
      if (items.length) items.push({ id: '---' });
      if (canDeleteRow) items.push({ id: 'delete-row', i18nKey: 'widgetTableDeleteRow', icon: 'delete' });
      if (canDeleteCol) items.push({ id: 'delete-col', i18nKey: 'widgetTableDeleteCol', icon: 'delete' });
    }

    if (hasClipboard || inCell) {
      if (items.length) items.push({ id: '---' });
      let clearKey = 'widgetTableClear';
      if (selection.kind === 'row' || isFullRowSelection(selection)) clearKey = 'widgetTableClearRow';
      else if (selection.kind === 'col' || isFullColumnSelection(selection)) {
        clearKey = 'widgetTableClearCol';
      }
      items.push({ id: 'clear', i18nKey: clearKey, icon: 'delete' });
    }

    if (items.length) items.push({ id: '---' });
    if (!inCell || hasClipboard || tableStructuralSel) {
      items.push({ id: 'delete-table', i18nKey: 'widgetTableDeleteTable', icon: 'delete', danger: true });
    }

    return items;
  }

  function runMenuAction(id) {
    const anchor = selectionAnchor(selection);
    if (id === 'copy' || id === 'cut') {
      syncFromDomIfNeeded();
      const md = extractTableMarkdown(parsed, selection);
      const tsv = extractTableTSV(parsed, selection);
      if (!md && !tsv) return;
      // 表内互贴优先 TSV；正文粘贴用 GFM（text/plain）
      internalClipboard = tsv || md;
      const plain = md || tsv;
      const html = extractTableHtml(parsed, selection);
      if (html && typeof ctx.copyHtmlFn === 'function') {
        ctx.copyHtmlFn(html, plain);
      } else {
        copyText(plain, ctx.copyFn);
      }
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
    if (id === 'delete-row') {
      const bounds = selectionBounds(selection);
      if (!bounds || bounds.row1 < 0) return;
      const row2 =
        bounds.row2 === Number.MAX_SAFE_INTEGER
          ? parsed.rows.length - 1
          : bounds.row2;
      mutate(function (p) {
        for (let r = row2; r >= bounds.row1; r--) {
          if (r >= 0) deleteTableRow(p, r);
        }
      });
      setSelection({ kind: 'none' });
      return;
    }
    if (id === 'delete-col') {
      const bounds = selectionBounds(selection);
      if (!bounds) return;
      const col2 =
        bounds.col2 === Number.MAX_SAFE_INTEGER
          ? parsed.headers.length - 1
          : bounds.col2;
      // 选中全部列时删除整表（deleteTableColumn 会强制保留最后一列）
      if (
        isEntireTableSelection(parsed, selection) ||
        (bounds.col1 <= 0 && col2 >= parsed.headers.length - 1)
      ) {
        closeTableMenu();
        if (typeof ctx.onDeleteTable === 'function') ctx.onDeleteTable();
        return;
      }
      mutate(function (p) {
        for (let c = col2; c >= bounds.col1; c--) {
          deleteTableColumn(p, c);
        }
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

  function openMenuAt(clientX, clientY, targetCell, imgWrap) {
    if (imgWrap && targetCell) {
      activeCellImageTarget = { cell: targetCell, wrap: imgWrap };
      openTableMenu(
        stage,
        { x: clientX, y: clientY, items: cellImageMenuItems() },
        runCellImageMenuAction,
        t
      );
      return;
    }
    activeCellImageTarget = null;
    openTableMenu(
      stage,
      { x: clientX, y: clientY, items: menuItems(clientX, clientY, targetCell) },
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
      attachWidgetEditablePointerIsolation(cell);

      function findSelectedTableImage() {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          let node = range.commonAncestorContainer;
          if (node && node.nodeType === 3) node = node.parentElement;
          let wrap =
            node && node.nodeType === 1 && /** @type {HTMLElement} */ (node).closest
              ? /** @type {HTMLElement} */ (node).closest('.mda-cm-table-img')
              : null;
          if (
            !wrap &&
            range.startContainer &&
            range.startContainer.nodeType === 1 &&
            /** @type {HTMLElement} */ (range.startContainer).classList &&
            /** @type {HTMLElement} */ (range.startContainer).classList.contains(
              'mda-cm-table-img'
            )
          ) {
            wrap = /** @type {HTMLElement} */ (range.startContainer);
          }
          if (wrap && cell.contains(wrap)) {
            const img = wrap.querySelector('img');
            if (img) return img;
          }
        }
        // 单元格内容几乎只有一张图时，Ctrl+C 也复制该图
        const wraps = cell.querySelectorAll('.mda-cm-table-img');
        if (wraps.length === 1) {
          const text = String(cell.textContent || '')
            .replace(/\u00a0/g, ' ')
            .trim();
          if (!text) {
            return wraps[0].querySelector('img');
          }
        }
        return null;
      }

      cell.addEventListener('mousedown', function (e) {
        if (e.button !== 0 && e.button !== 2) return;
        if (!e.target.closest('.mda-cm-table-menu')) closeTableMenu();
        e.stopPropagation();
        if (e.button === 2) return;
        if (!shouldPreserveDomSelection(cell, e.clientX, e.clientY)) {
          collapseWidgetDomAt(cell, e.clientX, e.clientY);
        }
        clearCmSelectionIfAny(ctx.view);
        const atomEl = e.target.closest
          ? e.target.closest('.mda-cm-table-math, .mda-cm-table-img')
          : null;
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
          if (atomEl && cell.contains(atomEl)) selectTableMathAtom(atomEl);
        });
      });
      cell.addEventListener('dblclick', function (e) {
        const imgWrap = e.target && e.target.closest
          ? e.target.closest('.mda-cm-table-img')
          : null;
        if (!imgWrap || !cell.contains(imgWrap)) return;
        const img = imgWrap.querySelector('img');
        if (!img || typeof ctx.onOpenZoom !== 'function') return;
        e.preventDefault();
        e.stopPropagation();
        ctx.onOpenZoom({
          node: img.cloneNode(true),
          opts: { kind: 'image', imageSrc: img.getAttribute('src') || '' },
        });
      });
      cell.addEventListener('focus', function (e) {
        e.stopPropagation();
      });
      cell.addEventListener('keydown', function (e) {
        // 单元格内 Ctrl+Z/Y 走 CM6 历史（公式原子删除等已写回文档的变更）
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          const key = e.key;
          if (
            key === 'b' ||
            key === 'B' ||
            key === 'i' ||
            key === 'I' ||
            key === 'u' ||
            key === 'U' ||
            key === '`' ||
            ((key === 'x' || key === 'X') && e.shiftKey)
          ) {
            e.preventDefault();
            e.stopPropagation();
            let before = '**';
            let after = '**';
            let mark = 'bold';
            if (key === 'i' || key === 'I') {
              before = '*';
              after = '*';
              mark = 'italic';
            } else if (key === 'u' || key === 'U') {
              before = '~';
              after = '~';
              mark = 'underline';
            } else if (key === 'x' || key === 'X') {
              before = '~~';
              after = '~~';
              mark = 'strike';
            } else if (key === '`') {
              before = '`';
              after = '`';
              mark = 'code';
            }
            // 与正文一致：无选区只改「后续输入格式」，不往格里塞空定界符对
            // （旧行为直接 toggleWrap 空选区，会写入 `**​**` 这种带零宽空格的空对）。
            if (isCellSelectionCollapsed(cell)) {
              // base 取光标处已有标记，否则「在斜体里按 Ctrl+B」会把斜体一并关掉
              const caret = getCellInlineFlags(cell);
              toggleWidgetPendingMark(
                cell,
                mark,
                caret ? caret.flags : null,
                caret ? caret.pos : null
              );
              return;
            }
            applyInlineFormatToTableCell(cell, before, after, null);
            cellContentDirty = true;
            return;
          }
          if (key === 'z' || key === 'Z') {
            e.preventDefault();
            e.stopPropagation();
            const row = parseInt(cell.getAttribute('data-mda-row') || '0', 10);
            const col = parseInt(cell.getAttribute('data-mda-col') || '0', 10);
            if (cellContentDirty) {
              if (typeof ctx.pinEditor === 'function') ctx.pinEditor();
              syncFromDomIfNeeded();
              commitParsed();
              cellContentDirty = false;
            }
            if (e.shiftKey) redo(ctx.view);
            else undo(ctx.view);
            // 撤销后表格 widget 重建：钉回表首并尽量回到原单元格，避免视口/焦点飞到文档头
            requestAnimationFrame(function () {
              if (typeof ctx.pinEditor === 'function') ctx.pinEditor();
              if (!ctx.root.isConnected) return;
              const liveTable = tableWrap.querySelector('table');
              if (!liveTable) return;
              const next = liveTable.querySelector(
                (row === -1 ? 'thead th' : 'tbody td') +
                  '[data-mda-row="' +
                  row +
                  '"][data-mda-col="' +
                  col +
                  '"]'
              );
              if (next) {
                next.focus();
                setSelection({ kind: 'cell', row: row, col: col });
              }
            });
            return;
          }
          if (key === 'y' || key === 'Y') {
            e.preventDefault();
            e.stopPropagation();
            redo(ctx.view);
            return;
          }
        }
        if (handleTableMathDeleteKey(cell, e)) {
          e.stopPropagation();
          const row = parseInt(cell.getAttribute('data-mda-row') || '0', 10);
          const col = parseInt(cell.getAttribute('data-mda-col') || '0', 10);
          if (typeof ctx.pinEditor === 'function') ctx.pinEditor();
          // 立即写回文档，进入 CM6 撤销栈（勿只改 DOM 等失焦）
          syncFromDomIfNeeded();
          commitParsed();
          cellContentDirty = false;
          if (ctx.root.isConnected) {
            renderLocal();
            requestAnimationFrame(function () {
              const liveTable = tableWrap.querySelector('table');
              if (!liveTable) return;
              const next = liveTable.querySelector(
                (row === -1 ? 'thead th' : 'tbody td') +
                  '[data-mda-row="' +
                  row +
                  '"][data-mda-col="' +
                  col +
                  '"]'
              );
              if (next) {
                next.focus();
                setSelection({ kind: 'cell', row: row, col: col });
              }
            });
          }
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          focusAdjacentCell(cell, table, e.shiftKey ? -1 : 1);
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
          const img = findSelectedTableImage();
          if (img && typeof ctx.onCopyImage === 'function') {
            e.preventDefault();
            e.stopPropagation();
            ctx.onCopyImage(img);
            return;
          }
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'v' || e.key === 'V') && !e.shiftKey) {
          const img = findSelectedTableImage();
          if (img) {
            const wrap =
              img.closest && typeof img.closest === 'function'
                ? img.closest('.mda-cm-table-img')
                : null;
            if (wrap && cell.contains(wrap)) {
              e.preventDefault();
              e.stopPropagation();
              pasteCellImage(cell, wrap);
              return;
            }
          }
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
          const ae = document.activeElement;
          if (ae && ae.closest && ae.closest('.mda-cm-edit-toolbar')) return;
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

  /**
   * @param {'col' | 'row'} axis
   * @param {number} clientCoord
   */
  function gutterIndexAt(axis, clientCoord) {
    const bars =
      axis === 'col'
        ? colGutter.querySelectorAll('.mda-cm-table-col-bar')
        : rowGutter.querySelectorAll('.mda-cm-table-row-bar');
    let best = null;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const r = bar.getBoundingClientRect();
      const mid = axis === 'col' ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
      const dist = Math.abs(clientCoord - mid);
      const idx = parseInt(axis === 'col' ? bar.dataset.col || '0' : bar.dataset.row || '0', 10);
      if (best == null || dist < best.dist) best = { idx: idx, dist: dist };
    }
    return best ? best.idx : 0;
  }

  /**
   * @param {'col' | 'row'} axis
   * @param {number} from
   * @param {number} to
   */
  function setGutterRangeSelection(axis, from, to) {
    if (from === to) {
      setSelection(axis === 'col' ? { kind: 'col', col: from } : { kind: 'row', row: from });
      return;
    }
    if (axis === 'col') {
      setSelection({
        kind: 'rect',
        row1: -1,
        col1: from,
        row2: Number.MAX_SAFE_INTEGER,
        col2: to,
      });
      return;
    }
    setSelection({
      kind: 'rect',
      row1: from,
      col1: 0,
      row2: to,
      col2: Number.MAX_SAFE_INTEGER,
    });
  }

  /**
   * @param {'col' | 'row'} axis
   * @param {number} anchor
   * @param {MouseEvent} startEvent
   */
  function beginGutterDrag(axis, anchor, startEvent) {
    setGutterRangeSelection(axis, anchor, anchor);
    function onMove(ev) {
      const overSel = axis === 'col' ? '.mda-cm-table-col-bar' : '.mda-cm-table-row-bar';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const over = el && el.closest ? el.closest(overSel) : null;
      let next = anchor;
      if (over && (axis === 'col' ? colGutter : rowGutter).contains(over)) {
        next = parseInt(
          (axis === 'col' ? over.dataset.col : over.dataset.row) || '0',
          10
        );
      } else {
        next = gutterIndexAt(axis, axis === 'col' ? ev.clientX : ev.clientY);
      }
      setGutterRangeSelection(axis, anchor, next);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
    }
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
    if (startEvent) {
      /* keep preventDefault from caller */
    }
  }

  colGutter.addEventListener('mousedown', function (e) {
    const bar = e.target && e.target.closest ? e.target.closest('.mda-cm-table-col-bar') : null;
    if (!bar || e.button !== 0) return;
    closeTableMenu();
    e.preventDefault();
    e.stopPropagation();
    beginGutterDrag('col', parseInt(bar.dataset.col || '0', 10), e);
  });

  rowGutter.addEventListener('mousedown', function (e) {
    const bar = e.target && e.target.closest ? e.target.closest('.mda-cm-table-row-bar') : null;
    if (!bar || e.button !== 0) return;
    closeTableMenu();
    e.preventDefault();
    e.stopPropagation();
    beginGutterDrag('row', parseInt(bar.dataset.row || '0', 10), e);
  });

  stage.addEventListener('keydown', function (e) {
    if (handleDeleteKey(e)) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (selection.kind === 'none' || selection.kind === 'cell') return;
    const key = e.key;
    if (key === 'c' || key === 'C') {
      e.preventDefault();
      e.stopPropagation();
      runMenuAction('copy');
      return;
    }
    if (key === 'x' || key === 'X') {
      e.preventDefault();
      e.stopPropagation();
      runMenuAction('cut');
      return;
    }
    if (key === 'v' || key === 'V') {
      e.preventDefault();
      e.stopPropagation();
      runMenuAction('paste');
    }
  });

  stage.addEventListener('contextmenu', function (e) {
    if (!stage.contains(e.target)) return;
    const cell =
      e.target && e.target.closest
        ? e.target.closest('th[contenteditable], td[contenteditable]')
        : null;
    const imgWrap =
      e.target && e.target.closest ? e.target.closest('.mda-cm-table-img') : null;
    if (cell && imgWrap && cell.contains(imgWrap)) {
      e.preventDefault();
      e.stopPropagation();
      clearCmSelectionIfAny(ctx.view);
      selectTableMathAtom(imgWrap);
      const row = parseInt(cell.getAttribute('data-mda-row') || '0', 10);
      const col = parseInt(cell.getAttribute('data-mda-col') || '0', 10);
      dragAnchor = { row: row, col: col };
      setSelection({ kind: 'cell', row: row, col: col });
      openMenuAt(e.clientX, e.clientY, cell, imgWrap);
      return;
    }
    /** @type {Range | null} */
    let caretSnap = null;
    if (cell) {
      if (isWidgetDomMenuGuard()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const preserve = shouldPreserveDomSelection(
        /** @type {HTMLElement} */ (cell),
        e.clientX,
        e.clientY
      );
      if (!preserve) {
        caretSnap = collapseWidgetDomAt(/** @type {HTMLElement} */ (cell), e.clientX, e.clientY);
      }
      clearCmSelectionIfAny(ctx.view);
      if (preserve) {
        return;
      }
    }
    e.preventDefault();
    e.stopPropagation();
    openMenuAt(e.clientX, e.clientY, cell);
    if (cell && caretSnap) {
      const snap = caretSnap;
      requestAnimationFrame(function () {
        if (!cell.isConnected) return;
        restoreWidgetDomCaret(/** @type {HTMLElement} */ (cell), snap);
      });
    }
  });

  stage.addEventListener('mousedown', function (e) {
    if (!(e.target && e.target.closest && e.target.closest('.mda-cm-table-menu'))) {
      closeTableMenu();
    }
    if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) {
      clearBlockWidgetSelection(ctx.root.closest('.cm-editor') || document);
      clearMediaSelection(ctx.root.closest('.cm-editor') || document);
      rememberTableBlockSelected(ctx);
      ctx.root.classList.add('mda-cm-block-selected');
      e.stopPropagation();
      return;
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
      clearBlockWidgetSelection(ctx.root.closest('.cm-editor') || document);
      clearMediaSelection(ctx.root.closest('.cm-editor') || document);
      rememberTableBlockSelected(ctx);
      ctx.root.classList.add('mda-cm-block-selected');
    }
  });

  function onDocPointer(e) {
    if (!stage.isConnected) {
      document.removeEventListener('mousedown', onDocPointer, true);
      return;
    }
    if (e.button === 2) return;
    if (e.target && stage.contains(e.target)) return;
    // 工具栏是「仍在编辑本格」的操作面，不是「点到表外」：这里若照常 clearTableInteraction，
    // 会 blur 单元格并清掉 DOM 选区 —— 无选区时点加粗，光标就直接没了
    // （有选区那条路只是碰巧被 applyInlineFormatToTableCell 的 restore 救回来）。
    if (e.target && e.target.closest && e.target.closest('.mda-cm-edit-toolbar')) return;
    clearTableInteraction();
  }
  document.addEventListener('mousedown', onDocPointer, true);

  function onTableWrapScroll() {
    const table = tableWrap.querySelector('table');
    if (!table) return;
    syncGutterLayout(table);
    // 拖拽中禁止全量重建手柄（会卸掉 pointer capture 目标 → 粘鼠标）
    if (resizeCtl && !(resizeCtl.isDragging && resizeCtl.isDragging())) {
      resizeCtl.rebuildHandles();
    }
  }
  tableWrap.addEventListener('scroll', onTableWrapScroll, { passive: true });

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(function () {
      if (resizeCtl && resizeCtl.isDragging && resizeCtl.isDragging()) return;
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
      onAddColumn: function (colIndex) {
        mutate(function (p) {
          insertTableColumn(p, colIndex, 'after');
        });
      },
      onAddRow: function (visualRow) {
        mutate(function (p) {
          if (visualRow <= 0) insertTableRow(p, 0, 'before');
          else insertTableRow(p, visualRow - 1, 'after');
        });
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
      if (resizeCtl && resizeCtl.refreshAddBtnI18n) resizeCtl.refreshAddBtnI18n(tt);
    },
  };
}

module.exports = {
  mountTableChrome: mountTableChrome,
  renderTableElement: renderTableElement,
  closeTableMenu: closeTableMenu,
  applySelectionHighlight: applySelectionHighlight,
};

/**
 * M8-E1 常驻编辑工具栏（F11-6，布局对齐竞品）。
 */
'use strict';

const { uiT } = require('./widgets/widget-common');
const { toolbarIconHtml } = require('./toolbar-icons');
const {
  getInlineToolbarState,
  deriveParagraphSelect,
  deriveListToolbarState,
} = require('./state/block-format');
const {
  deriveFormatAvailability,
  isFormatCmdAvailable,
} = require('./state/format-availability');
const {
  overlayPendingInlineState,
  hasPendingInputFormat,
  getWidgetPending,
  clearWidgetPending,
  syncWidgetPendingForCaret,
  setWidgetPendingListener,
} = require('./state/pending-inline-format');
const {
  runFormatCommand,
  insertTypeAtCursor,
  selectionTouchesFence,
  selectionTouchesReadonly,
  undoDepth,
  redoDepth,
  prepareInlineFormatToolbar,
} = require('./format-commands');
const { appendInsertMenuPanel } = require('./widgets/insert-menu-panel');
const { getCellInlineState, getCellInlineFlags } = require('./widgets/table-cell-content');
const {
  captureWidgetEditTarget,
  getEffectiveWidgetEditTarget,
  focusInWidgetInlineEditable,
  isFenceWidgetKind,
} = require('./widget-editable-guard');
const {
  getSelectedBlockOfKind,
  setBlockSelectionListener,
  clearSelectedBlock,
} = require('./widgets/block-selection');

/** 打开文档后尚未点进编辑区时，特殊/字符/段落格式按钮置灰 */
const NEEDS_EDITOR_ACTIVATION = {
  undo: 1,
  redo: 1,
  'clear-format': 1,
  bold: 1,
  italic: 1,
  underline: 1,
  strike: 1,
  code: 1,
  paragraph: 1,
  ul: 1,
  ol: 1,
  task: 1,
};

/** @type {HTMLElement | null} */
let activeInsertMenu = null;
/** @type {HTMLElement | null} */
let activeExportMenu = null;
/** @type {((ev: Event) => void) | null} */
let insertDismissFn = null;
/** @type {((ev: Event) => void) | null} */
let exportDismissFn = null;

/**
 * @param {((ev: Event) => void) | null} fn
 */
function unbindToolbarPopupDismiss(fn) {
  if (!fn || typeof document === 'undefined') return;
  document.removeEventListener('mousedown', fn, true);
  document.removeEventListener('keydown', fn, true);
}

function closeToolbarInsertMenu(opts) {
  unbindToolbarPopupDismiss(insertDismissFn);
  insertDismissFn = null;
  if (activeInsertMenu && activeInsertMenu.parentNode) {
    activeInsertMenu.parentNode.removeChild(activeInsertMenu);
  }
  activeInsertMenu = null;
  const expanded = document.querySelectorAll('.mda-cm-tb-insert[aria-expanded="true"]');
  for (let i = 0; i < expanded.length; i++) {
    expanded[i].setAttribute('aria-expanded', 'false');
  }
  if (opts && opts.restoreFocus) {
    const btn = document.querySelector('.mda-cm-tb-insert');
    if (btn && typeof btn.focus === 'function') btn.focus();
  }
}

function closeToolbarExportMenu(opts) {
  unbindToolbarPopupDismiss(exportDismissFn);
  exportDismissFn = null;
  if (activeExportMenu && activeExportMenu.parentNode) {
    activeExportMenu.parentNode.removeChild(activeExportMenu);
  }
  activeExportMenu = null;
  const expanded = document.querySelectorAll('.mda-cm-tb-export[aria-expanded="true"]');
  for (let i = 0; i < expanded.length; i++) {
    expanded[i].setAttribute('aria-expanded', 'false');
  }
  if (opts && opts.restoreFocus) {
    const btn = document.querySelector('.mda-cm-tb-export');
    if (btn && typeof btn.focus === 'function') btn.focus();
  }
}

/**
 * @param {string} cmd
 * @param {object} spec
 * @returns {string}
 */
function tbButtonHtml(cmd, spec) {
  spec = spec || {};
  const cls =
    'mda-cm-tb-btn' +
    (spec.toggle ? ' mda-cm-tb-toggle' : '') +
    (spec.soon ? ' mda-cm-tb-soon' : '') +
    (spec.extraClass ? ' ' + spec.extraClass : '');
  const inner = spec.icon
    ? toolbarIconHtml(spec.icon)
    : spec.label
      ? spec.label
      : '';
  const btn =
    '<button type="button" class="' +
    cls +
    '" data-cmd="' +
    cmd +
    '"' +
    (spec.soon ? ' data-soon="1"' : '') +
    (spec.pressed ? ' aria-pressed="false"' : '') +
    (spec.keyshortcuts ? ' aria-keyshortcuts="' + spec.keyshortcuts + '"' : '') +
    ' title="">' +
    inner +
    '</button>';
  if (spec.tip) {
    return '<span class="mda-cm-tb-tip-host" data-tip-cmd="' + cmd + '">' + btn + '</span>';
  }
  return btn;
}

/**
 * @param {HTMLElement} host
 * @param {import('@codemirror/view').EditorView} view
 * @param {object} opts
 */
function createEditorToolbar(host, view, opts) {
  opts = opts || {};
  const t = typeof opts.t === 'function' ? opts.t : function (k) {
    return uiT(k, opts.t);
  };

  const bar = document.createElement('div');
  bar.className = 'mda-cm-edit-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-orientation', 'horizontal');
  bar.innerHTML =
    '<div class="mda-cm-tb-main">' +
    '<div class="mda-cm-tb-group" data-group="history">' +
    tbButtonHtml('undo', { icon: 'undo', keyshortcuts: 'Control+Z', tip: true }) +
    tbButtonHtml('redo', { icon: 'redo', keyshortcuts: 'Control+Y', tip: true }) +
    tbButtonHtml('clear-format', { icon: 'clearFormat', tip: true }) +
    '</div>' +
    '<span class="mda-cm-tb-sep" aria-hidden="true"></span>' +
    '<div class="mda-cm-tb-group" data-group="paragraph">' +
    '<span class="mda-cm-tb-tip-host" data-tip-cmd="paragraph">' +
    '<select class="mda-cm-tb-select" data-cmd="paragraph" aria-label=""></select>' +
    '</span>' +
    '</div>' +
    '<span class="mda-cm-tb-sep" aria-hidden="true"></span>' +
    '<div class="mda-cm-tb-group" data-group="inline">' +
    tbButtonHtml('bold', {
      toggle: true,
      pressed: true,
      icon: 'bold',
      keyshortcuts: 'Control+B',
      tip: true,
    }) +
    tbButtonHtml('italic', {
      toggle: true,
      pressed: true,
      icon: 'italic',
      keyshortcuts: 'Control+I',
      tip: true,
    }) +
    tbButtonHtml('underline', {
      toggle: true,
      pressed: true,
      icon: 'underline',
      keyshortcuts: 'Control+U',
      tip: true,
    }) +
    tbButtonHtml('strike', {
      toggle: true,
      pressed: true,
      icon: 'strike',
      keyshortcuts: 'Control+Shift+S',
      tip: true,
    }) +
    tbButtonHtml('code', {
      toggle: true,
      pressed: true,
      icon: 'code',
      keyshortcuts: 'Control+Shift+C',
      tip: true,
    }) +
    '</div>' +
    '<span class="mda-cm-tb-sep" aria-hidden="true"></span>' +
    '<div class="mda-cm-tb-group" data-group="list">' +
    tbButtonHtml('task', {
      toggle: true,
      pressed: true,
      icon: 'task',
      keyshortcuts: 'Control+Shift+Y',
      tip: true,
    }) +
    tbButtonHtml('ul', {
      toggle: true,
      pressed: true,
      icon: 'ul',
      keyshortcuts: 'Control+Shift+I',
      tip: true,
    }) +
    tbButtonHtml('ol', {
      toggle: true,
      pressed: true,
      icon: 'ol',
      keyshortcuts: 'Control+Shift+U',
      tip: true,
    }) +
    '</div>' +
    '<span class="mda-cm-tb-sep" aria-hidden="true"></span>' +
    '<div class="mda-cm-tb-group" data-group="utility">' +
    tbButtonHtml('save', { icon: 'save' }) +
    tbButtonHtml('copy-preview', { icon: 'copyPreview', keyshortcuts: 'Control+Alt+C' }) +
    '<button type="button" class="mda-cm-tb-btn mda-cm-tb-export" data-cmd="export-open" aria-haspopup="menu" aria-expanded="false" aria-controls="mda-toolbar-export-menu" title="">' +
    toolbarIconHtml('export') +
    '<span class="mda-cm-tb-export-label"></span>' +
    '<span class="mda-cm-tb-export-caret" aria-hidden="true">▾</span>' +
    '</button>' +
    tbButtonHtml('find', { icon: 'find' }) +
    tbButtonHtml('comment', { icon: 'comment', pressed: true }) +
    '</div>' +
    '<span class="mda-cm-tb-sep" aria-hidden="true"></span>' +
    '<div class="mda-cm-tb-group" data-group="insert">' +
    '<button type="button" class="mda-cm-tb-btn mda-cm-tb-insert" data-cmd="insert-open" aria-haspopup="menu" aria-expanded="false" aria-controls="mda-toolbar-insert-menu" title="">' +
    '<span class="mda-cm-tb-insert-plus" aria-hidden="true">+</span>' +
    '<span class="mda-cm-tb-insert-label"></span>' +
    '</button>' +
    '<button type="button" class="mda-cm-tb-btn mda-cm-tb-ai" data-cmd="ai" data-soon="1" title="">' +
    toolbarIconHtml('ai') +
    '<span class="mda-cm-tb-ai-text"></span>' +
    '<span class="mda-cm-tb-ai-caret" aria-hidden="true">▾</span>' +
    '</button>' +
    '</div>' +
    '</div>';

  host.appendChild(bar);

  const paraSelect = /** @type {HTMLSelectElement} */ (bar.querySelector('[data-cmd="paragraph"]'));
  const paraOptions = [
    { v: 'paragraph', k: 'insertMenuBodyText' },
    { v: 'h1', k: 'insertMenuHeading1' },
    { v: 'h2', k: 'insertMenuHeading2' },
    { v: 'h3', k: 'insertMenuHeading3' },
    { v: 'h4', k: 'insertMenuHeading4' },
    { v: 'h5', k: 'insertMenuHeading5' },
    { v: 'h6', k: 'insertMenuHeading6' },
  ];
  const labels = {
    undo: 'tbUndo',
    redo: 'tbRedo',
    'clear-format': 'tbClearFormat',
    bold: 'tbBold',
    italic: 'tbItalic',
    underline: 'tbUnderline',
    strike: 'tbStrike',
    code: 'tbInlineCode',
    ul: 'tbUl',
    ol: 'tbOl',
    task: 'tbTask',
    save: 'tbSave',
    'copy-preview': 'tbCopyPreview',
    'export-open': 'tbExport',
    find: 'tbFind',
    comment: 'tbComment',
    'insert-open': 'tbInsert',
    ai: 'tbAi',
  };

  /** 双行 tip：首行功能+快捷键 / 次行说明 */
  const tipPairs = {
    undo: ['tbTipUndo', 'tbTipUndoWhere'],
    redo: ['tbTipRedo', 'tbTipRedoWhere'],
    'clear-format': ['tbTipClearFormat', 'tbTipClearFormatWhere'],
    paragraph: ['tbTipParagraph', 'tbTipParagraphWhere'],
    bold: ['tbTipBold', 'tbTipBoldWhere'],
    italic: ['tbTipItalic', 'tbTipItalicWhere'],
    underline: ['tbTipUnderline', 'tbTipUnderlineWhere'],
    strike: ['tbTipStrike', 'tbTipStrikeWhere'],
    code: ['tbTipCode', 'tbTipCodeWhere'],
    task: ['tbTipTask', 'tbTipTaskWhere'],
    ul: ['tbTipUl', 'tbTipUlWhere'],
    ol: ['tbTipOl', 'tbTipOlWhere'],
  };

  function applyLabels() {
    const prev = paraSelect.value;
    paraSelect.innerHTML = '';
    for (let i = 0; i < paraOptions.length; i++) {
      const o = document.createElement('option');
      o.value = paraOptions[i].v;
      o.textContent = t(paraOptions[i].k);
      paraSelect.appendChild(o);
    }
    if (prev) paraSelect.value = prev;
    paraSelect.setAttribute('aria-label', t('tbParagraph'));
    bar.setAttribute('aria-label', t('tbToolbar'));
    bar.querySelectorAll('[data-cmd]').forEach(function (el) {
      const cmd = el.getAttribute('data-cmd');
      if (!cmd) return;
      const tip = tipPairs[cmd];
      const host =
        (el.parentElement && el.parentElement.classList.contains('mda-cm-tb-tip-host')
          ? el.parentElement
          : null) || el;
      if (tip) {
        const line1 = t(tip[0]);
        const line2 = t(tip[1]);
        el.removeAttribute('title');
        el.setAttribute('aria-label', line1);
        host.setAttribute('data-tip', line1 + '\n' + line2);
        return;
      }
      const key = labels[cmd];
      if (key) {
        const label = t(key);
        el.setAttribute('title', label);
        el.setAttribute('aria-label', label);
        if (host !== el) host.removeAttribute('data-tip');
      }
    });
    const insertLabel = bar.querySelector('.mda-cm-tb-insert-label');
    if (insertLabel) insertLabel.textContent = t('tbInsert');
    const exportLabel = bar.querySelector('.mda-cm-tb-export-label');
    if (exportLabel) exportLabel.textContent = t('tbExport');
    const aiText = bar.querySelector('.mda-cm-tb-ai-text');
    if (aiText) aiText.textContent = t('tbAi');
  }

  applyLabels();

  /** @type {HTMLElement | null} */
  let floatingTip = null;
  /** @type {HTMLElement | null} */
  let tipAnchor = null;

  function ensureFloatingTip() {
    if (floatingTip && floatingTip.isConnected) return floatingTip;
    floatingTip = document.createElement('div');
    floatingTip.className = 'mda-cm-tb-floating-tip';
    floatingTip.setAttribute('role', 'tooltip');
    document.body.appendChild(floatingTip);
    return floatingTip;
  }

  function hideFloatingTip() {
    tipAnchor = null;
    if (floatingTip) floatingTip.classList.remove('is-visible');
  }

  function showFloatingTip(host) {
    const text = host.getAttribute('data-tip');
    if (!text) return;
    const tip = ensureFloatingTip();
    tip.textContent = text;
    tipAnchor = host;
    tip.classList.add('is-visible');
    const rect = host.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = rect.bottom + 6;
    if (top + tipRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - tipRect.height - 6);
    }
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  bar.addEventListener('mouseover', function (e) {
    const tgel = e.target;
    if (!tgel || !tgel.closest) return;
    const host = tgel.closest('.mda-cm-tb-tip-host');
    if (!host || !bar.contains(host)) return;
    showFloatingTip(host);
  });
  bar.addEventListener('mouseout', function (e) {
    const related = e.relatedTarget;
    if (tipAnchor && related && tipAnchor.contains(related)) return;
    if (related && related.closest && related.closest('.mda-cm-tb-tip-host') === tipAnchor) return;
    hideFloatingTip();
  });
  bar.addEventListener('focusin', function (e) {
    const tgel = e.target;
    if (!tgel || !tgel.closest) return;
    const host = tgel.closest('.mda-cm-tb-tip-host');
    if (host && bar.contains(host)) showFloatingTip(host);
  });
  bar.addEventListener('focusout', function () {
    hideFloatingTip();
  });

  function toolbarControls() {
    return Array.prototype.slice.call(bar.querySelectorAll('button[data-cmd], select[data-cmd]'));
  }

  function enabledControls() {
    return toolbarControls().filter(function (el) {
      return !el.disabled;
    });
  }

  function setRovingTabindex(focusEl) {
    const items = toolbarControls();
    let fallback = null;
    for (let i = 0; i < items.length; i++) {
      if (!fallback && !items[i].disabled) fallback = items[i];
    }
    const active = focusEl && !focusEl.disabled ? focusEl : fallback;
    for (let i = 0; i < items.length; i++) {
      items[i].tabIndex = items[i] === active ? 0 : -1;
    }
  }

  function moveToolbarFocus(current, delta) {
    const items = enabledControls();
    if (!items.length) return;
    let idx = items.indexOf(current);
    if (idx < 0) idx = 0;
    idx = (idx + delta + items.length) % items.length;
    setRovingTabindex(items[idx]);
    items[idx].focus();
  }

  bar.addEventListener('keydown', function (e) {
    const target = e.target;
    if (!target || !bar.contains(target)) return;
    if (target.tagName === 'SELECT' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveToolbarFocus(target, 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveToolbarFocus(target, -1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const items = enabledControls();
      if (items[0]) {
        setRovingTabindex(items[0]);
        items[0].focus();
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      const items = enabledControls();
      const last = items[items.length - 1];
      if (last) {
        setRovingTabindex(last);
        last.focus();
      }
    }
  });

  bar.addEventListener('focusin', function (e) {
    const target = e.target && e.target.closest ? e.target.closest('[data-cmd]') : null;
    if (target && bar.contains(target)) setRovingTabindex(target);
  });

  setRovingTabindex(null);

  let skipNextToolbarClick = false;
  const CELL_FORMAT_CMDS = { bold: 1, italic: 1, underline: 1, strike: 1, code: 1, 'clear-format': 1 };
  const INLINE_FORMAT_CMDS = { bold: 1, italic: 1, underline: 1, strike: 1, code: 1, 'clear-format': 1 };

  bar.addEventListener(
    'mousedown',
    function (e) {
      if (e.button !== 0) return;
      const hit = e.target && e.target.closest ? e.target.closest('[data-cmd]') : null;
      const cmd = hit && hit.getAttribute('data-cmd');
      if (!cmd) return;
      const target = captureWidgetEditTarget();
      if (target && target.kind === 'table-cell' && CELL_FORMAT_CMDS[cmd]) {
        e.preventDefault();
        e.stopPropagation();
        skipNextToolbarClick = true;
        runFormatCommand(view, cmd, formatOpts());
        refresh();
        return;
      }
      if (INLINE_FORMAT_CMDS[cmd]) {
        e.preventDefault();
        prepareInlineFormatToolbar(view);
      }
    },
    true
  );

  function onDocFocusIn() {
    refresh();
  }
  document.addEventListener('focusin', onDocFocusIn);

  // 格内移动光标不经 CM6 事务（选区活在 contenteditable 里），mount 的 update 钩子收不到，
  // 工具栏因此一直停在进格那一刻的状态。用 selectionchange 补这条刷新通路；
  // 拖选期间该事件很密集，用 rAF 合并到每帧一次。
  let selRefreshRaf = 0;
  function onDocSelectionChange() {
    if (selRefreshRaf || !focusInWidgetInlineEditable()) return;
    selRefreshRaf = requestAnimationFrame(function () {
      selRefreshRaf = 0;
      refresh();
    });
  }
  document.addEventListener('selectionchange', onDocSelectionChange);

  function formatOpts() {
    return {
      t: t,
      onPickImageInsert: opts.onPickImageInsert,
    };
  }

  function handleSoon(cmd) {
    if (typeof opts.onSoon === 'function') opts.onSoon('toolbar', cmd);
  }

  /** 文档打开后需先点进编辑区才启用格式类；失焦不回退，避免点工具栏时误置灰 */
  let editorActivated = false;

  function notifyDocOpened() {
    editorActivated = false;
    clearSelectedBlock();
    refresh();
  }

  function refresh() {
    if (!view || view.destroyed) return;
    if (view.hasFocus || focusInWidgetInlineEditable()) {
      editorActivated = true;
    }
    const hrSelected = !!getSelectedBlockOfKind('hr');
    const formatLocked = !editorActivated || hrSelected;
    const state = view.state;
    const para = deriveParagraphSelect(state);
    const lists = deriveListToolbarState(state);
    let inline = overlayPendingInlineState(state, getInlineToolbarState(state));
    const avail = deriveFormatAvailability(state);
    const widgetTarget = getEffectiveWidgetEditTarget();
    const inFence =
      selectionTouchesFence(state) ||
      (widgetTarget && isFenceWidgetKind(widgetTarget.kind));
    const inTableCell = !!(widgetTarget && widgetTarget.kind === 'table-cell');
    if (!inTableCell) clearWidgetPending();
    const wp = inTableCell ? getWidgetPending() : null;
    if (inTableCell) {
      // 格内选区在 contenteditable 里，CM6 文档选区停在表首，
      // 拿 state 算出来的一律是「无样式」——须改问单元格自己的 Markdown
      const cellInline = getCellInlineState(widgetTarget.el, widgetTarget);
      if (cellInline) inline = cellInline;
      const caret = getCellInlineFlags(widgetTarget.el, widgetTarget);
      const liveWp = caret
        ? syncWidgetPendingForCaret(widgetTarget.el, caret.pos, caret.flags)
        : wp;
      const collapsed = widgetTarget.visEnd === widgetTarget.visStart;
      if (liveWp && liveWp.armed && collapsed) {
        function markFlag(on) {
          return { on: !!on, mixed: false };
        }
        inline = {
          bold: markFlag(liveWp.marks.bold),
          italic: markFlag(liveWp.marks.italic),
          underline: markFlag(liveWp.marks.underline),
          strike: markFlag(liveWp.marks.strike),
          code: markFlag(liveWp.marks.code),
        };
      }
    }
    const TABLE_CELL_ALLOWED = {
      bold: 1,
      italic: 1,
      underline: 1,
      strike: 1,
      code: 1,
      'clear-format': 1,
    };
    const AVAIL_CHECK_CMDS = {
      bold: 1,
      italic: 1,
      underline: 1,
      strike: 1,
      code: 1,
      ul: 1,
      ol: 1,
      task: 1,
    };
    let readonly = typeof opts.isReadonly === 'function' ? !!opts.isReadonly() : false;
    if (!readonly) readonly = selectionTouchesReadonly(state);
    const mixedOpt = paraSelect.querySelector('option[data-mixed="1"]');
    if (para.mixed) {
      if (!mixedOpt) {
        const o = document.createElement('option');
        o.value = '';
        o.dataset.mixed = '1';
        o.textContent = t('tbParagraphMixed');
        paraSelect.insertBefore(o, paraSelect.firstChild);
      } else {
        mixedOpt.textContent = t('tbParagraphMixed');
      }
      paraSelect.value = '';
    } else {
      if (mixedOpt) paraSelect.removeChild(mixedOpt);
      paraSelect.value = para.value;
    }
    const canUndo = undoDepth(state) > 0;
    const canRedo = redoDepth(state) > 0;
    const undoBtn = bar.querySelector('[data-cmd="undo"]');
    const redoBtn = bar.querySelector('[data-cmd="redo"]');
    if (undoBtn) undoBtn.disabled = readonly || formatLocked || !canUndo;
    if (redoBtn) redoBtn.disabled = readonly || formatLocked || !canRedo;
    toolbarControls().forEach(function (el) {
      const cmd = el.getAttribute('data-cmd');
      if (
        !cmd ||
        cmd === 'find' ||
        cmd === 'comment' ||
        cmd === 'copy-preview' ||
        cmd === 'export-open'
      ) {
        return;
      }
      if (cmd === 'undo' || cmd === 'redo') return;
      if (cmd === 'save') {
        el.disabled = readonly;
        return;
      }
      let disabled =
        readonly ||
        (formatLocked && !!NEEDS_EDITOR_ACTIVATION[cmd]) ||
        inFence ||
        (inTableCell && !TABLE_CELL_ALLOWED[cmd]);
      if (!disabled && AVAIL_CHECK_CMDS[cmd] && !inTableCell) {
        disabled = !isFormatCmdAvailable(cmd, avail);
      }
      if (!disabled && cmd === 'clear-format') {
        disabled = !hasPendingInputFormat(state);
      }
      el.disabled = !!disabled;
    });
    bar.querySelectorAll('.mda-cm-tb-toggle[data-cmd]').forEach(function (btn) {
      const cmd = btn.getAttribute('data-cmd');
      let flag = { on: false, mixed: false };
      if (!formatLocked && !btn.disabled) {
        if (cmd === 'bold') flag = inline.bold;
        else if (cmd === 'italic') flag = inline.italic;
        else if (cmd === 'underline') flag = inline.underline;
        else if (cmd === 'strike') flag = inline.strike;
        else if (cmd === 'code') flag = inline.code;
        else if (cmd === 'ul') flag = lists.ul;
        else if (cmd === 'ol') flag = lists.ol;
        else if (cmd === 'task') flag = lists.task;
      }
      btn.classList.toggle('is-active', !!flag.on);
      btn.classList.toggle('is-mixed', !!flag.mixed);
      if (btn.hasAttribute('aria-pressed')) {
        btn.setAttribute('aria-pressed', flag.mixed ? 'mixed' : flag.on ? 'true' : 'false');
      }
    });
    const commentBtn = bar.querySelector('[data-cmd="comment"]');
    if (commentBtn && typeof opts.getPanelVisible === 'function') {
      const vis = !!opts.getPanelVisible();
      commentBtn.classList.toggle('is-active', vis);
      commentBtn.setAttribute('aria-pressed', vis ? 'true' : 'false');
    }
    const focused = bar.querySelector('[tabindex="0"]');
    setRovingTabindex(focused && !focused.disabled ? focused : null);
  }

  function placeToolbarPopup(menu, anchorEl) {
    menu.style.left = '0px';
    menu.style.top = '0px';
    document.body.appendChild(menu);
    const rect = anchorEl.getBoundingClientRect();
    const pad = 6;
    let left = rect.left;
    let top = rect.bottom + 2;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (top + h > window.innerHeight - pad) top = rect.top - h - 2;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function bindToolbarPopupDismiss(menu, anchorEl, closeFn, kind) {
    unbindToolbarPopupDismiss(kind === 'export' ? exportDismissFn : insertDismissFn);
    const dismiss = function (ev) {
      if (kind === 'export' && activeExportMenu !== menu) {
        unbindToolbarPopupDismiss(dismiss);
        return;
      }
      if (kind === 'insert' && activeInsertMenu !== menu) {
        unbindToolbarPopupDismiss(dismiss);
        return;
      }
      if (ev && ev.type === 'keydown') {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        closeFn({ restoreFocus: true });
        return;
      }
      const target = ev && ev.target;
      if (target && menu.contains(/** @type {Node} */ (target))) return;
      if (target && anchorEl.contains(/** @type {Node} */ (target))) return;
      closeFn();
    };
    if (kind === 'export') exportDismissFn = dismiss;
    else insertDismissFn = dismiss;
    window.setTimeout(function () {
      if (kind === 'export' && activeExportMenu !== menu) return;
      if (kind === 'insert' && activeInsertMenu !== menu) return;
      document.addEventListener('mousedown', dismiss, true);
      document.addEventListener('keydown', dismiss, true);
    }, 0);
  }

  function openInsertMenu(anchorEl) {
    closeToolbarExportMenu();
    closeToolbarInsertMenu();
    const menu = document.createElement('div');
    menu.className =
      'mda-context-menu mda-empty-line-insert-menu mda-block-handle-submenu mda-insert-menu-panel';
    menu.id = 'mda-toolbar-insert-menu';
    menu.setAttribute('role', 'menu');
    appendInsertMenuPanel(menu, t, function (id, soon) {
      closeToolbarInsertMenu();
      if (soon) {
        handleSoon(id);
        return;
      }
      if (id === 'link') {
        runFormatCommand(view, 'link', formatOpts());
        refresh();
        return;
      }
      insertTypeAtCursor(view, id, formatOpts());
      refresh();
    });
    const insertBtn = bar.querySelector('[data-cmd="insert-open"]');
    if (insertBtn) insertBtn.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-label', t('tbInsert'));
    placeToolbarPopup(menu, anchorEl);
    activeInsertMenu = menu;
    const firstItem = menu.querySelector('[role="menuitem"]');
    if (firstItem && typeof firstItem.focus === 'function') firstItem.focus();
    bindToolbarPopupDismiss(menu, anchorEl, closeToolbarInsertMenu, 'insert');
  }

  function runExportKind(kind) {
    closeToolbarExportMenu();
    if (kind === 'html' && typeof opts.onExportHtml === 'function') opts.onExportHtml();
    else if (kind === 'pdf' && typeof opts.onExportPdf === 'function') opts.onExportPdf();
    else if (kind === 'docx' && typeof opts.onExportDocx === 'function') opts.onExportDocx();
  }

  function openExportMenu(anchorEl) {
    closeToolbarInsertMenu();
    closeToolbarExportMenu();
    const menu = document.createElement('div');
    menu.className = 'mda-context-menu';
    menu.id = 'mda-toolbar-export-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('tbExport'));
    const items = [
      { id: 'html', key: 'tbExportHtml' },
      { id: 'pdf', key: 'tbExportPdf' },
      { id: 'docx', key: 'tbExportDocx' },
    ];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mda-menu-item';
      row.setAttribute('role', 'menuitem');
      row.setAttribute('tabindex', '-1');
      row.dataset.export = it.id;
      row.textContent = t(it.key);
      row.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        runExportKind(it.id);
      });
      menu.appendChild(row);
    }
    const exportBtn = bar.querySelector('[data-cmd="export-open"]');
    if (exportBtn) exportBtn.setAttribute('aria-expanded', 'true');
    placeToolbarPopup(menu, anchorEl);
    activeExportMenu = menu;
    const firstItem = menu.querySelector('[role="menuitem"]');
    if (firstItem && typeof firstItem.focus === 'function') firstItem.focus();
    bindToolbarPopupDismiss(menu, anchorEl, closeToolbarExportMenu, 'export');
  }

  bar.addEventListener('click', function (e) {
    const target = e.target && e.target.closest ? e.target.closest('[data-cmd]') : null;
    if (!target || !bar.contains(target)) return;
    const cmd = target.getAttribute('data-cmd');
    if (!cmd) return;
    e.preventDefault();
    if (skipNextToolbarClick) {
      skipNextToolbarClick = false;
      return;
    }
    if (target.getAttribute('data-soon') === '1') {
      handleSoon(cmd);
      return;
    }
    if (cmd === 'insert-open') {
      if (activeInsertMenu) {
        closeToolbarInsertMenu();
        return;
      }
      openInsertMenu(/** @type {HTMLElement} */ (target));
      return;
    }
    if (cmd === 'export-open') {
      if (activeExportMenu) {
        closeToolbarExportMenu();
        return;
      }
      openExportMenu(/** @type {HTMLElement} */ (target));
      return;
    }
    if (cmd === 'copy-preview') {
      if (typeof opts.onCopyPreview === 'function') opts.onCopyPreview();
      return;
    }
    if (cmd === 'find') {
      if (typeof opts.onFind === 'function') opts.onFind();
      return;
    }
    if (cmd === 'save') {
      if (typeof opts.onSave === 'function') opts.onSave();
      return;
    }
    if (cmd === 'comment') {
      if (typeof opts.onTogglePanel === 'function') opts.onTogglePanel();
      refresh();
      return;
    }
    runFormatCommand(view, cmd, formatOpts());
    refresh();
  });

  paraSelect.addEventListener('change', function () {
    const v = paraSelect.value;
    if (!v) return;
    if (v === 'paragraph') runFormatCommand(view, 'paragraph', formatOpts());
    else runFormatCommand(view, v, formatOpts());
    refresh();
  });

  refresh();
  setBlockSelectionListener(function () {
    refresh();
  });
  setWidgetPendingListener(function () {
    refresh();
  });

  return {
    refresh: refresh,
    notifyDocOpened: notifyDocOpened,
    refreshI18n: function () {
      applyLabels();
      refresh();
    },
    destroy: function () {
      hideFloatingTip();
      if (floatingTip && floatingTip.parentNode) floatingTip.parentNode.removeChild(floatingTip);
      floatingTip = null;
      setBlockSelectionListener(null);
      setWidgetPendingListener(null);
      document.removeEventListener('focusin', onDocFocusIn);
      document.removeEventListener('selectionchange', onDocSelectionChange);
      if (selRefreshRaf) cancelAnimationFrame(selRefreshRaf);
      selRefreshRaf = 0;
      closeToolbarInsertMenu();
      closeToolbarExportMenu();
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    },
  };
}

module.exports = {
  createEditorToolbar: createEditorToolbar,
  closeToolbarInsertMenu: closeToolbarInsertMenu,
  closeToolbarExportMenu: closeToolbarExportMenu,
};

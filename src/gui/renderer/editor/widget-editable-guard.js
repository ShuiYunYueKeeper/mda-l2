/**
 * 块 widget 内 contenteditable（表格格 / 代码 / 流程图源码等）：
 * 文字拖选走 DOM ::selection；CM6 文档选区用 transactionFilter 坍缩，勿用 domEventHandlers
 * 返回 true（会 preventDefault，拖选失效）。
 */
'use strict';

const { EditorState, EditorSelection, Transaction } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');

/** @type {boolean} */
let widgetEditablePointerActive = false;
let docMouseUpBound = false;
let docFocusBound = false;

/** @type {{ kind: string, el: HTMLElement, range: Range | null } | null} */
let lastWidgetEdit = null;

const WIDGET_EDIT_SELECTOR =
  '.mda-cm-table th[contenteditable="true"], .mda-cm-table td[contenteditable="true"],' +
  '.mda-cm-code-input[contenteditable="true"],' +
  '.mda-cm-mermaid-source-input[contenteditable="true"],' +
  '.mda-cm-math-source-input[contenteditable="true"]';

/**
 * @param {EventTarget | null} target
 */
function isWidgetInlineEditableTarget(target) {
  if (!target || !target.closest) return false;
  return !!target.closest(WIDGET_EDIT_SELECTOR);
}

function tableCellFromNode(node) {
  if (!node) return null;
  const el = node.nodeType === 1 ? /** @type {HTMLElement} */ (node) : node.parentElement;
  if (!el || !el.closest) return null;
  const cell = el.closest('th[contenteditable], td[contenteditable]');
  if (cell && cell.closest('.mda-cm-table')) return /** @type {HTMLElement} */ (cell);
  return null;
}

/**
 * 嵌套 contenteditable 时 activeElement 常是 .cm-content，须从选区找格子。
 * @returns {HTMLElement | null}
 */
function tableCellFromSelection() {
  if (typeof window === 'undefined' || !window.getSelection) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount < 1) return null;
  return (
    tableCellFromNode(sel.anchorNode) ||
    tableCellFromNode(sel.focusNode) ||
    (sel.rangeCount ? tableCellFromNode(sel.getRangeAt(0).commonAncestorContainer) : null)
  );
}

/**
 * @param {HTMLElement} cell
 * @returns {{ range: Range | null, visStart: number, visEnd: number }}
 */
function snapshotCellSelection(cell) {
  const empty = { range: null, visStart: 0, visEnd: 0 };
  if (!cell || typeof window === 'undefined' || !window.getSelection) return empty;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount < 1) return empty;
  const range = sel.getRangeAt(0);
  try {
    if (!cell.contains(range.startContainer) || !cell.contains(range.endContainer)) return empty;
    const pre = document.createRange();
    pre.selectNodeContents(cell);
    pre.setEnd(range.startContainer, range.startOffset);
    const visStart = pre.toString().length;
    return {
      range: range.cloneRange(),
      visStart: visStart,
      visEnd: visStart + range.toString().length,
    };
  } catch (_) {
    return empty;
  }
}

/**
 * @param {EventTarget | null} target
 * @returns {{ kind: 'table-cell' | 'code' | 'mermaid' | 'math', el: HTMLElement } | null}
 */
function classifyWidgetEditable(target) {
  if (target && target.closest) {
    const el = /** @type {HTMLElement} */ (target);
    const code = el.closest('.mda-cm-code-input[contenteditable="true"]');
    if (code) return { kind: 'code', el: /** @type {HTMLElement} */ (code) };
    const mermaid = el.closest('.mda-cm-mermaid-source-input[contenteditable="true"]');
    if (mermaid) return { kind: 'mermaid', el: /** @type {HTMLElement} */ (mermaid) };
    const math = el.closest('.mda-cm-math-source-input[contenteditable="true"]');
    if (math) return { kind: 'math', el: /** @type {HTMLElement} */ (math) };
    const cell = tableCellFromNode(el);
    if (cell) return { kind: 'table-cell', el: cell };
  }
  const selCell = tableCellFromSelection();
  if (selCell) return { kind: 'table-cell', el: selCell };
  return null;
}

function isFenceWidgetKind(kind) {
  return kind === 'code' || kind === 'mermaid' || kind === 'math';
}

/**
 * 在焦点离开 widget 前调用（工具栏 mousedown capture）。
 * @returns {{ kind: string, el: HTMLElement, range: Range | null, visStart: number, visEnd: number } | null}
 */
function captureWidgetEditTarget() {
  if (typeof document === 'undefined') return lastWidgetEdit;
  const live =
    classifyWidgetEditable(document.activeElement) ||
    classifyWidgetEditable(tableCellFromSelection());
  if (!live) return lastWidgetEdit;
  if (live.kind === 'table-cell') {
    const snap = snapshotCellSelection(live.el);
    lastWidgetEdit = {
      kind: live.kind,
      el: live.el,
      range: snap.range,
      visStart: snap.visStart,
      visEnd: snap.visEnd,
    };
    return lastWidgetEdit;
  }
  lastWidgetEdit = { kind: live.kind, el: live.el, range: null, visStart: 0, visEnd: 0 };
  return lastWidgetEdit;
}

function getEffectiveWidgetEditTarget() {
  if (typeof document !== 'undefined') {
    const live = classifyWidgetEditable(document.activeElement);
    if (live) {
      if (live.kind === 'table-cell') {
        const snap = snapshotCellSelection(live.el);
        if (snap.visEnd > snap.visStart || snap.range) {
          lastWidgetEdit = {
            kind: 'table-cell',
            el: live.el,
            range: snap.range,
            visStart: snap.visStart,
            visEnd: snap.visEnd,
          };
          return lastWidgetEdit;
        }
      }
      return lastWidgetEdit && lastWidgetEdit.el === live.el
        ? lastWidgetEdit
        : { kind: live.kind, el: live.el, range: null, visStart: 0, visEnd: 0 };
    }
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('.mda-cm-edit-toolbar')) return lastWidgetEdit;
  }
  return lastWidgetEdit;
}

function focusInWidgetInlineEditable() {
  if (typeof document === 'undefined') return false;
  const ae = document.activeElement;
  if (!ae || !ae.closest) return false;
  return isWidgetInlineEditableTarget(ae);
}

function shouldSuppressCm6Selection() {
  return widgetEditablePointerActive || focusInWidgetInlineEditable();
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function collapseCm6Selection(view) {
  if (!view || view.destroyed) return;
  const sel = view.state.selection.main;
  if (sel.empty) return;
  view.dispatch({
    selection: { anchor: sel.head, head: sel.head },
    annotations: Transaction.addToHistory.of(false),
  });
}

function ensureDocMouseUpBound() {
  if (docMouseUpBound || typeof document === 'undefined') return;
  docMouseUpBound = true;
  document.addEventListener(
    'mouseup',
    function () {
      widgetEditablePointerActive = false;
    },
    true
  );
}

function ensureDocFocusBound() {
  if (docFocusBound || typeof document === 'undefined') return;
  docFocusBound = true;
  document.addEventListener(
    'selectionchange',
    function () {
      const cell = tableCellFromSelection();
      if (!cell) return;
      const snap = snapshotCellSelection(cell);
      lastWidgetEdit = {
        kind: 'table-cell',
        el: cell,
        range: snap.range,
        visStart: snap.visStart,
        visEnd: snap.visEnd,
      };
    },
    false
  );
  document.addEventListener(
    'focusin',
    function (e) {
      const t = classifyWidgetEditable(e.target);
      if (t) {
        if (t.kind === 'table-cell') {
          const snap = snapshotCellSelection(t.el);
          lastWidgetEdit = {
            kind: t.kind,
            el: t.el,
            range: snap.range,
            visStart: snap.visStart,
            visEnd: snap.visEnd,
          };
        } else {
          lastWidgetEdit = { kind: t.kind, el: t.el, range: null, visStart: 0, visEnd: 0 };
        }
        return;
      }
      const el = /** @type {HTMLElement} */ (e.target);
      if (el && el.closest && el.closest('.mda-cm-edit-toolbar')) return;
      lastWidgetEdit = null;
    },
    true
  );
}

/**
 * 捕获阶段 stopPropagation，避免拖选 mousemove 冒泡到 CM6 contentDOM。
 * @param {HTMLElement} el
 */
function attachWidgetEditablePointerIsolation(el) {
  if (!el || el.dataset.mdaWidgetEditableIso === '1') return;
  el.dataset.mdaWidgetEditableIso = '1';
  ensureDocMouseUpBound();
  el.addEventListener(
    'mousedown',
    function (e) {
      if (e.button === 0) widgetEditablePointerActive = true;
    },
    true
  );
  el.addEventListener(
    'mousemove',
    function (e) {
      if (e.buttons & 1) e.stopPropagation();
    },
    true
  );
  el.addEventListener(
    'mouseup',
    function (e) {
      e.stopPropagation();
      widgetEditablePointerActive = false;
    },
    true
  );
}

function createWidgetEditableGuardExtension() {
  ensureDocMouseUpBound();
  ensureDocFocusBound();
  return [
    EditorState.transactionFilter.of(function (tr) {
      if (!tr.selection || !shouldSuppressCm6Selection()) return tr;
      const main = tr.selection.main;
      if (main.empty) return tr;
      const head = main.head;
      if (main.anchor === head && main.from === head && main.to === head) return tr;
      return {
        ...tr,
        selection: EditorSelection.single(head),
      };
    }),
    EditorView.domEventHandlers({
      mousedown: function (event, view) {
        if (event.button !== 0) return false;
        if (!isWidgetInlineEditableTarget(event.target)) {
          return false;
        }
        widgetEditablePointerActive = true;
        collapseCm6Selection(view);
        return false;
      },
    }),
  ];
}

module.exports = {
  isWidgetInlineEditableTarget: isWidgetInlineEditableTarget,
  classifyWidgetEditable: classifyWidgetEditable,
  isFenceWidgetKind: isFenceWidgetKind,
  captureWidgetEditTarget: captureWidgetEditTarget,
  getEffectiveWidgetEditTarget: getEffectiveWidgetEditTarget,
  focusInWidgetInlineEditable: focusInWidgetInlineEditable,
  attachWidgetEditablePointerIsolation: attachWidgetEditablePointerIsolation,
  createWidgetEditableGuardExtension: createWidgetEditableGuardExtension,
  collapseCm6Selection: collapseCm6Selection,
};

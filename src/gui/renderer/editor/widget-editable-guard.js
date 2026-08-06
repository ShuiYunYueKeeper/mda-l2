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

/**
 * @param {EventTarget | null} target
 */
function isWidgetInlineEditableTarget(target) {
  if (!target || !target.closest) return false;
  return !!target.closest(
    '.mda-cm-table th[contenteditable="true"], .mda-cm-table td[contenteditable="true"],' +
      '.mda-cm-code-input[contenteditable="true"],' +
      '.mda-cm-mermaid-source-input[contenteditable="true"],' +
      '.mda-cm-math-source-input[contenteditable="true"]'
  );
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
  focusInWidgetInlineEditable: focusInWidgetInlineEditable,
  attachWidgetEditablePointerIsolation: attachWidgetEditablePointerIsolation,
  createWidgetEditableGuardExtension: createWidgetEditableGuardExtension,
  collapseCm6Selection: collapseCm6Selection,
};

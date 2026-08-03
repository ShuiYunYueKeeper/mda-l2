/**
 * 正文行内公式选中态（点击蓝框；复制/剪切/删除；撤销由 CM6 history）。
 */
'use strict';

const { ViewPlugin, keymap } = require('@codemirror/view');
const { Prec, Transaction } = require('@codemirror/state');
const { copyText } = require('./widget-common');

/** @type {{ from: number, to: number, source: string, tex?: string } | null} */
let selected = null;
/** @type {(text: string) => void | null} */
let copyFn = null;

/**
 * 行内源码精确匹配（勿用 expandBlockRange，否则会扩成整行）。
 * @param {string} text
 * @param {string} src
 * @param {number | null | undefined} nearFrom
 * @returns {{ from: number, to: number } | null}
 */
function findNearestInlineMathRange(text, src, nearFrom) {
  const needle = String(src || '');
  if (!needle) return null;
  let best = null;
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(needle, i);
    if (idx < 0) break;
    const dist = Math.abs(idx - (nearFrom != null ? nearFrom : idx));
    if (!best || dist < best.dist) best = { from: idx, to: idx + needle.length, dist: dist };
    i = idx + 1;
  }
  return best ? { from: best.from, to: best.to } : null;
}

/**
 * @param {{ from: number, to: number, source: string, tex?: string } | null} block
 */
function setSelectedInlineMath(block) {
  selected = block;
}

function getSelectedInlineMath() {
  return selected;
}

function clearSelectedInlineMath() {
  selected = null;
}

/**
 * @param {(text: string) => void} [fn]
 */
function setInlineMathCopyFn(fn) {
  copyFn = typeof fn === 'function' ? fn : null;
}

/**
 * @param {HTMLElement | null | undefined} editorRoot
 */
function clearInlineMathSelectedClass(editorRoot) {
  if (!editorRoot || !editorRoot.querySelectorAll) return;
  const nodes = editorRoot.querySelectorAll('.mda-cm-math-inline-selected');
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].classList.remove('mda-cm-math-inline-selected');
  }
}

/**
 * @param {HTMLElement | null | undefined} editorRoot
 */
function syncSelectedInlineMathClass(editorRoot) {
  const sel = selected;
  if (!sel || !editorRoot) return;
  clearInlineMathSelectedClass(editorRoot);
  const el = editorRoot.querySelector(
    '.mda-cm-math-inline[data-mda-inline-math-from="' +
      sel.from +
      '"][data-mda-inline-math-to="' +
      sel.to +
      '"]'
  );
  if (el) el.classList.add('mda-cm-math-inline-selected');
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function reconcileSelectedInlineMath(view) {
  const sel = selected;
  if (!sel || !view || !view.dom) return;
  if (!sel.source) {
    syncSelectedInlineMathClass(view.dom);
    return;
  }
  const text =
    typeof view.state.doc.toString === 'function'
      ? view.state.doc.toString()
      : view.state.doc.sliceString(0, view.state.doc.length);
  const range = findNearestInlineMathRange(text, sel.source, sel.from);
  if (!range) {
    // 已删除：清蓝框，保留内存态供撤销后恢复
    clearInlineMathSelectedClass(view.dom);
    return;
  }
  if (sel.from !== range.from || sel.to !== range.to) {
    selected = {
      from: range.from,
      to: range.to,
      source: sel.source,
      tex: sel.tex,
    };
  }
  syncSelectedInlineMathClass(view.dom);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, source: string, tex?: string }} block
 */
function selectInlineMath(view, block) {
  if (!view || !block || block.from == null || !(block.to > block.from)) return;
  setSelectedInlineMath({
    from: block.from,
    to: block.to,
    source: block.source || '',
    tex: block.tex,
  });
  try {
    view.dispatch({
      selection: { anchor: block.from, head: block.to },
    });
    view.focus();
  } catch (_) {
    /* ignore */
  }
  syncSelectedInlineMathClass(view.dom);
}

function copySelectedInlineMath(view) {
  const sel = getSelectedInlineMath();
  if (!sel || !sel.source) return false;
  copyText(sel.source, copyFn);
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @returns {{ from: number, to: number } | null}
 */
function resolveSelectedInlineMathRange(view) {
  const sel = getSelectedInlineMath();
  if (!sel || !view || !sel.source) return null;
  const text =
    typeof view.state.doc.toString === 'function'
      ? view.state.doc.toString()
      : view.state.doc.sliceString(0, view.state.doc.length);
  const range = findNearestInlineMathRange(text, sel.source, sel.from);
  if (!range) return null;
  if (sel.from !== range.from || sel.to !== range.to) {
    selected = {
      from: range.from,
      to: range.to,
      source: sel.source,
      tex: sel.tex,
    };
  }
  return range;
}

function deleteSelectedInlineMath(view) {
  const range = resolveSelectedInlineMathRange(view);
  if (!range || !view) return false;
  const from = range.from;
  const to = range.to;
  // 勿用 deleteBlockRange：其会吞掉行尾换行，破坏正文行内公式旁文本。
  const main = view.state.selection.main;
  if (main.from !== from || main.to !== from) {
    view.dispatch({
      selection: { anchor: from, head: from },
      annotations: Transaction.addToHistory.of(false),
    });
  }
  view.dispatch({
    changes: { from: from, to: to, insert: '' },
    selection: { anchor: from, head: from },
    userEvent: 'delete',
  });
  return true;
}

function cutSelectedInlineMath(view) {
  if (!copySelectedInlineMath(view)) return false;
  return deleteSelectedInlineMath(view);
}

function createInlineMathSelectionSyncPlugin() {
  return ViewPlugin.fromClass(
    class {
      constructor() {
        this._raf = 0;
      }
      update(update) {
        if (!update.docChanged || !selected) return;
        const view = update.view;
        const self = this;
        if (self._raf) cancelAnimationFrame(self._raf);
        self._raf = requestAnimationFrame(function () {
          self._raf = 0;
          reconcileSelectedInlineMath(view);
        });
      }
      destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
      }
    }
  );
}

/**
 * @param {{ copyText?: Function }} [opts]
 */
function createInlineMathShortcutKeymap(opts) {
  if (opts && typeof opts.copyText === 'function') {
    setInlineMathCopyFn(opts.copyText);
  }
  return Prec.high(
    keymap.of([
      {
        key: 'Delete',
        run: function (view) {
          if (!getSelectedInlineMath()) return false;
          return deleteSelectedInlineMath(view);
        },
      },
      {
        key: 'Backspace',
        run: function (view) {
          if (!getSelectedInlineMath()) return false;
          return deleteSelectedInlineMath(view);
        },
      },
      {
        key: 'Mod-c',
        run: function (view) {
          if (!getSelectedInlineMath()) return false;
          return copySelectedInlineMath(view);
        },
      },
      {
        key: 'Mod-x',
        run: function (view) {
          if (!getSelectedInlineMath()) return false;
          return cutSelectedInlineMath(view);
        },
      },
    ])
  );
}

module.exports = {
  setSelectedInlineMath: setSelectedInlineMath,
  getSelectedInlineMath: getSelectedInlineMath,
  clearSelectedInlineMath: clearSelectedInlineMath,
  setInlineMathCopyFn: setInlineMathCopyFn,
  selectInlineMath: selectInlineMath,
  syncSelectedInlineMathClass: syncSelectedInlineMathClass,
  clearInlineMathSelectedClass: clearInlineMathSelectedClass,
  reconcileSelectedInlineMath: reconcileSelectedInlineMath,
  copySelectedInlineMath: copySelectedInlineMath,
  cutSelectedInlineMath: cutSelectedInlineMath,
  deleteSelectedInlineMath: deleteSelectedInlineMath,
  createInlineMathSelectionSyncPlugin: createInlineMathSelectionSyncPlugin,
  createInlineMathShortcutKeymap: createInlineMathShortcutKeymap,
};

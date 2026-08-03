/**
 * 通用块选中态（代码 / 表格 / 引用 / 高亮 / 分割线 / 公式）：
 * 删除后保留内存，撤销/重做后按 source 重定位并恢复蓝框。
 */
'use strict';

const { ViewPlugin } = require('@codemirror/view');
const { findNearestSourceRange } = require('./image-block-ops');
const { clearBlockWidgetSelection, clearMediaSelection } = require('./widget-common');

/** @type {{ kind: string, from: number, to: number, source: string } | null} */
let selected = null;

/** @type {Record<string, { rootSel: string, frameSel?: string, media?: boolean, hrSelected?: boolean }>} */
const KIND_CONFIG = {
  code: { rootSel: '.mda-cm-code-block', frameSel: '.mda-cm-code-frame', media: true },
  math: { rootSel: '.mda-cm-math-block', frameSel: '.mda-cm-math-frame', media: true },
  table: { rootSel: '.mda-cm-table-block' },
  quote: { rootSel: '.mda-cm-quote-handle-anchor' },
  highlight: { rootSel: '.mda-cm-quote-handle-anchor' },
  hr: { rootSel: '.mda-cm-hr-block', frameSel: '.mda-cm-hr-frame', hrSelected: true },
};

/**
 * @param {{ kind: string, from: number, to: number, source: string } | null} block
 */
function setSelectedBlock(block) {
  selected = block;
}

function getSelectedBlock() {
  return selected;
}

/**
 * @param {string} kind
 */
function getSelectedBlockOfKind(kind) {
  return selected && selected.kind === kind ? selected : null;
}

function clearSelectedBlock() {
  selected = null;
}

/**
 * @param {HTMLElement | null | undefined} editorRoot
 */
function syncSelectedBlockClass(editorRoot) {
  const sel = selected;
  if (!sel || !editorRoot) return;
  const cfg = KIND_CONFIG[sel.kind];
  if (!cfg) return;
  clearBlockWidgetSelection(editorRoot);
  if (cfg.media) clearMediaSelection(editorRoot, 'mda-cm-media-selected');
  const block = editorRoot.querySelector(
    cfg.rootSel +
      '[data-mda-block-from="' +
      sel.from +
      '"][data-mda-block-to="' +
      sel.to +
      '"]'
  );
  if (!block) return;
  block.classList.add('mda-cm-block-selected');
  if (cfg.media && cfg.frameSel) {
    const frame = block.querySelector(cfg.frameSel);
    if (frame) frame.classList.add('mda-cm-media-selected');
  }
  if (cfg.hrSelected) {
    const frame = block.querySelector('.mda-cm-hr-frame');
    if (frame) frame.classList.add('mda-cm-hr-selected');
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function reconcileSelectedBlock(view) {
  const sel = selected;
  if (!sel || !view || !view.dom) return;
  if (sel.source) {
    const text =
      typeof view.state.doc.toString === 'function'
        ? view.state.doc.toString()
        : view.state.doc.sliceString(0, view.state.doc.length);
    const range = findNearestSourceRange(text, sel.source, sel.from);
    if (range && (sel.from !== range.from || sel.to !== range.to)) {
      selected = {
        kind: sel.kind,
        from: range.from,
        to: range.to,
        source: sel.source,
      };
    }
  }
  syncSelectedBlockClass(view.dom);
}

function createBlockSelectionSyncPlugin() {
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
          reconcileSelectedBlock(view);
        });
      }
      destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
      }
    }
  );
}

module.exports = {
  setSelectedBlock: setSelectedBlock,
  getSelectedBlock: getSelectedBlock,
  getSelectedBlockOfKind: getSelectedBlockOfKind,
  clearSelectedBlock: clearSelectedBlock,
  syncSelectedBlockClass: syncSelectedBlockClass,
  reconcileSelectedBlock: reconcileSelectedBlock,
  createBlockSelectionSyncPlugin: createBlockSelectionSyncPlugin,
};

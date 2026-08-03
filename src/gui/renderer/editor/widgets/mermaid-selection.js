/**
 * CM6 Mermaid 块选中态。
 */
'use strict';

const { ViewPlugin } = require('@codemirror/view');
const { clearMediaSelection } = require('./widget-common');

/** @type {{ from: number, to: number, source: string, code?: string } | null} */
let selected = null;

/**
 * @param {{ from: number, to: number, source: string, code?: string } | null} block
 */
function setSelectedMermaidBlock(block) {
  selected = block;
}

function getSelectedMermaidBlock() {
  return selected;
}

function clearSelectedMermaidBlock() {
  selected = null;
}

/**
 * @param {HTMLElement | null | undefined} editorRoot
 */
function syncSelectedMermaidFrameClass(editorRoot) {
  const sel = getSelectedMermaidBlock();
  if (!sel || !editorRoot) return;
  clearMediaSelection(editorRoot, 'mda-cm-media-selected');
  const block = editorRoot.querySelector(
    '.mda-cm-mermaid-block[data-mda-block-from="' +
      sel.from +
      '"][data-mda-block-to="' +
      sel.to +
      '"]'
  );
  if (!block) return;
  block.classList.add('mda-cm-block-selected');
  const frame = block.querySelector('.mda-cm-mermaid-frame');
  if (frame) frame.classList.add('mda-cm-media-selected');
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function reconcileSelectedMermaidBlock(view) {
  const sel = getSelectedMermaidBlock();
  if (!sel || !view || !view.dom) return;
  if (!sel.source) {
    syncSelectedMermaidFrameClass(view.dom);
    return;
  }
  const blocks = view.dom.querySelectorAll(
    '.mda-cm-mermaid-block[data-mda-block-source][data-mda-block-from][data-mda-block-to]'
  );
  let best = null;
  for (let i = 0; i < blocks.length; i++) {
    const el = blocks[i];
    const source = el.getAttribute('data-mda-block-source') || '';
    if (source !== sel.source) continue;
    const from = parseInt(el.getAttribute('data-mda-block-from') || '', 10);
    const to = parseInt(el.getAttribute('data-mda-block-to') || '', 10);
    if (!(from >= 0 && to > from)) continue;
    const dist = Math.abs(from - sel.from);
    if (!best || dist < best.dist) best = { from: from, to: to, dist: dist };
  }
  if (!best) {
    clearMediaSelection(view.dom, 'mda-cm-media-selected');
    return;
  }
  if (sel.from !== best.from || sel.to !== best.to) {
    setSelectedMermaidBlock({
      from: best.from,
      to: best.to,
      source: sel.source,
      code: sel.code,
    });
  }
  syncSelectedMermaidFrameClass(view.dom);
}

function createMermaidSelectionSyncPlugin() {
  return ViewPlugin.fromClass(
    class {
      constructor() {
        this._raf = 0;
      }
      update(update) {
        if (!update.docChanged || !getSelectedMermaidBlock()) return;
        const view = update.view;
        const self = this;
        if (self._raf) cancelAnimationFrame(self._raf);
        self._raf = requestAnimationFrame(function () {
          self._raf = 0;
          reconcileSelectedMermaidBlock(view);
        });
      }
      destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
      }
    }
  );
}

module.exports = {
  setSelectedMermaidBlock: setSelectedMermaidBlock,
  getSelectedMermaidBlock: getSelectedMermaidBlock,
  clearSelectedMermaidBlock: clearSelectedMermaidBlock,
  syncSelectedMermaidFrameClass: syncSelectedMermaidFrameClass,
  reconcileSelectedMermaidBlock: reconcileSelectedMermaidBlock,
  createMermaidSelectionSyncPlugin: createMermaidSelectionSyncPlugin,
};

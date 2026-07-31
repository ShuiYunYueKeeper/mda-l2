/**
 * CM6 图片块选中态（工具栏 / 快捷键 / 粘贴替换共用）。
 */
'use strict';

const { ViewPlugin } = require('@codemirror/view');
const { resolveImageLineRange } = require('./image-block-ops');
const { clearMediaSelection } = require('./widget-common');

/** @type {{ from: number, to: number, source: string, meta?: object } | null} */
let selected = null;

/**
 * @param {{ from: number, to: number, source: string, meta?: object } | null} block
 */
function setSelectedImageBlock(block) {
  selected = block;
}

function getSelectedImageBlock() {
  return selected;
}

function clearSelectedImageBlock() {
  selected = null;
}

/**
 * widget 重建后按内存选中态恢复蓝框（requestMeasure 会销毁 DOM）。
 * @param {HTMLElement | null | undefined} editorRoot
 */
function syncSelectedImageFrameClass(editorRoot) {
  const sel = getSelectedImageBlock();
  if (!sel || !editorRoot) return;
  clearMediaSelection(editorRoot, 'mda-cm-media-selected');
  const block = editorRoot.querySelector(
    '.mda-cm-image-block[data-mda-block-from="' +
      sel.from +
      '"][data-mda-block-to="' +
      sel.to +
      '"]'
  );
  const frame = block && block.querySelector('.mda-cm-image-frame');
  if (frame) frame.classList.add('mda-cm-media-selected');
}

/**
 * 文档变更后（含撤销/重做）按 source 重新定位选中图并恢复蓝框。
 * @param {import('@codemirror/view').EditorView} view
 */
function reconcileSelectedImageBlock(view) {
  const sel = getSelectedImageBlock();
  if (!sel || !view || !view.dom) return;
  if (!sel.source) {
    syncSelectedImageFrameClass(view.dom);
    return;
  }
  const range = resolveImageLineRange(view, sel);
  if (!range) {
    clearMediaSelection(view.dom, 'mda-cm-media-selected');
    return;
  }
  if (sel.from !== range.from || sel.to !== range.to) {
    setSelectedImageBlock({
      from: range.from,
      to: range.to,
      source: sel.source,
      meta: sel.meta,
    });
  }
  syncSelectedImageFrameClass(view.dom);
}

/**
 * 文档变更后延迟一帧同步图片选中态（等 widget DOM 重建）。
 */
function createImageSelectionSyncPlugin() {
  return ViewPlugin.fromClass(
    class {
      constructor() {
        this._raf = 0;
      }
      update(update) {
        if (!update.docChanged || !getSelectedImageBlock()) return;
        const view = update.view;
        const self = this;
        if (self._raf) cancelAnimationFrame(self._raf);
        self._raf = requestAnimationFrame(function () {
          self._raf = 0;
          reconcileSelectedImageBlock(view);
        });
      }
      destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
      }
    }
  );
}

module.exports = {
  setSelectedImageBlock: setSelectedImageBlock,
  getSelectedImageBlock: getSelectedImageBlock,
  clearSelectedImageBlock: clearSelectedImageBlock,
  syncSelectedImageFrameClass: syncSelectedImageFrameClass,
  reconcileSelectedImageBlock: reconcileSelectedImageBlock,
  createImageSelectionSyncPlugin: createImageSelectionSyncPlugin,
};

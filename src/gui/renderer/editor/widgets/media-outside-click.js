/**
 * 图片 / Mermaid 块：点击块外取消选中（与表格 onDocPointer 一致）。
 */
'use strict';

const { ViewPlugin } = require('@codemirror/view');
const { clearMediaSelection, clearBlockWidgetSelection } = require('./widget-common');
const { getSelectedImageBlock, clearSelectedImageBlock } = require('./image-selection');
const { getSelectedMermaidBlock, clearSelectedMermaidBlock } = require('./mermaid-selection');
const { closeBlockHandleMenu } = require('./block-handle-menu');

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number } | null} sel
 * @param {string} className
 * @param {EventTarget | null} target
 */
function blockContainsTarget(view, sel, className, target) {
  if (!sel || !target || !view.dom) return false;
  const block = view.dom.querySelector(
    '.' + className + '[data-mda-block-from="' + sel.from + '"][data-mda-block-to="' + sel.to + '"]'
  );
  return !!(block && block.contains(/** @type {Node} */ (target)));
}

function createMediaOutsideClickPlugin() {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        const self = this;
        this.onPointer = function (e) {
          if (!self.view.dom.isConnected) {
            document.removeEventListener('mousedown', self.onPointer, true);
            return;
          }
          const imgSel = getSelectedImageBlock();
          const merSel = getSelectedMermaidBlock();
          if (!imgSel && !merSel && !self.view.dom.querySelector('.mda-cm-block-selected')) return;
          const target = e.target;
          if (target && target.closest && target.closest('#mda-block-handle-menu')) return;
          if (target && target.closest && target.closest('.mda-block-handle-submenu')) return;
          if (blockContainsTarget(self.view, imgSel, 'mda-cm-image-block', target)) return;
          if (blockContainsTarget(self.view, merSel, 'mda-cm-mermaid-block', target)) return;
          if (target && target.closest && target.closest('.mda-cm-code-block.mda-cm-block-selected')) return;
          clearSelectedImageBlock();
          clearSelectedMermaidBlock();
          clearMediaSelection(self.view.dom);
          clearBlockWidgetSelection(self.view.dom);
          closeBlockHandleMenu();
        };
        document.addEventListener('mousedown', this.onPointer, true);
      }
      destroy() {
        document.removeEventListener('mousedown', this.onPointer, true);
      }
    }
  );
}

module.exports = {
  createMediaOutsideClickPlugin: createMediaOutsideClickPlugin,
  blockContainsTarget: blockContainsTarget,
};

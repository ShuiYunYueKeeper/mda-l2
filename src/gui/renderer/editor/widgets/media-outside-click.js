/**
 * 图片 / Mermaid / 块 widget：点击块外取消选中（与表格 onDocPointer 一致）。
 */
'use strict';

const { ViewPlugin } = require('@codemirror/view');
const { clearMediaSelection, clearBlockWidgetSelection } = require('./widget-common');
const { getSelectedImageBlock, clearSelectedImageBlock } = require('./image-selection');
const { getSelectedMermaidBlock, clearSelectedMermaidBlock } = require('./mermaid-selection');
const { clearSelectedMathBlock } = require('./math-selection');
const { getSelectedBlock, clearSelectedBlock } = require('./block-selection');
const {
  getSelectedInlineMath,
  clearSelectedInlineMath,
  clearInlineMathSelectedClass,
} = require('./inline-math-selection');
const { closeBlockHandleMenu } = require('./block-handle-menu');
const { closeEmptyLineInsertMenu } = require('./empty-line-insert-menu');

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
          if (e.button === 2) return;
          if (!self.view.dom.isConnected) {
            document.removeEventListener('mousedown', self.onPointer, true);
            return;
          }
          const imgSel = getSelectedImageBlock();
          const merSel = getSelectedMermaidBlock();
          const blockSel = getSelectedBlock();
          const inlineMathSel = getSelectedInlineMath();
          if (
            !imgSel &&
            !merSel &&
            !blockSel &&
            !inlineMathSel &&
            !self.view.dom.querySelector('.mda-cm-block-selected') &&
            !self.view.dom.querySelector('.mda-cm-math-inline-selected')
          ) {
            return;
          }
          const target = e.target;
          if (target && target.closest && target.closest('#mda-block-handle-menu')) return;
          if (target && target.closest && target.closest('#mda-empty-line-insert-menu')) return;
          if (target && target.closest && target.closest('.mda-block-handle-submenu')) return;
          if (target && target.closest && target.closest('.mda-cm-code-lang-panel')) return;
          if (target && target.closest && target.closest('.mda-cm-code-lang-submenu')) return;
          if (target && target.closest && target.closest('.mda-cm-code-lang-picker')) return;
          if (blockContainsTarget(self.view, imgSel, 'mda-cm-image-block', target)) return;
          if (blockContainsTarget(self.view, merSel, 'mda-cm-mermaid-block', target)) return;
          if (blockContainsTarget(self.view, blockSel, 'mda-cm-code-block', target)) return;
          if (blockContainsTarget(self.view, blockSel, 'mda-cm-math-block', target)) return;
          if (blockContainsTarget(self.view, blockSel, 'mda-cm-table-block', target)) return;
          if (blockContainsTarget(self.view, blockSel, 'mda-cm-quote-handle-anchor', target)) return;
          if (blockContainsTarget(self.view, blockSel, 'mda-cm-heading-handle-anchor', target)) return;
          if (blockContainsTarget(self.view, blockSel, 'mda-cm-hr-block', target)) return;
          if (target && target.closest && target.closest('.mda-cm-math-inline-selected')) return;
          if (target && target.closest && target.closest('.mda-cm-math-inline')) return;
          if (target && target.closest && target.closest('.mda-cm-code-input')) return;
          if (target && target.closest && target.closest('.mda-cm-math-source-input')) return;
          clearSelectedImageBlock();
          clearSelectedMermaidBlock();
          clearSelectedMathBlock();
          clearSelectedBlock();
          clearSelectedInlineMath();
          clearInlineMathSelectedClass(self.view.dom);
          clearMediaSelection(self.view.dom);
          clearBlockWidgetSelection(self.view.dom);
          closeBlockHandleMenu();
          closeEmptyLineInsertMenu();
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

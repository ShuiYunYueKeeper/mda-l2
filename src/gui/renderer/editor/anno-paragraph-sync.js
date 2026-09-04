/**
 * CM6 正文点击段落 → 批注面板选中（对齐 2.0 预览区 data-line 点击）。
 */
'use strict';

const { EditorView } = require('@codemirror/view');

/**
 * @param {(line: number) => void} [onParagraphClick] 1-based 行号
 */
function createAnnoParagraphSyncExtension(onParagraphClick) {
  if (typeof onParagraphClick !== 'function') return [];
  return EditorView.domEventHandlers({
    mouseup: function (event, view) {
      if (event.button !== 0) return false;
      if (event.target && event.target.closest) {
        if (
          event.target.closest(
            '.mda-cm-table-block, .mda-cm-code-block, .mda-cm-mermaid-block, .mda-cm-image-block, .mda-cm-math-block, .mda-cm-hr-block, .mda-cm-block-handle, .mda-cm-block-handle-menu, .mda-context-menu, .mda-block-handle-menu'
          )
        ) {
          return false;
        }
      }
      requestAnimationFrame(function () {
        if (!view || view.destroyed) return;
        const sel = view.state.selection.main;
        if (sel.from !== sel.to) return;
        const line = view.state.doc.lineAt(sel.head);
        if (!line) return;
        onParagraphClick(line.number);
      });
      return false;
    },
  });
}

module.exports = {
  createAnnoParagraphSyncExtension: createAnnoParagraphSyncExtension,
};

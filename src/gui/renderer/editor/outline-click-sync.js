/**
 * CM6 正文点击标题 → 同步大纲高亮（与 2.0 预览 onPreviewLocate 对称）。
 */
'use strict';

const { EditorView } = require('@codemirror/view');
const { getHeadingLineAtPos } = require('./outline-scroll');

/**
 * @param {(line: number) => void} [onHeadingClick] 1-based 标题行号
 */
function createOutlineClickSyncExtension(onHeadingClick) {
  if (typeof onHeadingClick !== 'function') return [];
  return EditorView.domEventHandlers({
    mouseup: function (event, view) {
      if (event.button !== 0) return false;
      requestAnimationFrame(function () {
        if (!view || view.destroyed) return;
        const sel = view.state.selection.main;
        if (sel.from !== sel.to) return;
        const lineNum = getHeadingLineAtPos(view, sel.head);
        if (lineNum == null) return;
        onHeadingClick(lineNum);
      });
      return false;
    },
  });
}

module.exports = {
  createOutlineClickSyncExtension: createOutlineClickSyncExtension,
};

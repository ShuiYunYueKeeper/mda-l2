/**
 * 预览模式：单击定位光标（hide-mark atomic 与 CM6 默认点击偶发冲突）。
 * 不阻断 mousedown 默认行为，以保留鼠标拖选；仅在单击未拖选时于 mouseup 校准落点。
 */
'use strict';

const { EditorView } = require('@codemirror/view');

const DRAG_PX = 4;

/** @type {{ x: number, y: number, shiftKey: boolean, dragging: boolean } | null} */
let mouseDown = null;

/**
 * @param {EventTarget | null} target
 */
function isBlockWidgetTarget(target) {
  if (!target || !target.closest) return false;
  return !!target.closest(
    '.mda-cm-image-block, .mda-cm-table-block, .mda-cm-code-block, .mda-cm-mermaid-block'
  );
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function posAtClick(view, clientX, clientY) {
  var pos = view.posAtCoords({ x: clientX, y: clientY }, 1);
  if (pos == null) pos = view.posAtCoords({ x: clientX, y: clientY }, -1);
  return pos;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function placeCaret(view, clientX, clientY) {
  const pos = posAtClick(view, clientX, clientY);
  if (pos == null) return;
  const sel = view.state.selection.main;
  if (sel.from === sel.to && sel.head === pos) return;
  view.dispatch({
    selection: { anchor: pos, head: pos },
    scrollIntoView: true,
  });
}

function createClickCollapseExtension() {
  return EditorView.domEventHandlers({
    mousedown: function (event) {
      if (event.button !== 0) return false;
      if (isBlockWidgetTarget(event.target)) return false;
      mouseDown = {
        x: event.clientX,
        y: event.clientY,
        shiftKey: !!event.shiftKey,
        dragging: false,
      };
      return false;
    },
    mousemove: function (event) {
      if (!mouseDown || mouseDown.dragging || mouseDown.shiftKey) return false;
      const dx = event.clientX - mouseDown.x;
      const dy = event.clientY - mouseDown.y;
      if (dx * dx + dy * dy > DRAG_PX * DRAG_PX) {
        mouseDown.dragging = true;
      }
      return false;
    },
    mouseup: function (event, view) {
      if (event.button !== 0 || !mouseDown) return false;
      const start = mouseDown;
      mouseDown = null;
      if (isBlockWidgetTarget(event.target)) return false;
      if (start.shiftKey || event.shiftKey) return false;
      if (event.detail >= 2) return false;
      if (start.dragging) return false;
      const sel = view.state.selection.main;
      if (sel.from !== sel.to) return false;
      placeCaret(view, event.clientX, event.clientY);
      return false;
    },
  });
}

module.exports = {
  createClickCollapseExtension: createClickCollapseExtension,
  posAtClick: posAtClick,
  placeCaret: placeCaret,
};

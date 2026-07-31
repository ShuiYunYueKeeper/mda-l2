/**
 * 双模式切换时保存/恢复滚动与选区（AC-12：首可见行偏差 ≤5 行）。
 */
'use strict';

const { EditorView } = require('@codemirror/view');

/** @typedef {{ line: number, anchor: number, head: number }} ModeSwitchSnapshot */

/**
 * @param {import('@codemirror/view').EditorView} view
 * @returns {number} 1-based line number of first visible content line
 */
function getFirstVisibleLine(view) {
  const scrollTop = view.scrollDOM.scrollTop;
  const block = view.lineBlockAtHeight(scrollTop + 1);
  return view.state.doc.lineAt(block.from).number;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @returns {ModeSwitchSnapshot}
 */
function saveModeSwitchState(view) {
  const sel = view.state.selection.main;
  return {
    line: getFirstVisibleLine(view),
    anchor: sel.anchor,
    head: sel.head,
  };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {ModeSwitchSnapshot} snap
 * @param {{ maxLineDrift?: number }} [opts]
 */
function restoreModeSwitchState(view, snap, opts) {
  if (!snap) return;
  const maxDrift = opts && opts.maxLineDrift != null ? opts.maxLineDrift : 5;
  const doc = view.state.doc;
  const lineCount = doc.lines;
  const targetLine = Math.min(Math.max(1, snap.line), lineCount);
  const lineInfo = doc.line(targetLine);
  view.dispatch({
    effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
    selection: { anchor: snap.anchor, head: snap.head },
  });
  const afterLine = getFirstVisibleLine(view);
  const drift = Math.abs(afterLine - targetLine);
  if (drift > maxDrift && lineCount > 0) {
    const adjust = doc.line(Math.min(lineCount, Math.max(1, targetLine)));
    view.dispatch({
      effects: EditorView.scrollIntoView(adjust.from, { y: 'start' }),
    });
  }
}

module.exports = {
  getFirstVisibleLine: getFirstVisibleLine,
  saveModeSwitchState: saveModeSwitchState,
  restoreModeSwitchState: restoreModeSwitchState,
};

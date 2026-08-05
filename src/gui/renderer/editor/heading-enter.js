/**
 * 预览模式标题行 Enter：换行后保留 ATX 前缀。
 */
'use strict';

const ATX_HEADING_RE = /^( {0,3})(#{1,6})(\s+)(.*)$/;

/**
 * @param {string} lineText
 * @param {number} offsetInLine 0-based within line
 * @returns {{ insert: string, cursor: number } | null} null = 走 CM6 默认换行
 */
function planHeadingEnter(lineText, offsetInLine) {
  var m = ATX_HEADING_RE.exec(lineText);
  if (!m) return null;
  var indent = m[1];
  var hashes = m[2];
  var space = m[3];
  var prefix = indent + hashes + space;
  var off = Math.max(0, Math.min(offsetInLine, lineText.length));

  if (off < indent.length) {
    return { insert: '\n', cursor: 1 };
  }
  if (off < prefix.length) {
    return null;
  }
  return { insert: '\n' + prefix, cursor: prefix.length + 1 };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function handlePreviewHeadingEnter(view) {
  var state = view.state;
  var sel = state.selection.main;
  if (!sel.empty || sel.from !== sel.to) return false;
  var pos = sel.from;
  var line = state.doc.lineAt(pos);
  var plan = planHeadingEnter(line.text, pos - line.from);
  if (!plan) return false;
  view.dispatch({
    changes: { from: pos, to: pos, insert: plan.insert },
    selection: { anchor: pos + plan.cursor, head: pos + plan.cursor },
  });
  return true;
}

module.exports = {
  ATX_HEADING_RE: ATX_HEADING_RE,
  planHeadingEnter: planHeadingEnter,
  handlePreviewHeadingEnter: handlePreviewHeadingEnter,
};

/**
 * 预览模式标题行 Enter / 空标题 Backspace。
 */
'use strict';

const { ATX_LINE_RE } = require('./caret-syntax-adjust');

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
  // 行尾：新段落（空 ## 行整行被 hide-mark 盖住，光标会消失）
  if (off >= lineText.length) {
    return { insert: '\n', cursor: 1 };
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

/**
 * 空 ATX 标题行 Backspace：删整行（含换行），勿让 atomic hide-mark 只剥掉 # 前缀。
 * @param {string} lineText
 * @param {number} offsetInLine
 * @returns {boolean}
 */
function shouldDeleteEmptyHeadingLine(lineText, offsetInLine) {
  const m = ATX_LINE_RE.exec(lineText);
  if (!m) return false;
  const body = m[4] || '';
  if (body.trim() !== '') return false;
  const prefixEnd = m[1].length + m[2].length + m[3].length;
  const off = Math.max(0, Math.min(offsetInLine, lineText.length));
  return off >= prefixEnd;
}

/**
 * @param {import('@codemirror/state').Text} doc
 * @param {import('@codemirror/state').Line} line
 * @returns {{ from: number, to: number, cursor: number }}
 */
function planEmptyHeadingLineDelete(doc, line) {
  const from = line.from;
  let to;
  if (line.number < doc.lines) {
    to = doc.line(line.number + 1).from;
  } else {
    to = line.to;
  }
  const cursor = line.number > 1 ? doc.line(line.number - 1).to : from;
  return { from: from, to: to, cursor: cursor };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function handlePreviewHeadingBackspace(view) {
  const state = view.state;
  const sel = state.selection.main;
  if (!sel.empty || sel.from !== sel.to) return false;
  const pos = sel.from;
  const line = state.doc.lineAt(pos);
  if (!shouldDeleteEmptyHeadingLine(line.text, pos - line.from)) return false;
  const plan = planEmptyHeadingLineDelete(state.doc, line);
  view.dispatch({
    changes: { from: plan.from, to: plan.to, insert: '' },
    selection: { anchor: plan.cursor, head: plan.cursor },
  });
  return true;
}

module.exports = {
  ATX_HEADING_RE: ATX_HEADING_RE,
  planHeadingEnter: planHeadingEnter,
  handlePreviewHeadingEnter: handlePreviewHeadingEnter,
  shouldDeleteEmptyHeadingLine: shouldDeleteEmptyHeadingLine,
  planEmptyHeadingLineDelete: planEmptyHeadingLineDelete,
  handlePreviewHeadingBackspace: handlePreviewHeadingBackspace,
};

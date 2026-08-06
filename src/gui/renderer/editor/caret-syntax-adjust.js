/**
 * 预览模式点击落点：hide-mark + atomic 会使落点落在可见内容边缘内侧；
 * 左缘校准到前置定界符左侧（## / ** / ` 等），右缘校准到后置定界符右侧。
 */
'use strict';

const { syntaxTree } = require('@codemirror/language');
const { SYNTAX_RULES } = require('./model/syntax-rules');

const ATX_LINE_RE = /^( {0,3})(#{1,6})(\s*)(.*)$/;

/**
 * @param {import('@lezer/common').SyntaxNode} node
 */
function adaptSyntaxNode(node) {
  return { from: node.from, to: node.to, type: node.name };
}

/**
 * @param {{ from: number, to: number }[]} marks
 * @param {{ from: number, to: number }} content
 * @returns {{ from: number, to: number } | null}
 */
function findLeadingMark(marks, content) {
  var leading = null;
  for (var i = 0; i < marks.length; i++) {
    if (marks[i].to <= content.from) {
      if (!leading || marks[i].from < leading.from) leading = marks[i];
    }
  }
  return leading || (marks.length ? marks[0] : null);
}

/**
 * @param {{ from: number, to: number }[]} marks
 * @param {{ from: number, to: number }} content
 * @returns {{ from: number, to: number } | null}
 */
function findTrailingMark(marks, content) {
  var trailing = null;
  for (var i = 0; i < marks.length; i++) {
    if (marks[i].from >= content.to) {
      if (!trailing || marks[i].to > trailing.to) trailing = marks[i];
    }
  }
  return trailing;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @returns {number}
 */
function adjustCaretForHiddenMarks(state, pos) {
  if (pos == null || pos < 0) return pos;
  const tree = syntaxTree(state);
  if (!tree) return pos;
  const doc = state.doc.toString();
  const len = doc.length;
  if (pos > len) return len;

  var snapLeft = null;
  var snapRight = null;
  var bestLeftSpan = Infinity;
  var bestRightSpan = Infinity;

  tree.iterate({
    enter: function (node) {
      const rule = SYNTAX_RULES[node.name];
      if (!rule || rule.class !== 'R' || typeof rule.contentRange !== 'function') return;
      if (pos < node.from || pos > node.to) return;

      const adapted = adaptSyntaxNode(node);
      const content = rule.contentRange(adapted, doc);
      if (!content || content.from > content.to) return;

      const marks =
        typeof rule.markRanges === 'function' ? rule.markRanges(adapted, doc) || [] : [];
      if (!marks.length) return;

      const leading = findLeadingMark(marks, content);
      const trailing = findTrailingMark(marks, content);
      const span = Math.max(0, content.to - content.from);

      if (leading && pos > leading.from && pos <= content.from) {
        if (span < bestLeftSpan) {
          bestLeftSpan = span;
          snapLeft = leading.from;
        }
      }

      if (trailing && pos >= content.to && pos < trailing.to) {
        if (span < bestRightSpan) {
          bestRightSpan = span;
          snapRight = trailing.to;
        }
      }
    },
  });

  if (snapLeft != null && snapRight != null) {
    return bestLeftSpan <= bestRightSpan ? snapLeft : snapRight;
  }
  if (snapLeft != null) return snapLeft;
  if (snapRight != null) return snapRight;
  return pos;
}

/**
 * 标题行高导致落点偶发落到下一行 ATX 前缀；拖选另一端在上一行正文时钳回上一行末尾。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {number} other
 */
function clampSelectionBleed(state, pos, other) {
  if (pos == null || pos < 0) return pos;
  const doc = state.doc;
  if (pos > doc.length) return doc.length;
  const line = doc.lineAt(pos);
  const m = ATX_LINE_RE.exec(line.text);
  if (!m) return pos;
  const prefixEnd = line.from + m[1].length + m[2].length + m[3].length;
  if (pos > prefixEnd) return pos;
  const otherLine = doc.lineAt(other);
  if (otherLine.number < line.number && line.number > 1) {
    return doc.line(line.number - 1).to;
  }
  return pos;
}

/**
 * 拖选区间两端分别做 hide-mark 边缘校准。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} anchor
 * @param {number} head
 */
function adjustSelectionForHiddenMarks(state, anchor, head) {
  const a = clampSelectionBleed(state, anchor, head);
  const h = clampSelectionBleed(state, head, anchor);
  return {
    anchor: adjustCaretForHiddenMarks(state, a),
    head: adjustCaretForHiddenMarks(state, h),
  };
}

module.exports = {
  ATX_LINE_RE: ATX_LINE_RE,
  findLeadingMark: findLeadingMark,
  findTrailingMark: findTrailingMark,
  clampSelectionBleed: clampSelectionBleed,
  adjustCaretForHiddenMarks: adjustCaretForHiddenMarks,
  adjustSelectionForHiddenMarks: adjustSelectionForHiddenMarks,
};

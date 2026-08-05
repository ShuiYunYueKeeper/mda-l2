/**
 * 预览模式点击落点：hide-mark + atomic 会使落点落在可见内容边缘内侧；
 * 左缘校准到前置定界符左侧（## / ** / ` 等），右缘校准到后置定界符右侧。
 */
'use strict';

const { syntaxTree } = require('@codemirror/language');
const { SYNTAX_RULES } = require('./model/syntax-rules');

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
 * 拖选区间两端分别做 hide-mark 边缘校准。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} anchor
 * @param {number} head
 */
function adjustSelectionForHiddenMarks(state, anchor, head) {
  return {
    anchor: adjustCaretForHiddenMarks(state, anchor),
    head: adjustCaretForHiddenMarks(state, head),
  };
}

module.exports = {
  findLeadingMark: findLeadingMark,
  findTrailingMark: findTrailingMark,
  adjustCaretForHiddenMarks: adjustCaretForHiddenMarks,
  adjustSelectionForHiddenMarks: adjustSelectionForHiddenMarks,
};

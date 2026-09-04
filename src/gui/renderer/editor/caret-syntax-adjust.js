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
          // ATX 标题：可见区从 # 之后开始，落点应在正文首而非 # 左侧
          snapLeft = /^ATXHeading/.test(node.name) ? content.from : leading.from;
        }
      }

      if (trailing && pos >= content.to && pos < trailing.to) {
        if (span < bestRightSpan) {
          bestRightSpan = span;
          // 延续样式编辑：落在内容末尾，而非闭定界符之后（规则 4 退出由工具栏切换处理）
          snapRight = content.to;
        }
      }
    },
  });

  var result = pos;
  if (snapLeft != null && snapRight != null) {
    result = bestLeftSpan <= bestRightSpan ? snapLeft : snapRight;
  } else if (snapLeft != null) {
    result = snapLeft;
  } else if (snapRight != null) {
    result = snapRight;
  }
  return adjustCaretForHeadingClick(state, result);
}

/**
 * 点击/落点落在 ATX 前缀内时推到 # 之后（空标题行与键盘导航一致）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @returns {number}
 */
function adjustCaretForHeadingClick(state, pos) {
  if (pos == null || pos < 0) return pos;
  const doc = state.doc;
  if (pos > doc.length) return doc.length;
  const line = doc.lineAt(pos);
  const m = ATX_LINE_RE.exec(line.text);
  if (!m) return pos;
  const contentStart = line.from + m[1].length + m[2].length + m[3].length;
  if (contentStart <= line.to && pos < contentStart) return contentStart;
  return pos;
}

/**
 * 键盘逐行移动：空行 col=0 落在标题行 line.from（ATX # 前缀）时 caret 不可见，推到可见正文首。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @returns {number}
 */
function adjustCaretForKeyboardNav(state, pos) {
  if (pos == null || pos < 0) return pos;
  const doc = state.doc;
  if (pos > doc.length) return doc.length;
  const line = doc.lineAt(pos);
  const m = ATX_LINE_RE.exec(line.text);
  if (m) {
    const contentStart = line.from + m[1].length + m[2].length + m[3].length;
    if (contentStart <= line.to) {
      if (pos < contentStart) return contentStart;
      if (pos <= line.to) return pos;
    }
  }
  return adjustCaretForHiddenMarks(state, pos);
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
 * 拖选行末时 CM6 常把 head 落到下一空行行首；收回上一行末尾，避免「多选一行空白」。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {number} other
 */
function clampEmptyLineSelectionBleed(state, pos, other) {
  if (pos == null || pos < 0) return pos;
  const doc = state.doc;
  const line = doc.lineAt(pos);
  if (line.text.trim() !== '') return pos;
  if (pos !== line.from) return pos;
  const otherLine = doc.lineAt(other);
  if (otherLine.number !== line.number - 1) return pos;
  return otherLine.to;
}

/**
 * 拖选区间两端分别做 hide-mark 边缘校准。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} anchor
 * @param {number} head
 */
function adjustSelectionForHiddenMarks(state, anchor, head) {
  let a = clampSelectionBleed(state, anchor, head);
  let h = clampSelectionBleed(state, head, anchor);
  a = clampEmptyLineSelectionBleed(state, a, h);
  h = clampEmptyLineSelectionBleed(state, h, a);
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
  clampEmptyLineSelectionBleed: clampEmptyLineSelectionBleed,
  adjustCaretForHiddenMarks: adjustCaretForHiddenMarks,
  adjustCaretForHeadingClick: adjustCaretForHeadingClick,
  adjustCaretForKeyboardNav: adjustCaretForKeyboardNav,
  adjustSelectionForHiddenMarks: adjustSelectionForHiddenMarks,
};

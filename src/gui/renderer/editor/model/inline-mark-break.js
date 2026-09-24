/**
 * 行内样式段末尾按 Enter/Space：把收尾符插到闭定界符之后，避免拆成 `**text\n**`。
 */
'use strict';

const { SYNTAX_RULES } = require('./syntax-rules');
const { findTrailingMark } = require('../caret-syntax-adjust');

/** 可在段末「退出后再换行」的行内样式（不含 Link/标题——另有专用路径） */
const EXITABLE_INLINE = new Set([
  'StrongEmphasis',
  'Emphasis',
  'Strikethrough',
  'InlineCode',
]);

/**
 * @param {import('@lezer/common').SyntaxNode} node
 */
function adaptSyntaxNode(node) {
  return { from: node.from, to: node.to, type: node.name };
}

/**
 * 光标落在可见内容末或闭定界符隐藏区内时，规划把 breakChar 插到最外层闭定界符之后。
 * @param {string} doc
 * @param {import('@lezer/common').Tree} tree
 * @param {number} head
 * @param {string} breakChar
 * @returns {{ from: number, to: number, insert: string, caret: number } | null}
 */
function planExitTrailingMarksBreak(doc, tree, head, breakChar) {
  if (!tree || head == null || head < 0) return null;
  const s = String(doc || '');
  if (head > s.length) return null;
  const ch = breakChar == null ? '\n' : String(breakChar);
  if (!ch) return null;

  let exitTo = null;
  let node = tree.resolveInner(head, -1);
  while (node) {
    if (EXITABLE_INLINE.has(node.name)) {
      const rule = SYNTAX_RULES[node.name];
      if (rule && typeof rule.contentRange === 'function') {
        const adapted = adaptSyntaxNode(node);
        const content = rule.contentRange(adapted, s);
        const marks =
          typeof rule.markRanges === 'function' ? rule.markRanges(adapted, s) || [] : [];
        const trailing = content ? findTrailingMark(marks, content) : null;
        // 可见文本末（含紧贴闭定界符内侧）→ 闭定界符终点
        if (content && trailing && head >= content.to && head < trailing.to) {
          exitTo = Math.max(exitTo == null ? 0 : exitTo, trailing.to);
        }
      }
    }
    node = node.parent;
  }

  if (exitTo == null || exitTo < head) return null;
  // 已在闭定界符外侧则不必接管
  if (exitTo === head) return null;
  return {
    from: exitTo,
    to: exitTo,
    insert: ch,
    caret: exitTo + ch.length,
  };
}

module.exports = {
  EXITABLE_INLINE: EXITABLE_INLINE,
  planExitTrailingMarksBreak: planExitTrailingMarksBreak,
};

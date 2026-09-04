/**
 * 预览模式块 widget 旁：CM6 默认 ArrowUp/Down 走 moveVertically（几何坐标），
 * 高大 replace widget 会吞掉中间空行，导致一次跳过多行。改为按文档行号逐行移动；
 * 落入块 replace 区间时，上下键直接跳出块（不在隐藏源码内逐行爬行）。
 */
'use strict';

const { keymap } = require('@codemirror/view');
const { Prec } = require('@codemirror/state');
const editorConfig = require('./config');
const { focusInWidgetInlineEditable } = require('./widget-editable-guard');
const { adjustCaretForKeyboardNav } = require('./caret-syntax-adjust');

/**
 * @param {number} pos
 * @param {{ from: number, to: number }[]} ranges
 * @returns {{ from: number, to: number } | null}
 */
function findBlockContaining(pos, ranges) {
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (pos >= r.from && pos < r.to) return r;
  }
  return null;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {import('@codemirror/state').StateField<unknown>} [blockDecoField]
 * @returns {{ from: number, to: number }[]}
 */
function collectBlockReplaceRanges(view, blockDecoField) {
  if (!blockDecoField) return [];
  let val;
  try {
    val = view.state.field(blockDecoField);
  } catch (_) {
    return [];
  }
  const deco = val && val.deco;
  if (!deco || typeof deco.between !== 'function') return [];
  const ranges = [];
  const len = view.state.doc.length;
  deco.between(0, len, function (from, to) {
    if (to > from) ranges.push({ from: from, to: to });
  });
  return ranges;
}

/**
 * @param {import('@codemirror/state').Text} doc
 * @param {number} head
 * @param {number} delta -1 | 1
 * @param {{ from: number, to: number }[]} blockRanges
 * @returns {number | null}
 */
function resolveDocLineMove(doc, head, delta, blockRanges) {
  const line = doc.lineAt(head);
  const col = head - line.from;
  const inside = findBlockContaining(head, blockRanges);

  if (inside) {
    if (delta < 0) {
      const prevN = doc.lineAt(inside.from).number - 1;
      if (prevN < 1) return null;
      const prevLine = doc.line(prevN);
      return Math.min(prevLine.from + col, prevLine.to);
    }
    const endLine = doc.lineAt(Math.max(inside.from, inside.to - 1));
    const nextN = endLine.number + 1;
    if (nextN > doc.lines) return null;
    const nextLine = doc.line(nextN);
    return Math.min(nextLine.from + col, nextLine.to);
  }

  const targetN = line.number + delta;
  if (targetN < 1 || targetN > doc.lines) return null;
  const targetLine = doc.line(targetN);
  let pos = Math.min(targetLine.from + col, targetLine.to);
  const targetInside = findBlockContaining(pos, blockRanges);
  if (targetInside) {
    if (delta > 0) {
      pos = targetInside.from;
    } else {
      const endLine = doc.lineAt(Math.max(targetInside.from, targetInside.to - 1));
      pos = endLine.from;
    }
  }
  return pos;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} delta -1 | 1
 * @param {boolean} extend
 * @param {import('@codemirror/state').StateField<unknown>} [blockDecoField]
 */
function moveCursorByDocLine(view, delta, extend, blockDecoField) {
  const state = view.state;
  const doc = state.doc;
  const sel = state.selection.main;
  const head = sel.head;
  const blockRanges = collectBlockReplaceRanges(view, blockDecoField);
  const rawPos = resolveDocLineMove(doc, head, delta, blockRanges);
  if (rawPos == null) return false;
  const pos = adjustCaretForKeyboardNav(state, rawPos);
  const anchor = extend ? sel.anchor : pos;
  view.dispatch({
    selection: { anchor: anchor, head: pos },
    scrollIntoView: true,
  });
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {boolean} forward
 * @param {boolean} extend
 * @param {import('@codemirror/state').StateField<unknown>} [blockDecoField]
 */
function runDocLineMove(view, forward, extend, blockDecoField) {
  if (!editorConfig.blockWidgetsEnabled()) return false;
  if (focusInWidgetInlineEditable()) return false;
  return moveCursorByDocLine(view, forward ? 1 : -1, extend, blockDecoField);
}

/**
 * @param {import('@codemirror/state').StateField<unknown>} [blockDecoField]
 */
function createDocLineCursorKeymap(blockDecoField) {
  return Prec.high(
    keymap.of([
      {
        key: 'ArrowUp',
        run: function (view) {
          return runDocLineMove(view, false, false, blockDecoField);
        },
      },
      {
        key: 'ArrowDown',
        run: function (view) {
          return runDocLineMove(view, true, false, blockDecoField);
        },
      },
      {
        key: 'Shift-ArrowUp',
        run: function (view) {
          return runDocLineMove(view, false, true, blockDecoField);
        },
      },
      {
        key: 'Shift-ArrowDown',
        run: function (view) {
          return runDocLineMove(view, true, true, blockDecoField);
        },
      },
    ])
  );
}

module.exports = {
  findBlockContaining: findBlockContaining,
  resolveDocLineMove: resolveDocLineMove,
  moveCursorByDocLine: moveCursorByDocLine,
  createDocLineCursorKeymap: createDocLineCursorKeymap,
};

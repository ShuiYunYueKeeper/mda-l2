/**
 * CM6 预览模式：块 widget（表格 / 代码块）内查找高亮统一入口。
 */
'use strict';

const {
  applyTableFindHighlights,
  clearTableFindHighlights,
  getTableBlockRanges,
} = require('./table-find-highlight');
const {
  applyCodeFindHighlights,
  clearCodeFindHighlights,
  getCodeBlockRanges,
} = require('./code-find-highlight');

/** @type {{ matches: { start: number, end: number }[], activeIndex: number } | null} */
let lastWidgetFind = null;

/**
 * @param {import('@codemirror/view').EditorView} view
 * @returns {{ from: number, to: number }[]}
 */
function getWidgetBlockRanges(view) {
  return getTableBlockRanges(view).concat(getCodeBlockRanges(view));
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ start: number, end: number }[]} matches
 * @param {number} activeIndex
 */
function applyWidgetFindHighlights(view, matches, activeIndex) {
  const list = Array.isArray(matches) ? matches : [];
  const idx = activeIndex == null ? -1 : activeIndex;
  lastWidgetFind = list.length ? { matches: list, activeIndex: idx } : null;
  applyTableFindHighlights(view, list, idx);
  applyCodeFindHighlights(view, list, idx);
}

/**
 * 代码块重绘 hljs 后恢复查找高亮（不经过 CM6 事务）。
 * @param {import('@codemirror/view').EditorView} view
 */
function reapplyWidgetFindHighlights(view) {
  if (!view || !lastWidgetFind || !lastWidgetFind.matches.length) return;
  applyTableFindHighlights(view, lastWidgetFind.matches, lastWidgetFind.activeIndex);
  applyCodeFindHighlights(view, lastWidgetFind.matches, lastWidgetFind.activeIndex);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function clearWidgetFindHighlights(view) {
  lastWidgetFind = null;
  clearTableFindHighlights(view);
  clearCodeFindHighlights(view);
}

module.exports = {
  getWidgetBlockRanges: getWidgetBlockRanges,
  applyWidgetFindHighlights: applyWidgetFindHighlights,
  reapplyWidgetFindHighlights: reapplyWidgetFindHighlights,
  clearWidgetFindHighlights: clearWidgetFindHighlights,
};

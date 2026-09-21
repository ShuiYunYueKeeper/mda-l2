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
  applyTableFindHighlights(view, matches, activeIndex);
  applyCodeFindHighlights(view, matches, activeIndex);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function clearWidgetFindHighlights(view) {
  clearTableFindHighlights(view);
  clearCodeFindHighlights(view);
}

module.exports = {
  getWidgetBlockRanges: getWidgetBlockRanges,
  applyWidgetFindHighlights: applyWidgetFindHighlights,
  clearWidgetFindHighlights: clearWidgetFindHighlights,
};

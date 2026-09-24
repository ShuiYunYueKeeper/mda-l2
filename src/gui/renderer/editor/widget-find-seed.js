/**
 * 块 widget（代码块 / 表格格）内 DOM 选区 → 查找种子（含文档偏移）。
 * 供打开查找栏时填词且不跳到文档首个命中。
 */
'use strict';

const { classifyWidgetEditable } = require('./widget-editable-guard');
const { getFenceBodyDocRange, getCodeInputPlainText } = require('./code-find-highlight');
const { getLogicalSelectionOffsets } = require('./widgets/code');
const { buildTableCellDocMap } = require('./table-find-highlight');
const {
  getCellMarkdownContent,
  getCellVisibleSelection,
  visibleToMarkdownOffset,
} = require('./widgets/table-cell-content');

/**
 * @param {string} a
 * @param {string} b
 */
function fencePlainAligns(a, b) {
  if (a === b) return true;
  if (a.endsWith('\n') && a.slice(0, -1) === b) return true;
  if (b.endsWith('\n') && b.slice(0, -1) === a) return true;
  return false;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {HTMLElement} codeInput
 * @param {string} selText
 * @returns {{ text: string, from?: number, to?: number, skipScroll: boolean } | null}
 */
function seedFromCodeSelection(view, codeInput, selText) {
  const offsets = getLogicalSelectionOffsets(codeInput);
  const text = String(selText || '');
  if (!text) return null;

  const root = codeInput.closest && codeInput.closest('.mda-cm-code-block');
  if (!root || !view) {
    return { text: text, skipScroll: true };
  }
  const blockFrom = parseInt(root.getAttribute('data-mda-block-from') || '', 10);
  const blockTo = parseInt(root.getAttribute('data-mda-block-to') || '', 10);
  if (!Number.isFinite(blockFrom) || !Number.isFinite(blockTo) || blockTo <= blockFrom) {
    return { text: text, skipScroll: true };
  }
  if (!offsets || offsets.end <= offsets.start) {
    return { text: text, skipScroll: true };
  }

  const doc = view.state.doc.toString();
  const body = getFenceBodyDocRange(blockFrom, doc.slice(blockFrom, blockTo));
  if (!body) return { text: text, skipScroll: true };

  const plain = getCodeInputPlainText(codeInput);
  if (!fencePlainAligns(plain, body.code)) {
    return { text: text, skipScroll: true };
  }

  const from = body.bodyFrom + offsets.start;
  const to = body.bodyFrom + offsets.end;
  if (to <= from || to > body.bodyTo + 1) {
    return { text: text, skipScroll: true };
  }
  return { text: text, from: from, to: Math.min(to, body.bodyTo), skipScroll: true };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {HTMLElement} cell
 * @param {string} selText
 * @returns {{ text: string, from?: number, to?: number, skipScroll: boolean } | null}
 */
function seedFromTableCellSelection(view, cell, selText) {
  const text = String(selText || '');
  if (!text) return null;

  const root = cell.closest && cell.closest('.mda-cm-table-block');
  if (!root || !view) {
    return { text: text, skipScroll: true };
  }
  const blockFrom = parseInt(root.getAttribute('data-mda-block-from') || '', 10);
  const blockTo = parseInt(root.getAttribute('data-mda-block-to') || '', 10);
  if (!Number.isFinite(blockFrom) || !Number.isFinite(blockTo) || blockTo <= blockFrom) {
    return { text: text, skipScroll: true };
  }

  const vis = getCellVisibleSelection(cell);
  if (!vis || vis.end <= vis.start) {
    return { text: text, skipScroll: true };
  }

  const row = parseInt(cell.getAttribute('data-mda-row') || '0', 10);
  const col = parseInt(cell.getAttribute('data-mda-col') || '0', 10);
  const doc = view.state.doc.toString();
  const cellMap = buildTableCellDocMap(doc.slice(blockFrom, blockTo), blockFrom);
  let cellInfo = null;
  for (let i = 0; i < cellMap.length; i++) {
    if (cellMap[i].row === row && cellMap[i].col === col) {
      cellInfo = cellMap[i];
      break;
    }
  }
  if (!cellInfo) return { text: text, skipScroll: true };

  const liveMd = getCellMarkdownContent(cell);
  const docMd = doc.slice(cellInfo.docFrom, cellInfo.docTo);
  // 格内未写回时 DOM markdown 可能与文档不一致，仅有文本种子、不跳转
  if (liveMd !== docMd) {
    return { text: text, skipScroll: true };
  }

  const mdFrom = visibleToMarkdownOffset(docMd, vis.start);
  const mdTo = visibleToMarkdownOffset(docMd, vis.end);
  if (mdTo <= mdFrom) return { text: text, skipScroll: true };

  return {
    text: text,
    from: cellInfo.docFrom + mdFrom,
    to: cellInfo.docFrom + mdTo,
    skipScroll: true,
  };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @returns {{ text: string, from?: number, to?: number, skipScroll: boolean } | null}
 */
function getWidgetFindSeed(view) {
  if (typeof window === 'undefined' || !window.getSelection) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  let text = range.toString();
  if (!text) return null;
  text = String(text).replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
  if (!text) return null;

  const live =
    classifyWidgetEditable(document.activeElement) ||
    classifyWidgetEditable(sel.anchorNode) ||
    classifyWidgetEditable(sel.focusNode) ||
    classifyWidgetEditable(range.commonAncestorContainer);
  if (!live || !live.el) return null;
  try {
    if (!live.el.contains(range.startContainer) || !live.el.contains(range.endContainer)) {
      return null;
    }
  } catch (_) {
    return null;
  }

  if (live.kind === 'code') {
    return seedFromCodeSelection(view, live.el, text);
  }
  if (live.kind === 'table-cell') {
    return seedFromTableCellSelection(view, live.el, text);
  }
  // mermaid / math 源码：至少填词且不跳首命中
  return { text: text, skipScroll: true };
}

module.exports = {
  getWidgetFindSeed: getWidgetFindSeed,
};

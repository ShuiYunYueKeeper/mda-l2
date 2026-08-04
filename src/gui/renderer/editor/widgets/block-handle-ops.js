/**
 * 块手柄菜单：复制 / 剪切 / 删除 / 插入片段。
 */
'use strict';

const {
  resolveBlockRange,
  deleteBlockRange,
  expandBlockRange,
} = require('./image-block-ops');
const { getInsertSnippet, caretOffsetInSnippet } = require('./block-insert-snippets');
const { copyText } = require('./widget-common');

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from?: number, to?: number, source?: string }} block
 */
function getBlockSource(view, block) {
  if (!view) return '';
  if (block && block.source) return String(block.source);
  const range = resolveBlockRange(view, block || {});
  if (!range) return '';
  return view.state.doc.sliceString(range.from, range.to);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from?: number, to?: number, source?: string }} block
 * @param {(text: string) => void} [copyFn]
 */
function copyBlockSource(view, block, copyFn) {
  const text = getBlockSource(view, block);
  if (!text) return false;
  copyText(text, copyFn);
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from?: number, to?: number, source?: string }} block
 * @param {'above' | 'below'} where
 * @param {string} type
 */
function insertSnippetNearBlock(view, block, where, type) {
  if (!view) return false;
  const snippet = getInsertSnippet(type);
  if (!snippet) return false;
  const range = resolveBlockRange(view, block || {});
  if (!range) return false;

  const doc = view.state.doc.toString();
  const pos = where === 'above' ? range.from : range.to;
  let insert = snippet;
  if (where === 'above') {
    if (pos > 0 && doc.charAt(pos - 1) !== '\n') insert = '\n' + insert;
    insert += '\n';
  } else {
    if (pos < doc.length && doc.charAt(pos) !== '\n') insert = '\n' + insert;
    if (pos >= doc.length || doc.charAt(pos) !== '\n') insert += '\n';
  }

  const lead = insert.indexOf(snippet);
  const snippetStart = pos + (lead >= 0 ? lead : 0);
  const caret = snippetStart + caretOffsetInSnippet(type, snippet);

  view.dispatch({
    changes: { from: pos, to: pos, insert: insert },
    selection: { anchor: caret, head: caret },
    userEvent: 'input',
  });

  // 引用插入后短暂显手柄（不自动选中/蓝框），方便发现空块
  if (type === 'quote') {
    requestAnimationFrame(function () {
      const anchor = view.dom.querySelector(
        '.mda-cm-quote-handle-anchor[data-mda-block-from="' + snippetStart + '"]'
      );
      if (anchor) anchor.classList.add('mda-cm-block-handle-show');
    });
  }

  try {
    view.focus();
  } catch (_) {
    /* ignore */
  }
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from?: number, to?: number, source?: string }} block
 */
function deleteBlock(view, block) {
  const range = resolveBlockRange(view, block || {});
  if (!range) return false;
  deleteBlockRange(view, range.from, range.to);
  return true;
}

module.exports = {
  getBlockSource: getBlockSource,
  copyBlockSource: copyBlockSource,
  insertSnippetNearBlock: insertSnippetNearBlock,
  deleteBlock: deleteBlock,
  expandBlockRange: expandBlockRange,
};

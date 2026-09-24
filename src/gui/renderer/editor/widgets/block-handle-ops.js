/**
 * 块手柄菜单：复制 / 剪切 / 删除 / 插入片段。
 */
'use strict';

const { Transaction } = require('@codemirror/state');
const {
  resolveBlockRange,
  deleteBlockRange,
  expandBlockRange,
} = require('./image-block-ops');
const { getInsertSnippet, caretOffsetInSnippet, isLineOrientedInsertType, planLineOrientedInsert, formatBlankLineInsert, planHrInsertCaret, planMermaidInsert } = require('./block-insert-snippets');
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
 * 写回前钉选区：块 widget 选中时 CM6 选区常仍在文档头，不钉则 undo 后光标会还原到 0。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 */
function pinSelectionForHistory(view, pos) {
  if (!view || pos == null || isNaN(pos)) return;
  const caret = Math.max(0, Math.min(pos, view.state.doc.length));
  const sel = view.state.selection.main;
  if (sel.from !== caret || sel.to !== caret) {
    view.dispatch({
      selection: { anchor: caret, head: caret },
      annotations: Transaction.addToHistory.of(false),
    });
  }
}

/**
 * 在空白行处直接插入块（替换空行，不额外留下空行）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from?: number, to?: number, source?: string }} block
 * @param {string} type
 */
function insertSnippetAtBlankLine(view, block, type) {
  if (!view) return false;
  const snippet = getInsertSnippet(type);
  if (snippet == null) return false;
  const line = view.state.doc.lineAt(block && block.from != null ? block.from : 0);
  if (String(line.text || '').trim() !== '') return false;

  const formatted = formatBlankLineInsert(type, snippet, view.state.doc, line);
  const caret = line.from + formatted.caretOffset;
  pinSelectionForHistory(view, line.from);
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: formatted.insert },
    selection: { anchor: caret, head: caret },
    userEvent: 'input',
  });

  if (type === 'quote') {
    requestAnimationFrame(function () {
      const anchor = view.dom.querySelector(
        '.mda-cm-quote-handle-anchor[data-mda-block-from="' + line.from + '"]'
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
 * @param {'above' | 'below'} where
 * @param {string} type
 */
function insertSnippetNearBlock(view, block, where, type) {
  if (!view) return false;
  const snippet = getInsertSnippet(type);
  if (snippet == null) return false;
  const range = resolveBlockRange(view, block || {});
  if (!range) return false;

  if (isLineOrientedInsertType(type)) {
    const doc = view.state.doc;
    const firstLine = doc.lineAt(range.from);
    const lastLine = doc.lineAt(Math.max(range.from, Math.min(range.to, doc.length) - 1));
    const plan = planLineOrientedInsert(
      where,
      firstLine.from,
      lastLine.to,
      type,
      snippet
    );
    pinSelectionForHistory(view, plan.pos);
    view.dispatch({
      changes: { from: plan.pos, to: plan.pos, insert: plan.insert },
      selection: { anchor: plan.caret, head: plan.caret },
      userEvent: 'input',
    });
    try {
      view.focus();
    } catch (_) {
      /* ignore */
    }
    return true;
  }

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

  let hrCaret = null;
  if (type === 'hr') {
    const planned = planHrInsertCaret(view.state.doc, pos, insert, snippet);
    insert = planned.insert;
    hrCaret = planned.caret;
  }

  let mermaidCaret = null;
  if (type === 'mermaid') {
    const planned = planMermaidInsert(pos, insert, snippet);
    insert = planned.insert;
    mermaidCaret = planned.caret;
  }

  const lead = insert.indexOf(snippet);
  const snippetStart = pos + (lead >= 0 ? lead : 0);
  const caret =
    hrCaret != null
      ? hrCaret
      : mermaidCaret != null
        ? mermaidCaret
        : snippetStart + caretOffsetInSnippet(type, snippet);

  pinSelectionForHistory(view, pos);
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
 * @param {string} markdownLine
 */
function insertMarkdownAtBlankLine(view, block, markdownLine) {
  if (!view || !markdownLine) return false;
  const line = view.state.doc.lineAt(block && block.from != null ? block.from : 0);
  if (String(line.text || '').trim() !== '') return false;
  const snippet = String(markdownLine);
  const caret = line.from + snippet.length;
  pinSelectionForHistory(view, line.from);
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: snippet },
    selection: { anchor: caret, head: caret },
    userEvent: 'input',
  });
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
 * @param {'above' | 'below'} where
 * @param {string} markdownLine
 */
function insertMarkdownNearBlock(view, block, where, markdownLine) {
  if (!view || !markdownLine) return false;
  const range = resolveBlockRange(view, block || {});
  if (!range) return false;
  const snippet = String(markdownLine);
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
  const caret = snippetStart + snippet.length;
  pinSelectionForHistory(view, pos);
  view.dispatch({
    changes: { from: pos, to: pos, insert: insert },
    selection: { anchor: caret, head: caret },
    userEvent: 'input',
  });
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
  insertSnippetAtBlankLine: insertSnippetAtBlankLine,
  insertMarkdownAtBlankLine: insertMarkdownAtBlankLine,
  insertMarkdownNearBlock: insertMarkdownNearBlock,
  insertSnippetNearBlock: insertSnippetNearBlock,
  deleteBlock: deleteBlock,
  expandBlockRange: expandBlockRange,
};

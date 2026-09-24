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
const {
  getInsertSnippet,
  caretOffsetInSnippet,
  isLineOrientedInsertType,
  planLineOrientedInsert,
  formatBlankLineInsert,
  planHrInsertCaret,
  planBlockTrailingBlank,
  needsTrailingBlankInsert,
} = require('./block-insert-snippets');
const { copyText } = require('./widget-common');
const { setCellVisibleSelection } = require('./table-cell-content');
const { setCaretOffsetIn } = require('./code');

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} sel
 * @param {number} blockFrom
 * @returns {HTMLElement | null}
 */
function findInsertedBlockRoot(view, sel, blockFrom) {
  if (!view || !view.dom || blockFrom == null) return null;
  const exact = view.dom.querySelector(sel + '[data-mda-block-from="' + blockFrom + '"]');
  if (exact) return /** @type {HTMLElement} */ (exact);
  const nodes = view.dom.querySelectorAll(sel + '[data-mda-block-from]');
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const f = parseInt(nodes[i].getAttribute('data-mda-block-from') || '', 10);
    if (!(f >= 0)) continue;
    const d = Math.abs(f - blockFrom);
    if (d < bestDist) {
      bestDist = d;
      best = nodes[i];
    }
  }
  return bestDist <= 2 ? /** @type {HTMLElement} */ (best) : null;
}

/**
 * @param {HTMLElement} root
 * @returns {HTMLElement | null}
 */
function findFirstEmptyTableCell(root) {
  const cells = root.querySelectorAll('td[contenteditable]');
  for (let i = 0; i < cells.length; i++) {
    if (String(cells[i].textContent || '').trim() === '') {
      return /** @type {HTMLElement} */ (cells[i]);
    }
  }
  return cells.length ? /** @type {HTMLElement} */ (cells[0]) : null;
}

/**
 * 表格/代码是块 widget：文档光标落在源码偏移看不见，须把焦点送进格内 / 代码框。
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} type
 * @param {number} blockFrom
 */
function scheduleFocusInsertedBlockEdit(view, type, blockFrom) {
  if (type !== 'table' && type !== 'code') return;
  const run = function () {
    if (!view || !view.dom) return;
    try {
      view.dispatch({
        selection: { anchor: blockFrom, head: blockFrom },
        annotations: Transaction.addToHistory.of(false),
      });
    } catch (_) {
      /* ignore */
    }
    if (type === 'table') {
      const root = findInsertedBlockRoot(view, '.mda-cm-table-block', blockFrom);
      if (!root) return;
      const cell = findFirstEmptyTableCell(root);
      if (!cell) return;
      try {
        cell.focus();
      } catch (_) {
        /* ignore */
      }
      setCellVisibleSelection(cell, 0, 0);
      return;
    }
    const root = findInsertedBlockRoot(view, '.mda-cm-code-block', blockFrom);
    if (!root) return;
    const frame = root.querySelector('.mda-cm-code-frame');
    const input = root.querySelector('.mda-cm-code-input');
    if (frame) frame.classList.add('mda-cm-code-editing');
    if (!input) return;
    try {
      input.focus();
    } catch (_) {
      /* ignore */
    }
    setCaretOffsetIn(input, 0);
  };
  // 双 rAF：等 CM6 装饰层把新 widget 挂上 DOM
  requestAnimationFrame(function () {
    requestAnimationFrame(run);
  });
}

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

  scheduleFocusInsertedBlockEdit(view, type, line.from);

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

  let plannedCaret = null;
  if (type === 'hr') {
    const planned = planHrInsertCaret(view.state.doc, pos, insert, snippet);
    insert = planned.insert;
    plannedCaret = planned.caret;
  } else if (needsTrailingBlankInsert(type)) {
    const planned = planBlockTrailingBlank(pos, insert, snippet, type);
    insert = planned.insert;
    plannedCaret = planned.caret;
  }

  const lead = insert.indexOf(snippet);
  const snippetStart = pos + (lead >= 0 ? lead : 0);
  const caret =
    plannedCaret != null ? plannedCaret : snippetStart + caretOffsetInSnippet(type, snippet);

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

  scheduleFocusInsertedBlockEdit(view, type, snippetStart);

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
 * @param {string} [type='image'] 尾随空行/光标策略（image=块后空行；link=链接末尾）
 */
function insertMarkdownAtBlankLine(view, block, markdownLine, type) {
  if (!view || !markdownLine) return false;
  const line = view.state.doc.lineAt(block && block.from != null ? block.from : 0);
  if (String(line.text || '').trim() !== '') return false;
  const snippet = String(markdownLine);
  const kind = type || 'image';
  const formatted = formatBlankLineInsert(kind, snippet, view.state.doc, line);
  const caret = line.from + formatted.caretOffset;
  pinSelectionForHistory(view, line.from);
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: formatted.insert },
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
 * @param {string} [type='image']
 */
function insertMarkdownNearBlock(view, block, where, markdownLine, type) {
  if (!view || !markdownLine) return false;
  const range = resolveBlockRange(view, block || {});
  if (!range) return false;
  const snippet = String(markdownLine);
  const kind = type || 'image';
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
  const planned = planBlockTrailingBlank(pos, insert, snippet, kind);
  pinSelectionForHistory(view, pos);
  view.dispatch({
    changes: { from: pos, to: pos, insert: planned.insert },
    selection: { anchor: planned.caret, head: planned.caret },
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
 * 弹出链接编辑浮层，确认后写入 `[text](href)`（块后补空行，光标在链接末尾）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {'blank' | 'above' | 'below'} where
 * @param {{ from?: number, to?: number, source?: string }} block
 * @param {{ t?: Function }} [opts]
 * @returns {boolean}
 */
function promptInsertLink(view, where, block, opts) {
  if (!view) return false;
  const { showLinkEditPopover } = require('../link-edit-popover');
  let x = 80;
  let y = 80;
  try {
    let pos = 0;
    if (where === 'blank') {
      pos = block && block.from != null ? block.from : view.state.selection.main.head;
    } else {
      const range = resolveBlockRange(view, block || {});
      pos = range ? (where === 'above' ? range.from : range.to) : view.state.selection.main.head;
    }
    const coords = view.coordsAtPos(pos);
    if (coords) {
      x = coords.left;
      y = coords.bottom + 4;
    }
  } catch (_) {
    /* ignore */
  }
  const t = opts && typeof opts.t === 'function' ? opts.t : undefined;
  showLinkEditPopover({
    x: x,
    y: y,
    text: 'text',
    href: 'url',
    t: t,
    onConfirm: function (text, href) {
      const line = '[' + String(text || '') + '](' + String(href || '') + ')';
      if (where === 'blank') {
        insertMarkdownAtBlankLine(view, block, line, 'link');
      } else {
        insertMarkdownNearBlock(view, block, where, line, 'link');
      }
    },
  });
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
  promptInsertLink: promptInsertLink,
  deleteBlock: deleteBlock,
  expandBlockRange: expandBlockRange,
  scheduleFocusInsertedBlockEdit: scheduleFocusInsertedBlockEdit,
};

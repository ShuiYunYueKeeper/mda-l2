'use strict';

const {
  parseGfmTable,
  parseGfmTableBlock,
  serializeGfmTable,
  parseTableMetaLine,
  readTableFromDom,
  tablesEqual,
  expandTableBlockRange,
  MAX_TABLE_WIDGET_HEIGHT,
} = require('../model/parse-table');
const { BlockReplaceWidget, DEFAULT_LINE_HEIGHT } = require('./block-widget-base');
const { mountTableChrome, closeTableMenu } = require('./table-chrome');
const { deleteBlockRange } = require('./image-block-ops');
const { applyTableLayoutSession } = require('./table-layout-session');
const { attachTableBlockLayout, detachTableBlockLayout } = require('./table-layout-width');
const { clearBlockWidgetSelection } = require('./widget-common');
const { setSelectedBlock, clearSelectedBlock } = require('./block-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedMermaidBlock } = require('./mermaid-selection');
const { clearSelectedInlineMath, clearInlineMathSelectedClass } = require('./inline-math-selection');
const { Transaction } = require('@codemirror/state');

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, source: string }} widget
 */
function resolveTableBlockRange(view, widget) {
  const text = view.state.doc.toString();
  const len = text.length;
  const hintFrom = Math.max(0, Math.min(widget.from, len));
  const hintTo = Math.max(hintFrom, Math.min(widget.to, len));
  return expandTableBlockRange(text, hintFrom, hintTo);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, source: string }} widget
 */
function pinEditorToTable(view, widget) {
  if (!view || widget.from == null) return;
  const br = resolveTableBlockRange(view, widget);
  const pos = br.from;
  const sel = view.state.selection.main;
  if (sel.from === pos && sel.to === pos && sel.head === pos) return;
  view.dispatch({
    selection: { anchor: pos, head: pos },
    annotations: Transaction.addToHistory.of(false),
  });
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, source: string }} widget
 */
function markTableSelected(view, widget) {
  clearSelectedImageBlock();
  clearSelectedMermaidBlock();
  clearSelectedInlineMath();
  clearInlineMathSelectedClass(view && view.dom);
  clearBlockWidgetSelection(view.dom);
  if (widget && widget.from != null) {
    setSelectedBlock({
      kind: 'table',
      from: widget.from,
      to: widget.to,
      source: widget.source || '',
    });
  } else {
    clearSelectedBlock();
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, source: string }} widget
 */
function deleteTableBlock(view, widget) {
  if (!view || !widget) return;
  const br = resolveTableBlockRange(view, widget);
  deleteBlockRange(view, br.from, br.to);
}

/**
 * 写回表格正文；保留已有 @mda-table 行但不写入会话布局。
 * @param {string} blockText
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 */
function serializeTableBlockForDoc(blockText, parsed) {
  const body = serializeGfmTable(parsed);
  const lines = String(blockText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '')
    .split('\n');
  if (lines.length > 0 && parseTableMetaLine(lines[0])) {
    return lines[0] + '\n' + body;
  }
  return body;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, source: string }} widget
 * @param {{ headers: string[], aligns: string[], rows: string[][] }} parsed
 */
function syncParsedToDoc(view, widget, parsed) {
  if (!parsed || !view) return;
  const br = resolveTableBlockRange(view, widget);
  const from = br.from;
  const to = br.to;
  if (from < 0 || to < from || to > view.state.doc.length) return;
  const blockText = view.state.doc.sliceString(from, to);
  const docParsed = parseGfmTableBlock(blockText);
  const newSource = serializeTableBlockForDoc(blockText, parsed);
  if (docParsed && tablesEqual(docParsed, parsed) && blockText.trimEnd() === newSource.trimEnd()) {
    widget.source = newSource;
    widget.from = from;
    widget.to = from + blockText.length;
    return;
  }
  if (!parseGfmTable(newSource)) return;
  const trailing = blockText.endsWith('\n') ? '\n' : '';
  const insert = newSource + trailing;
  if (insert === blockText) {
    widget.source = newSource;
    widget.from = from;
    widget.to = to;
    return;
  }
  widget.source = newSource;
  widget.from = from;
  widget.to = from + insert.length;
  // 写回前钉选区到表首：单元格编辑时常未 pin，history 会把撤销光标还原到 0。
  const sel = view.state.selection.main;
  if (sel.from !== from || sel.to !== from) {
    view.dispatch({
      selection: { anchor: from, head: from },
    });
  }
  view.dispatch({
    changes: { from: from, to: to, insert: insert },
    selection: { anchor: from, head: from },
    userEvent: 'input',
  });
}

/**
 * 模式切换 / 保存前：把表格单元格未落盘的编辑写回文档。
 * @param {import('@codemirror/view').EditorView} view
 */
function flushAllTableWidgets(view) {
  if (!view || !view.dom) return;
  closeTableMenu();
  const roots = view.dom.querySelectorAll('.mda-cm-table-block');
  for (let i = 0; i < roots.length; i++) {
    const chrome = roots[i]._mdaTableChrome;
    if (chrome && typeof chrome.flush === 'function') {
      chrome.flush();
    }
  }
}

class TableWidget extends BlockReplaceWidget {
  /**
   * @param {string} source
   * @param {{ from?: number, to?: number, lineHeight?: number, t?: Function, copyText?: Function }} [opts]
   */
  constructor(source, opts) {
    super(source, Object.assign({ heightKind: 'table' }, opts || {}));
    this.opts = opts || {};
    this._maxMeasuredHeight = MAX_TABLE_WIDGET_HEIGHT;
    const normalized = String(source || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
    const parsed = parseGfmTableBlock(normalized);
    if (parsed) {
      this._minHeight = TableWidget.estimateTableHeight(parsed);
    } else {
      this._minHeight = Math.min(
        Math.max(this._lineCount * DEFAULT_LINE_HEIGHT, DEFAULT_LINE_HEIGHT),
        MAX_TABLE_WIDGET_HEIGHT
      );
    }
  }
  /**
   * @param {{ rows: string[][], rowHeights?: number[] }} parsed
   */
  static estimateTableHeight(parsed) {
    const rows = 1 + (parsed.rows ? parsed.rows.length : 0);
    let h = rows * 36 + 52;
    const rh = parsed.rowHeights || [];
    if (rh.some(function (x) {
      return x > 0;
    })) {
      let sum = 0;
      for (let i = 0; i < rows; i++) {
        sum += Math.max(28, Math.min(rh[i] || 28, 600));
      }
      h = sum + 52;
    }
    return Math.min(h, MAX_TABLE_WIDGET_HEIGHT);
  }
  get estimatedHeight() {
    if (this._dom && this._dom.isConnected) {
      return Math.min(super.estimatedHeight, MAX_TABLE_WIDGET_HEIGHT);
    }
    if (this._measured > 0) {
      return Math.min(this._measured, MAX_TABLE_WIDGET_HEIGHT);
    }
    const normalized = String(this.source || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
    const parsed = parseGfmTableBlock(normalized);
    if (parsed) {
      return TableWidget.estimateTableHeight(parsed);
    }
    return Math.min(super.estimatedHeight, MAX_TABLE_WIDGET_HEIGHT);
  }
  eq(other) {
    return (
      other instanceof TableWidget &&
      other.source === this.source &&
      other.from === this.from &&
      other.to === this.to
    );
  }
  toDOM(view) {
    const self = this;
    const opts = this.opts;
    const root = document.createElement('div');
    root.className = 'mda-cm-table-block mda-cm-table-block-line';
    root.setAttribute('contenteditable', 'false');
    if (self.from != null) root.setAttribute('data-mda-block-from', String(self.from));
    if (self.to != null) root.setAttribute('data-mda-block-to', String(self.to));
    if (self.source) root.setAttribute('data-mda-block-source', self.source);

    const normalized = String(this.source || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
    const parsed = parseGfmTableBlock(normalized);
    if (parsed) {
      applyTableLayoutSession(normalized, parsed);
      const chrome = mountTableChrome({
        view: view,
        widget: self,
        root: root,
        parsed: parsed,
        blockSource: normalized,
        t: opts.t,
        copyFn: opts.copyText,
        copyHtmlFn: opts.copyHtml,
        resolveImageUrl: opts.resolveImageUrl,
        blockMenuHandlers: opts.blockMenuHandlers,
        onMoveTableBlock: opts.onMoveTableBlock,
        onOpenZoom: opts.onOpenZoom,
        onCopyImage: opts.onCopyImage,
        onPasteTableCellImage: opts.onPasteTableCellImage,
        pinEditor: function () {
          pinEditorToTable(view, self);
        },
        readParsedFromDom: function () {
          const table = root.querySelector('table');
          return readTableFromDom(table);
        },
        onParsedChange: function (next) {
          syncParsedToDoc(view, self, next);
        },
        onDeleteTable: function () {
          deleteTableBlock(view, self);
        },
      });
      root.appendChild(chrome.stage);
      root._mdaTableChrome = chrome;
      attachTableBlockLayout(root, opts, view);
    } else {
      const fallback = document.createElement('pre');
      fallback.className = 'mda-cm-table-fallback';
      fallback.textContent = this.source;
      root.appendChild(fallback);
    }

    root.addEventListener('mousedown', function (e) {
      if (
        e.target &&
        e.target.closest &&
        e.target.closest('.mda-cm-table-col-resize-handle, .mda-cm-table-row-resize-handle')
      ) {
        return;
      }
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) {
        markTableSelected(view, self);
        root.classList.add('mda-cm-block-selected');
        pinEditorToTable(view, self);
        e.stopPropagation();
        return;
      }
      // 单元格就地编辑也须 pin + 选中块，隐藏 CM6 光标，避免列表上残留「双光标」
      pinEditorToTable(view, self);
      markTableSelected(view, self);
      root.classList.add('mda-cm-block-selected');
      if (e.target && e.target.closest && e.target.closest('th[contenteditable], td[contenteditable]')) {
        return;
      }
      e.stopPropagation();
    });

    this.bindMeasure(view, root);
    return root;
  }
  destroy(dom) {
    detachTableBlockLayout(dom);
    if (dom && dom._mdaTableChrome) {
      if (typeof dom._mdaTableChrome.dispose === 'function') {
        dom._mdaTableChrome.dispose();
      }
      dom._mdaTableChrome = null;
    }
    super.destroy(dom);
  }
}

module.exports = {
  TableWidget: TableWidget,
  syncParsedToDoc: syncParsedToDoc,
  pinEditorToTable: pinEditorToTable,
  deleteTableBlock: deleteTableBlock,
  resolveTableBlockRange: resolveTableBlockRange,
  flushAllTableWidgets: flushAllTableWidgets,
};

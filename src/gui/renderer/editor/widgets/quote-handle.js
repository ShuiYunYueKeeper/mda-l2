/**
 * 引用块左上角拖动手柄：不替换正文，挂在块首零宽 widget。
 */
'use strict';

const { WidgetType } = require('@codemirror/view');
const { attachBlockDragHandle, collectCmLinesInRange } = require('./block-drag-handle');
const { showBlockHandleMenu } = require('./block-handle-menu');
const { clearBlockWidgetSelection, clearMediaSelection, uiT } = require('./widget-common');
const { setSelectedBlock } = require('./block-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedMermaidBlock } = require('./mermaid-selection');
const { clearSelectedInlineMath, clearInlineMathSelectedClass } = require('./inline-math-selection');
const { Transaction } = require('@codemirror/state');

/**
 * 去掉引用标记后是否几乎无正文（空块可点选）。
 * @param {string} lineText
 */
function isEmptyQuoteLineText(lineText) {
  return !String(lineText || '')
    .replace(/^\s*>\s*/, '')
    .trim();
}

class QuoteHandleWidget extends WidgetType {
  /**
   * @param {{
   *   from: number,
   *   to: number,
   *   source?: string,
   *   t?: Function,
   *   blockMenuHandlers?: object,
   *   onMoveQuoteBlock?: Function,
   * }} opts
   */
  constructor(opts) {
    super();
    opts = opts || {};
    this.from = opts.from;
    this.to = opts.to;
    this.source = opts.source || '';
    this.opts = opts;
  }

  eq(other) {
    return (
      other instanceof QuoteHandleWidget &&
      other.from === this.from &&
      other.to === this.to &&
      other.source === this.source
    );
  }

  toDOM(view) {
    const self = this;
    const opts = this.opts;
    const wrap = document.createElement('span');
    wrap.className = 'mda-cm-quote-handle-anchor';
    wrap.setAttribute('contenteditable', 'false');
    wrap.setAttribute('data-mda-block-from', String(this.from));
    wrap.setAttribute('data-mda-block-to', String(this.to));
    if (this.source) wrap.setAttribute('data-mda-block-source', this.source);
    wrap.setAttribute('data-mda-block-kind', 'quote');

    const t = opts.t;
    const range = { from: self.from, to: self.to, source: self.source };

    function selectAnchor() {
      clearMediaSelection(view.dom);
      clearBlockWidgetSelection(view.dom);
      clearSelectedImageBlock();
      clearSelectedMermaidBlock();
      clearSelectedInlineMath();
      clearInlineMathSelectedClass(view.dom);
      wrap.classList.add('mda-cm-block-selected');
      setSelectedBlock({
        kind: 'quote',
        from: self.from,
        to: self.to,
        source: self.source,
      });
      try {
        if (self.from != null) {
          const pos = Math.max(0, Math.min(self.from, view.state.doc.length));
          const sel = view.state.selection.main;
          if (sel.from !== pos || sel.to !== pos) {
            view.dispatch({
              selection: { anchor: pos, head: pos },
              annotations: Transaction.addToHistory.of(false),
            });
          }
          view.focus();
        }
      } catch (_) {
        /* ignore */
      }
    }

    attachBlockDragHandle(wrap, view, range, {
      blockRoot: wrap,
      blockSelector: '.mda-cm-quote-handle-anchor',
      replaceOnHover: false,
      blockKind: 'quote',
      blockMenuHandlers: opts.blockMenuHandlers,
      t: t,
      onMoveBlock: opts.onMoveQuoteBlock,
      onHandleClick: function (handle, block) {
        selectAnchor();
        showBlockHandleMenu({
          anchorEl: handle,
          blockRoot: wrap,
          view: view,
          block: block,
          blockKind: 'quote',
          t: t,
          handlers: opts.blockMenuHandlers,
        });
      },
    });

    const handle = wrap.querySelector('.mda-cm-block-drag-handle');
    if (handle && t) {
      handle.title = uiT('widgetBlockDragHandle', t);
      handle.setAttribute('aria-label', uiT('widgetBlockDragHandle', t));
    }

    wrap.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) {
        selectAnchor();
        return;
      }
    });

    // 空块行：点击行身即可选中（toDOM 时尚未入树，延后绑定）
    requestAnimationFrame(function () {
      if (!wrap.isConnected) return;
      const lines = collectCmLinesInRange(view, self.from, self.to);
      for (let i = 0; i < lines.length; i++) {
        const lineEl = lines[i];
        lineEl.addEventListener('mousedown', function (e) {
          if (e.button !== 0) return;
          if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) {
            return;
          }
          const raw = lineEl.textContent || '';
          if (!isEmptyQuoteLineText(raw)) return;
          e.preventDefault();
          selectAnchor();
        });
      }
    });

    return wrap;
  }

  ignoreEvent() {
    return true;
  }

  /** 零宽挂点，不参与行高，避免扭曲 posAtCoords */
  get estimatedHeight() {
    return 0;
  }
}

module.exports = {
  QuoteHandleWidget: QuoteHandleWidget,
  isEmptyQuoteLineText: isEmptyQuoteLineText,
};

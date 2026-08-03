/**
 * 引用 / 高亮块（> [!NOTE]）左上角拖动手柄：不替换正文，挂在块首零宽 widget。
 */
'use strict';

const { WidgetType } = require('@codemirror/view');
const { attachBlockDragHandle } = require('./block-drag-handle');
const { showBlockHandleMenu } = require('./block-handle-menu');
const { clearBlockWidgetSelection, clearMediaSelection, uiT } = require('./widget-common');
const { setSelectedBlock } = require('./block-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedMermaidBlock } = require('./mermaid-selection');
const { Transaction } = require('@codemirror/state');

/**
 * @param {string} firstLine
 */
function isHighlightCalloutLine(firstLine) {
  return /^\s*>\s*\[![A-Za-z][\w-]*\]/.test(String(firstLine || ''));
}

/**
 * @param {string} source
 */
function detectQuoteKind(source) {
  const raw = String(source || '');
  const nl = raw.indexOf('\n');
  const first = nl < 0 ? raw : raw.slice(0, nl);
  return isHighlightCalloutLine(first) ? 'highlight' : 'quote';
}

class QuoteHandleWidget extends WidgetType {
  /**
   * @param {{
   *   from: number,
   *   to: number,
   *   source?: string,
   *   quoteKind?: string,
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
    this.quoteKind = opts.quoteKind || detectQuoteKind(this.source);
    this.opts = opts;
  }

  eq(other) {
    return (
      other instanceof QuoteHandleWidget &&
      other.from === this.from &&
      other.to === this.to &&
      other.source === this.source &&
      other.quoteKind === this.quoteKind
    );
  }

  toDOM(view) {
    const self = this;
    const opts = this.opts;
    const wrap = document.createElement('span');
    wrap.className =
      'mda-cm-quote-handle-anchor' +
      (this.quoteKind === 'highlight' ? ' mda-cm-quote-handle-highlight' : '');
    wrap.setAttribute('contenteditable', 'false');
    wrap.setAttribute('data-mda-block-from', String(this.from));
    wrap.setAttribute('data-mda-block-to', String(this.to));
    if (this.source) wrap.setAttribute('data-mda-block-source', this.source);
    wrap.setAttribute('data-mda-block-kind', this.quoteKind);

    const t = opts.t;
    const range = { from: self.from, to: self.to, source: self.source };

    function selectAnchor() {
      clearMediaSelection(view.dom);
      clearBlockWidgetSelection(view.dom);
      clearSelectedImageBlock();
      clearSelectedMermaidBlock();
      wrap.classList.add('mda-cm-block-selected');
      setSelectedBlock({
        kind: self.quoteKind === 'highlight' ? 'highlight' : 'quote',
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
      blockKind: self.quoteKind,
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
          blockKind: self.quoteKind,
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
  detectQuoteKind: detectQuoteKind,
  isHighlightCalloutLine: isHighlightCalloutLine,
};

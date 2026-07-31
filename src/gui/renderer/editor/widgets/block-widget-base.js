/**
 * M8-C1 / COORD-5：块级 replace widget 高度与 CM6 高度图对齐。
 */
'use strict';

const { WidgetType } = require('@codemirror/view');

const DEFAULT_LINE_HEIGHT = 26;

/**
 * @param {string} text
 */
function countSourceLines(text) {
  if (!text) return 1;
  let n = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n += 1;
  }
  return n;
}

/**
 * @param {HTMLElement} dom
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ _measured: number }} widget
 */
function attachBlockMeasure(dom, view, widget) {
  function measure() {
    if (!dom.isConnected || !view) return;
    const rect = dom.getBoundingClientRect();
    const style = window.getComputedStyle(dom);
    const marginTop = parseFloat(style.marginTop) || 0;
    const marginBottom = parseFloat(style.marginBottom) || 0;
    let h = rect.height + marginTop + marginBottom;
    const cap = widget._maxMeasuredHeight;
    if (cap > 0 && h > cap) h = cap;
    if (h > 0 && Math.abs(h - widget._measured) > 0.5) {
      widget._measured = h;
      try {
        view.requestMeasure();
      } catch (_) {
        /* view may be torn down */
      }
    }
  }
  requestAnimationFrame(measure);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(function () {
      measure();
    });
    ro.observe(dom);
    dom._mdaBlockMeasureRo = ro;
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number }} widget
 * @param {{ onFocusBlock?: Function }} opts
 * @param {string} kind
 * @param {Event} event
 */
function handleBlockPointer(view, widget, opts, kind, event) {
  event.preventDefault();
  event.stopPropagation();
  if (view && typeof view.dispatch === 'function') {
    view.dispatch({
      selection: { anchor: widget.from, head: widget.from },
      scrollIntoView: true,
    });
  }
  if (typeof opts.onFocusBlock === 'function') {
    opts.onFocusBlock({ from: widget.from, to: widget.to, kind: kind });
  }
}

class BlockReplaceWidget extends WidgetType {
  /**
   * @param {string} source
   * @param {{ from?: number, to?: number, lineHeight?: number, minHeight?: number }} [opts]
   */
  constructor(source, opts) {
    super();
    this.source = source || '';
    this.opts = opts || {};
    this.from = opts && opts.from != null ? opts.from : 0;
    this.to = opts && opts.to != null ? opts.to : 0;
    this._lineHeight = opts && opts.lineHeight > 0 ? opts.lineHeight : DEFAULT_LINE_HEIGHT;
    this._minHeight = opts && opts.minHeight > 0 ? opts.minHeight : this._lineHeight;
    this._lineCount = countSourceLines(this.source);
    this._measured = -1;
  }

  get estimatedHeight() {
    if (this._measured > 0) return this._measured;
    return Math.max(this._lineCount * this._lineHeight, this._minHeight);
  }

  /**
   * @param {import('@codemirror/view').EditorView} view
   * @param {HTMLElement} dom
   */
  bindMeasure(view, dom) {
    attachBlockMeasure(dom, view, this);
  }

  destroy(dom) {
    if (dom && dom._mdaBlockMeasureRo) {
      dom._mdaBlockMeasureRo.disconnect();
      dom._mdaBlockMeasureRo = null;
    }
  }

  ignoreEvent() {
    return true;
  }
}

module.exports = {
  DEFAULT_LINE_HEIGHT: DEFAULT_LINE_HEIGHT,
  countSourceLines: countSourceLines,
  attachBlockMeasure: attachBlockMeasure,
  handleBlockPointer: handleBlockPointer,
  BlockReplaceWidget: BlockReplaceWidget,
};

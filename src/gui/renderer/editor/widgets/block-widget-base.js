/**
 * M8-C1 / COORD-5：块级 replace widget 高度与 CM6 高度图对齐。
 *
 * 测高缓存在模块级 Map：装饰重建时 widget 实例会换新，实例上的 `_measured`
 * 会丢；若不跨实例保留，estimatedHeight 回落低估 → posAtCoords/光标与视觉错位。
 */
'use strict';

const { WidgetType } = require('@codemirror/view');

const DEFAULT_LINE_HEIGHT = 26;

/** @type {Map<string, number>} */
const measuredHeightCache = new Map();

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
 * @param {string} kind
 * @param {number} from
 * @param {number} to
 * @param {string} source
 */
function blockHeightCacheKey(kind, from, to, source) {
  return kind + ':' + from + ':' + to + ':' + String(source || '');
}

/**
 * @param {string} key
 * @param {number} h
 */
function rememberMeasuredHeight(key, h) {
  if (!key || !(h > 0)) return;
  measuredHeightCache.set(key, h);
}

/**
 * @param {string} key
 * @returns {number}
 */
function recallMeasuredHeight(key) {
  if (!key || !measuredHeightCache.has(key)) return -1;
  return measuredHeightCache.get(key);
}

/**
 * @param {HTMLElement} dom
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ _measured: number, _cacheKey?: string, _maxMeasuredHeight?: number, _dom?: HTMLElement | null }} widget
 */
function attachBlockMeasure(dom, view, widget) {
  widget._dom = dom;
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
      rememberMeasuredHeight(widget._cacheKey, h);
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
 * Mermaid/图片异步撑高后：写入测高并 requestMeasure。
 * @param {{ _measured: number, _cacheKey?: string, _maxMeasuredHeight?: number, _dom?: HTMLElement | null }} widget
 * @param {import('@codemirror/view').EditorView | null | undefined} view
 * @param {HTMLElement | null | undefined} [dom]
 */
function syncWidgetHeightFromDom(widget, view, dom) {
  const el = dom || widget._dom;
  if (!widget || !el || !el.isConnected) return;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  let h = rect.height + marginTop + marginBottom;
  const cap = widget._maxMeasuredHeight;
  if (cap > 0 && h > cap) h = cap;
  if (!(h > 0)) return;
  widget._measured = h;
  rememberMeasuredHeight(widget._cacheKey, h);
  if (view) {
    try {
      view.requestMeasure();
    } catch (_) {
      /* ignore */
    }
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
   * @param {{ from?: number, to?: number, lineHeight?: number, minHeight?: number, heightKind?: string }} [opts]
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
    this._cacheKey = blockHeightCacheKey(
      (opts && opts.heightKind) || 'block',
      this.from,
      this.to,
      this.source
    );
    const cached = recallMeasuredHeight(this._cacheKey);
    this._measured = cached > 0 ? cached : -1;
  }

  get estimatedHeight() {
    // 已挂载时读真实 DOM 高度（须为正值；CM6 对 block 的 -1 会回落成单行高）。
    if (this._dom && this._dom.isConnected) {
      const rect = this._dom.getBoundingClientRect();
      const style = window.getComputedStyle(this._dom);
      const marginTop = parseFloat(style.marginTop) || 0;
      const marginBottom = parseFloat(style.marginBottom) || 0;
      let h = rect.height + marginTop + marginBottom;
      const cap = this._maxMeasuredHeight;
      if (cap > 0 && h > cap) h = cap;
      if (h > 0) {
        this._measured = h;
        rememberMeasuredHeight(this._cacheKey, h);
        return h;
      }
    }
    if (this._measured > 0) return this._measured;
    return Math.max(this._lineCount * this._lineHeight, this._minHeight);
  }

  /**
   * @param {import('@codemirror/view').EditorView} view
   * @param {HTMLElement} dom
   */
  bindMeasure(view, dom) {
    this._dom = dom;
    attachBlockMeasure(dom, view, this);
  }

  destroy(dom) {
    if (this._dom === dom) this._dom = null;
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
  syncWidgetHeightFromDom: syncWidgetHeightFromDom,
  handleBlockPointer: handleBlockPointer,
  blockHeightCacheKey: blockHeightCacheKey,
  rememberMeasuredHeight: rememberMeasuredHeight,
  recallMeasuredHeight: recallMeasuredHeight,
  BlockReplaceWidget: BlockReplaceWidget,
};

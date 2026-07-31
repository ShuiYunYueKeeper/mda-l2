'use strict';

const { parseImageMarkdown } = require('../model/parse-image');
const { createMdSurface } = require('./md-surface');
const { createBlockToolbar, clearMediaSelection, uiT } = require('./widget-common');
const { attachImageDrag } = require('./image-drag');
const { attachImageCornerResize, isNearFrameResizeCorner } = require('./image-edge-resize');
const {
  setSelectedImageBlock,
  getSelectedImageBlock,
  syncSelectedImageFrameClass,
} = require('./image-selection');
const { BlockReplaceWidget } = require('./block-widget-base');
const { syncFrameToImage, applyLiveImageWidth } = require('./image-layout');

/**
 * @param {HTMLImageElement} img
 * @param {{ onScaleImage?: Function, getSavedDisplayWidth?: Function }} opts
 */
function applyImageDisplayConstraints(img, opts) {
  if (!img) return;
  let saved = parseInt(img.getAttribute('data-mda-display-width') || '', 10);
  if (!(saved > 0) && typeof opts.getSavedDisplayWidth === 'function') {
    const key = img.getAttribute('src') || '';
    const w = opts.getSavedDisplayWidth(key);
    if (w > 0) saved = w;
  }
  if (saved > 0) {
    applyLiveImageWidth(img, saved);
    return;
  }
  img.style.display = 'block';
  if (typeof opts.onScaleImage === 'function') {
    opts.onScaleImage(img);
  } else {
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
  }
  syncFrameToImage(img);
}

/**
 * @param {HTMLImageElement} img
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ onScaleImage?: Function }} opts
 */
function bindImageReady(img, view, opts) {
  function onReady() {
    applyImageDisplayConstraints(img, opts);
  }
  img.addEventListener('load', onReady);
  img.addEventListener('error', onReady);
  if (img.complete) onReady();
}

class ImageWidget extends BlockReplaceWidget {
  /**
   * @param {string} source
   * @param {{ renderMarkdown?: Function, resolveImageUrl?: Function, onOpenZoom?: Function, onScaleImage?: Function, onDeleteImageBlock?: Function, onReplaceImageBlock?: Function, onMoveImageBlock?: Function, t?: Function, from?: number, to?: number, lineHeight?: number }} [opts]
   */
  constructor(source, opts) {
    super(source, opts);
    this.opts = opts || {};
    this.meta = parseImageMarkdown(this.source);
    this._minHeight = 48;
  }
  get estimatedHeight() {
    if (this._measured > 0) return this._measured;
    return Math.max(this._minHeight, this._lineHeight * 2);
  }
  eq(other) {
    return (
      other instanceof ImageWidget &&
      other.source === this.source &&
      other.from === this.from &&
      other.to === this.to
    );
  }
  toDOM(view) {
    const opts = this.opts;
    const self = this;
    const t = opts.t;
    const root = document.createElement('div');
    root.className = 'mda-cm-image-block mda-cm-image-block-line';
    root.setAttribute('contenteditable', 'false');
    if (self.from != null) root.setAttribute('data-mda-block-from', String(self.from));
    if (self.to != null) root.setAttribute('data-mda-block-to', String(self.to));
    if (self.source) root.setAttribute('data-mda-block-source', self.source);

    const frame = document.createElement('div');
    frame.className = 'mda-cm-image-frame mda-cm-media-block';
    frame.setAttribute('data-i18n-title', 'widgetImageDragHint');
    frame.title = uiT('widgetImageDragHint', t);

    const toolbar = createBlockToolbar(root, {
      t: t,
      buttons: [
        { id: 'replace', i18nKey: 'widgetImageReplace' },
        { id: 'delete', i18nKey: 'widgetImageDelete' },
      ],
    });
    toolbar.classList.add('mda-cm-image-toolbar');

    const inner = createMdSurface(this.source, {
      renderMarkdown: opts.renderMarkdown,
      resolveImageUrl: opts.resolveImageUrl,
      inline: true,
    });
    inner.className = 'mda-cm-image-inner';
    frame.appendChild(inner);

    const handles = document.createElement('span');
    handles.className = 'mda-cm-image-handles';
    handles.setAttribute('aria-hidden', 'true');
    const dot = document.createElement('i');
    dot.className = 'mda-cm-image-handle mda-cm-image-handle-br';
    handles.appendChild(dot);
    frame.appendChild(handles);

    const img = inner.querySelector('img');

    function selectFrame() {
      const editorRoot = root.closest('.cm-editor');
      clearMediaSelection(editorRoot, 'mda-cm-media-selected');
      frame.classList.add('mda-cm-media-selected');
      setSelectedImageBlock({
        from: self.from,
        to: self.to,
        source: self.source,
        meta: self.meta,
      });
      try {
        if (view) view.focus();
      } catch (_) {
        /* ignore */
      }
    }

    toolbar.addEventListener('click', function (e) {
      const btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      if (action === 'delete' && typeof opts.onDeleteImageBlock === 'function') {
        frame.classList.remove('mda-cm-media-selected');
        opts.onDeleteImageBlock({ from: self.from, to: self.to, source: self.source });
      } else if (action === 'replace' && typeof opts.onReplaceImageBlock === 'function') {
        opts.onReplaceImageBlock({
          from: self.from,
          to: self.to,
          source: self.source,
          meta: self.meta,
        });
      }
    });

    root.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-image-toolbar')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-image-handle-br')) return;
      if (isNearFrameResizeCorner(frame, e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      selectFrame();
    });

    if (img) {
      bindImageReady(img, view, opts);
      attachImageCornerResize(frame, img, opts, selectFrame);
    }

    root.addEventListener('dblclick', function (e) {
      if (e.target && e.target.closest && e.target.closest('.mda-cm-image-toolbar')) return;
      e.preventDefault();
      e.stopPropagation();
      const targetImg = inner.querySelector('img');
      if (!targetImg || typeof opts.onOpenZoom !== 'function') return;
      opts.onOpenZoom({
        node: targetImg.cloneNode(true),
        opts: { kind: 'image', imageSrc: targetImg.getAttribute('src') || '' },
      });
    });

    attachImageDrag(root, view, { from: self.from, to: self.to, source: self.source }, opts);

    const persisted = getSelectedImageBlock();
    if (
      persisted &&
      persisted.from === self.from &&
      persisted.to === self.to &&
      persisted.source === self.source
    ) {
      frame.classList.add('mda-cm-media-selected');
    }

    root.appendChild(frame);
    this.bindMeasure(view, root);
    return root;
  }
}

module.exports = {
  ImageWidget: ImageWidget,
  bindImageReady: bindImageReady,
  syncSelectedImageFrameClass: syncSelectedImageFrameClass,
};

'use strict';

const { parseFencedCode } = require('../model/parse-fence');
const { createBlockToolbar, copyText, uiT, clearMediaSelection } = require('./widget-common');
const { BlockReplaceWidget } = require('./block-widget-base');
const { attachMermaidCornerResize } = require('./mermaid-edge-resize');
const { isNearFrameResizeCorner } = require('./image-edge-resize');
const {
  setSelectedMermaidBlock,
  getSelectedMermaidBlock,
  syncSelectedMermaidFrameClass,
} = require('./mermaid-selection');
const { syncMermaidFrameToStage } = require('./mermaid-layout');

/**
 * @param {HTMLElement} stage
 * @param {{ onScaleMermaid?: Function, getSavedMermaidDisplayWidth?: Function }} opts
 */
function applyMermaidDisplayConstraints(stage, opts) {
  if (!stage) return;
  let saved = parseInt(stage.getAttribute('data-mda-display-width') || '', 10);
  if (!(saved > 0) && typeof opts.getSavedMermaidDisplayWidth === 'function') {
    const key = stage.getAttribute('data-mermaid-src') || '';
    const w = opts.getSavedMermaidDisplayWidth(key);
    if (w > 0) saved = w;
  }
  if (saved > 0) {
    const { applyLiveMermaidWidth } = require('./mermaid-layout');
    applyLiveMermaidWidth(stage, saved);
    return;
  }
  if (typeof opts.onScaleMermaid === 'function') {
    opts.onScaleMermaid(stage);
  }
  syncMermaidFrameToStage(stage);
}

class MermaidWidget extends BlockReplaceWidget {
  /**
   * @param {string} source
   * @param {object} [opts]
   */
  constructor(source, opts) {
    super(source, opts);
    this.opts = opts || {};
    const parsed = parseFencedCode(this.source);
    this.code = parsed ? parsed.code : this.source;
    this._minHeight = Math.max(this._lineCount * this._lineHeight, 120);
  }
  eq(other) {
    return (
      other instanceof MermaidWidget &&
      other.source === this.source &&
      other.from === this.from &&
      other.to === this.to
    );
  }
  toDOM(view) {
    const opts = this.opts;
    const t = opts.t;
    const self = this;
    const root = document.createElement('div');
    root.className = 'mda-cm-mermaid-block mda-cm-mermaid-block-line';
    root.setAttribute('contenteditable', 'false');
    if (self.from != null) root.setAttribute('data-mda-block-from', String(self.from));
    if (self.to != null) root.setAttribute('data-mda-block-to', String(self.to));
    if (self.source) root.setAttribute('data-mda-block-source', self.source);

    const frame = document.createElement('div');
    frame.className = 'mda-cm-mermaid-frame mda-cm-media-block';
    frame.title = uiT('widgetMermaidDragHint', t);

    const toolbar = createBlockToolbar(frame, {
      label: uiT('diagram', t),
      buttons: [
        { id: 'copy-image', label: uiT('zoomCopyImage', t), title: uiT('zoomCopyImage', t) },
        { id: 'copy', label: uiT('zoomCopySource', t), title: uiT('zoomCopySource', t) },
        { id: 'source', label: uiT('widgetCodeSource', t), title: uiT('widgetCodeSource', t) },
      ],
    });

    const stage = document.createElement('div');
    stage.className = 'mda-cm-mermaid-stage mda-mermaid';
    stage.textContent = uiT('widgetMermaidLoading', t);
    frame.appendChild(stage);

    const sourcePanel = document.createElement('div');
    sourcePanel.className = 'mda-cm-mermaid-source';
    const sourceEditor = document.createElement('textarea');
    sourceEditor.className = 'mda-cm-mermaid-source-input';
    sourceEditor.spellcheck = false;
    sourceEditor.setAttribute('aria-label', uiT('widgetCodeSource', t));
    sourceEditor.value = self.code;
    sourcePanel.appendChild(sourceEditor);
    frame.appendChild(sourcePanel);

    const handles = document.createElement('span');
    handles.className = 'mda-cm-mermaid-handles';
    handles.setAttribute('aria-hidden', 'true');
    const cornerNames = ['tl', 'tr', 'bl', 'br'];
    for (let hi = 0; hi < cornerNames.length; hi++) {
      const dot = document.createElement('i');
      dot.className = 'mda-cm-mermaid-handle mda-cm-mermaid-handle-' + cornerNames[hi];
      handles.appendChild(dot);
    }
    frame.appendChild(handles);

    let showingSource = false;
    const sourceBtn = toolbar.querySelector('[data-action="source"]');

    function commitSourceEdit() {
      const next = sourceEditor.value.replace(/\r\n/g, '\n');
      if (next === self.code) return;
      if (typeof opts.onEditMermaidBlock === 'function') {
        opts.onEditMermaidBlock({
          from: self.from,
          to: self.to,
          source: self.source,
          code: next,
        });
      }
    }

    function setSourceMode(on) {
      if (!on && showingSource) commitSourceEdit();
      showingSource = !!on;
      frame.classList.toggle('mda-cm-mermaid-source-mode', showingSource);
      if (sourceBtn) {
        const label = showingSource ? uiT('widgetMermaidPreview', t) : uiT('widgetCodeSource', t);
        sourceBtn.textContent = label;
        sourceBtn.title = label;
      }
      if (showingSource) {
        sourceEditor.value = self.code;
        requestAnimationFrame(function () {
          sourceEditor.focus();
        });
      }
      try {
        if (view) view.requestMeasure();
      } catch (_) {
        /* ignore */
      }
    }

    function selectFrame() {
      const editorRoot = root.closest('.cm-editor');
      clearMediaSelection(editorRoot, 'mda-cm-media-selected');
      frame.classList.add('mda-cm-media-selected');
      setSelectedMermaidBlock({
        from: self.from,
        to: self.to,
        source: self.source,
        code: self.code,
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
      if (action === 'copy-image') {
        if (typeof opts.onCopyMermaidImage === 'function') {
          opts.onCopyMermaidImage(stage, self.code);
        }
      } else if (action === 'copy') copyText(self.source, opts.copyText);
      else if (action === 'source') setSourceMode(!showingSource);
    });

    sourceEditor.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
    sourceEditor.addEventListener('blur', commitSourceEdit);

    root.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-mermaid-source-input')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-toolbar')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-mermaid-handle-br')) return;
      if (isNearFrameResizeCorner(frame, e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      selectFrame();
    });

    frame.addEventListener('dblclick', function (e) {
      if (showingSource) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-toolbar')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-mermaid-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      const svg = stage.querySelector('svg');
      if (svg && typeof opts.onOpenZoom === 'function') {
        opts.onOpenZoom({
          node: svg.cloneNode(true),
          opts: { kind: 'mermaid', mermaidSrc: self.code },
        });
      }
    });

    attachMermaidCornerResize(frame, stage, opts, selectFrame);

    const persisted = getSelectedMermaidBlock();
    if (
      persisted &&
      persisted.from === self.from &&
      persisted.to === self.to &&
      persisted.source === self.source
    ) {
      frame.classList.add('mda-cm-media-selected');
    }

    if (typeof opts.renderMermaid === 'function') {
      Promise.resolve(opts.renderMermaid(self.code, stage))
        .then(function () {
          applyMermaidDisplayConstraints(stage, opts);
          try {
            if (view) view.requestMeasure();
          } catch (_) {
            /* ignore */
          }
        })
        .catch(function () {
          stage.textContent = uiT('mermaidFail', t, { error: '' });
          stage.classList.add('mda-mermaid-error');
          try {
            if (view) view.requestMeasure();
          } catch (_) {
            /* ignore */
          }
        });
    }

    root.appendChild(frame);
    this.bindMeasure(view, root);
    return root;
  }
}

module.exports = {
  MermaidWidget: MermaidWidget,
  applyMermaidDisplayConstraints: applyMermaidDisplayConstraints,
  syncSelectedMermaidFrameClass: syncSelectedMermaidFrameClass,
};

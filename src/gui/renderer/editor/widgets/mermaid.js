'use strict';

const { parseFencedCode } = require('../model/parse-fence');
const { createBlockToolbar, copyText, uiT, clearMediaSelection, clearBlockWidgetSelection } = require('./widget-common');
const { BlockReplaceWidget, syncWidgetHeightFromDom } = require('./block-widget-base');
const { attachMermaidCornerResize } = require('./mermaid-edge-resize');
const { isNearFrameResizeCorner } = require('./image-edge-resize');
const { attachBlockDragHandle } = require('./block-drag-handle');
const {
  setSelectedMermaidBlock,
  getSelectedMermaidBlock,
  syncSelectedMermaidFrameClass,
} = require('./mermaid-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedInlineMath, clearInlineMathSelectedClass } = require('./inline-math-selection');
const { attachWidgetEditablePointerIsolation } = require('../widget-editable-guard');
const { clearSelectedBlock } = require('./block-selection');
const { syncMermaidFrameToStage } = require('./mermaid-layout');
const {
  getMermaidFirstKeyword,
  mermaidDiagramTypeLabel,
} = require('./mermaid-diagram-type');
const { Transaction } = require('@codemirror/state');

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
    super(source, Object.assign({ heightKind: 'mermaid' }, opts || {}));
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
    frame.setAttribute('data-i18n-title', 'widgetMermaidDragHint');
    frame.title = uiT('widgetMermaidDragHint', t);

    const mermaidKeyword = getMermaidFirstKeyword(self.code);
    const toolbar = createBlockToolbar(frame, {
      t: t,
      label: mermaidDiagramTypeLabel(self.code, t),
      buttons: [
        { id: 'copy-image', i18nKey: 'zoomCopyImage' },
        { id: 'copy', i18nKey: 'zoomCopySource' },
        { id: 'source', i18nKey: 'widgetCodeSource', i18nToggle: 'mermaid-source' },
      ],
    });
    const typeLabel = toolbar.querySelector('.mda-cm-block-toolbar-label');
    if (typeLabel && mermaidKeyword) {
      typeLabel.setAttribute('data-mda-mermaid-kw', mermaidKeyword);
    }

    const stage = document.createElement('div');
    stage.className = 'mda-cm-mermaid-stage mda-mermaid';
    stage.textContent = uiT('widgetMermaidLoading', t);
    frame.appendChild(stage);

    const sourcePanel = document.createElement('div');
    sourcePanel.className = 'mda-cm-mermaid-source';
    const sourceEditor = document.createElement('div');
    sourceEditor.className = 'mda-cm-mermaid-source-input';
    sourceEditor.setAttribute('contenteditable', 'true');
    sourceEditor.setAttribute('role', 'textbox');
    sourceEditor.setAttribute('aria-multiline', 'true');
    sourceEditor.setAttribute('spellcheck', 'false');
    sourceEditor.setAttribute('data-i18n-aria', 'widgetCodeSource');
    sourceEditor.setAttribute('aria-label', uiT('widgetCodeSource', t));
    sourceEditor.textContent = self.code;
    attachWidgetEditablePointerIsolation(sourceEditor);
    sourcePanel.appendChild(sourceEditor);
    frame.appendChild(sourcePanel);

    const handles = document.createElement('span');
    handles.className = 'mda-cm-mermaid-handles';
    handles.setAttribute('aria-hidden', 'true');
    const dot = document.createElement('i');
    dot.className = 'mda-cm-mermaid-handle mda-cm-mermaid-handle-br';
    handles.appendChild(dot);
    frame.appendChild(handles);

    let showingSource = false;
    const sourceBtn = toolbar.querySelector('[data-action="source"]');

    function readSourceText() {
      return (sourceEditor.innerText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    function commitSourceEdit() {
      const next = readSourceText();
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
        sourceEditor.textContent = self.code;
        requestAnimationFrame(function () {
          sourceEditor.focus();
        });
      } else {
        root.classList.add('mda-cm-block-handle-show');
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
      clearBlockWidgetSelection(editorRoot || document);
      clearSelectedImageBlock();
      clearSelectedBlock();
      clearSelectedInlineMath();
      clearInlineMathSelectedClass(editorRoot);
      frame.classList.add('mda-cm-media-selected');
      root.classList.add('mda-cm-block-selected');
      setSelectedMermaidBlock({
        from: self.from,
        to: self.to,
        source: self.source,
        code: self.code,
      });
      try {
        if (view && self.from != null) {
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
    sourceEditor.addEventListener('paste', function (e) {
      e.preventDefault();
      const text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (text == null) return;
      document.execCommand('insertText', false, text);
    });
    sourceEditor.addEventListener('focus', function () {
      try {
        if (!view) return;
        const pos = view.state.selection.main.head;
        view.dispatch({ selection: { anchor: pos, head: pos } });
      } catch (_) {
        /* ignore */
      }
    });
    sourceEditor.addEventListener('blur', commitSourceEdit);

    root.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-mermaid-source-input')) return;
      // 顶栏空白/标签区点击也应选中块；仅工具按钮保留原行为
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-toolbar [data-action]')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-mermaid-handle-br')) return;
      if (isNearFrameResizeCorner(frame, e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      selectFrame();
    });

    frame.addEventListener('dblclick', function (e) {
      if (showingSource) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-toolbar')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) return;
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

    attachBlockDragHandle(
      frame,
      view,
      { from: self.from, to: self.to, source: self.source },
      {
        blockRoot: root,
        blockSelector: '.mda-cm-mermaid-block',
        replaceOnHover: false,
        blockKind: 'mermaid',
        blockMenuHandlers: opts.blockMenuHandlers,
        t: t,
        onMoveBlock: opts.onMoveMermaidBlock,
      }
    );

    const persisted = getSelectedMermaidBlock();
    if (
      persisted &&
      persisted.from === self.from &&
      persisted.to === self.to &&
      persisted.source === self.source
    ) {
      frame.classList.add('mda-cm-media-selected');
      root.classList.add('mda-cm-block-selected');
    }

    if (typeof opts.renderMermaid === 'function') {
      Promise.resolve(opts.renderMermaid(self.code, stage))
        .then(function () {
          applyMermaidDisplayConstraints(stage, opts);
          // 须先写入实测高度再 requestMeasure；否则 estimatedHeight 仍是加载态缓存，高度图卡住
          requestAnimationFrame(function () {
            syncWidgetHeightFromDom(self, view, root);
          });
        })
        .catch(function () {
          stage.textContent = uiT('mermaidFail', t, { error: '' });
          stage.classList.add('mda-mermaid-error');
          requestAnimationFrame(function () {
            syncWidgetHeightFromDom(self, view, root);
          });
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

'use strict';

const cmView = require('@codemirror/view');
const WidgetType = cmView.WidgetType;
const katex = require('katex');
const { parseMathBlock } = require('../model/parse-math');
const {
  createBlockToolbar,
  copyText,
  uiT,
  clearMediaSelection,
  clearBlockWidgetSelection,
} = require('./widget-common');
const { BlockReplaceWidget, syncWidgetHeightFromDom } = require('./block-widget-base');
const { setSelectedMathBlock } = require('./math-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedMermaidBlock } = require('./mermaid-selection');
const { attachBlockDragHandle } = require('./block-drag-handle');
const { Transaction } = require('@codemirror/state');

const MAX_MATH_WIDGET_HEIGHT = 480;
const TOOLBAR_H = 36;
const DISPLAY_PAD = 28;

/**
 * @param {string} tex
 */
function estimateMathBlockHeight(tex) {
  const lines = Math.max(1, String(tex || '').split('\n').length);
  // 顶栏 + 内边距 + KaTeX 显示行（多行 aligned/矩阵略高）
  const body = Math.min(lines, 12) * 32 + (lines > 1 ? 16 : 0);
  return Math.min(TOOLBAR_H + DISPLAY_PAD + body, MAX_MATH_WIDGET_HEIGHT);
}

/**
 * @param {string} tex
 * @param {boolean} displayMode
 */
function renderKatexHtml(tex, displayMode) {
  try {
    return katex.renderToString(String(tex || ''), {
      displayMode: !!displayMode,
      throwOnError: false,
      trust: false,
      output: 'html',
    });
  } catch (_) {
    return (
      '<span class="mda-cm-math-error">' +
      String(tex || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;') +
      '</span>'
    );
  }
}

class InlineMathWidget extends WidgetType {
  /**
   * @param {string} source
   * @param {string} tex
   */
  constructor(source, tex) {
    super();
    this.source = source || '';
    this.tex = tex || '';
  }
  eq(other) {
    return other instanceof InlineMathWidget && other.source === this.source;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'mda-cm-math-inline katex-inline-wrap';
    el.setAttribute('contenteditable', 'false');
    el.innerHTML = renderKatexHtml(this.tex, false);
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

class BlockMathWidget extends BlockReplaceWidget {
  /**
   * @param {string} source
   * @param {object} [opts]
   */
  constructor(source, opts) {
    super(source, Object.assign({ heightKind: 'math-block' }, opts || {}));
    this.opts = opts || {};
    const parsed = parseMathBlock(this.source);
    this.tex = parsed ? parsed.tex : this.source;
    this._maxMeasuredHeight = MAX_MATH_WIDGET_HEIGHT;
    this._minHeight = estimateMathBlockHeight(this.tex);
  }
  get estimatedHeight() {
    if (this._dom && this._dom.isConnected) {
      return Math.min(super.estimatedHeight, MAX_MATH_WIDGET_HEIGHT);
    }
    if (this._measured > 0) {
      return Math.min(this._measured, MAX_MATH_WIDGET_HEIGHT);
    }
    return estimateMathBlockHeight(this.tex);
  }
  eq(other) {
    return (
      other instanceof BlockMathWidget &&
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
    root.className = 'mda-cm-math-block mda-cm-math-block-line';
    root.setAttribute('contenteditable', 'false');
    if (self.from != null) root.setAttribute('data-mda-block-from', String(self.from));
    if (self.to != null) root.setAttribute('data-mda-block-to', String(self.to));
    if (self.source) root.setAttribute('data-mda-block-source', self.source);

    const frame = document.createElement('div');
    frame.className = 'mda-cm-math-frame mda-cm-media-block';

    const toolbar = createBlockToolbar(frame, {
      t: t,
      labelKey: 'widgetMathLabel',
      buttons: [
        { id: 'copy-image', i18nKey: 'zoomCopyImage' },
        { id: 'copy', i18nKey: 'widgetMathCopyTex' },
        { id: 'source', i18nKey: 'widgetCodeSource', i18nToggle: 'math-source' },
      ],
    });

    const display = document.createElement('div');
    display.className = 'mda-cm-math-display katex-block-wrap';
    display.innerHTML = renderKatexHtml(self.tex, true);
    frame.appendChild(display);

    const sourcePanel = document.createElement('div');
    sourcePanel.className = 'mda-cm-math-source';
    const sourceEditor = document.createElement('div');
    sourceEditor.className = 'mda-cm-math-source-input';
    sourceEditor.setAttribute('contenteditable', 'true');
    sourceEditor.setAttribute('role', 'textbox');
    sourceEditor.setAttribute('aria-multiline', 'true');
    sourceEditor.setAttribute('spellcheck', 'false');
    sourceEditor.setAttribute('data-i18n-aria', 'widgetMathEdit');
    sourceEditor.setAttribute('aria-label', uiT('widgetMathEdit', t));
    sourceEditor.textContent = self.tex;
    sourcePanel.appendChild(sourceEditor);
    frame.appendChild(sourcePanel);

    let showingSource = false;
    const sourceBtn = toolbar.querySelector('[data-action="source"]');

    function readSourceText() {
      return (sourceEditor.innerText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    function requestHeightMeasure() {
      syncWidgetHeightFromDom(self, view, root);
    }

    function selectBlock() {
      const editorRoot = root.closest('.cm-editor');
      clearMediaSelection(editorRoot, 'mda-cm-media-selected');
      clearBlockWidgetSelection(editorRoot || document);
      clearSelectedImageBlock();
      clearSelectedMermaidBlock();
      frame.classList.add('mda-cm-media-selected');
      root.classList.add('mda-cm-block-selected');
      setSelectedMathBlock({
        from: self.from,
        to: self.to,
        source: self.source,
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

    function commitSourceEdit() {
      const next = readSourceText();
      if (next === self.tex) return;
      if (typeof opts.onEditMathBlock === 'function') {
        opts.onEditMathBlock({
          from: self.from,
          to: self.to,
          tex: next,
          source: self.source,
        });
      }
    }

    function setSourceMode(on) {
      if (!on && showingSource) commitSourceEdit();
      showingSource = !!on;
      frame.classList.toggle('mda-cm-math-source-mode', showingSource);
      if (sourceBtn) {
        sourceBtn.classList.toggle('mda-cm-tb-active', showingSource);
        if (sourceBtn.getAttribute('data-i18n-toggle') === 'math-source') {
          const key = showingSource ? 'widgetCodePreview' : 'widgetCodeSource';
          sourceBtn.setAttribute('data-i18n-key', key);
          const label = uiT(key, t);
          sourceBtn.textContent = label;
          sourceBtn.title = label;
        }
      }
      if (showingSource) {
        sourceEditor.textContent = self.tex;
        requestAnimationFrame(function () {
          sourceEditor.focus();
        });
      } else {
        display.innerHTML = renderKatexHtml(self.tex, true);
      }
      requestHeightMeasure();
    }

    toolbar.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      if (action === 'copy-image') {
        // 源码态下用当前输入重渲一次，再走离屏导出
        if (showingSource) {
          display.innerHTML = renderKatexHtml(readSourceText(), true);
        }
        if (typeof opts.onCopyMathImage === 'function') {
          opts.onCopyMathImage(display);
        }
        return;
      }
      if (action === 'copy') {
        copyText(showingSource ? readSourceText() : self.tex, opts.copyText);
        return;
      }
      if (action === 'source') {
        setSourceMode(!showingSource);
        if (!showingSource) selectBlock();
      }
    });

    sourceEditor.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });

    sourceEditor.addEventListener('blur', commitSourceEdit);

    sourceEditor.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSourceMode(false);
        selectBlock();
      }
    });

    frame.addEventListener('dblclick', function (e) {
      if (e.target.closest('.mda-cm-block-toolbar')) return;
      if (e.target.closest('.mda-cm-math-source-input')) return;
      e.preventDefault();
      e.stopPropagation();
      selectBlock();
      setSourceMode(true);
    });

    root.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-math-source-input')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-toolbar [data-action]')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      selectBlock();
    });

    attachBlockDragHandle(
      frame,
      view,
      { from: self.from, to: self.to, source: self.source },
      {
        blockRoot: root,
        blockSelector: '.mda-cm-math-block',
        replaceOnHover: false,
        blockKind: 'math',
        blockMenuHandlers: opts.blockMenuHandlers,
        t: t,
        onMoveBlock: opts.onMoveMathBlock,
      }
    );

    root.appendChild(frame);
    this.bindMeasure(view, root);
    // 首帧后强制重测：KaTeX 布局常晚于首次 estimatedHeight
    requestAnimationFrame(function () {
      requestHeightMeasure();
    });
    return root;
  }
}

module.exports = {
  InlineMathWidget: InlineMathWidget,
  BlockMathWidget: BlockMathWidget,
  renderKatexHtml: renderKatexHtml,
  estimateMathBlockHeight: estimateMathBlockHeight,
};

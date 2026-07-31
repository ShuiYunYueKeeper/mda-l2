'use strict';

const { parseFencedCode } = require('../model/parse-fence');
const {
  createBlockToolbar,
  copyText,
  uiT,
  clearMediaSelection,
  clearBlockWidgetSelection,
} = require('./widget-common');
const { BlockReplaceWidget, countSourceLines } = require('./block-widget-base');
const { attachBlockDragHandle } = require('./block-drag-handle');

/**
 * @param {string} code
 * @param {string} lang
 * @param {(code: string, lang?: string) => string} [highlightCode]
 */
function highlightFenceBody(code, lang, highlightCode) {
  if (typeof highlightCode === 'function') {
    try {
      const highlighted = highlightCode(code, lang);
      if (highlighted) return highlighted;
    } catch (_) {
      /* fall through */
    }
  }
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

class CodeFenceWidget extends BlockReplaceWidget {
  /**
   * @param {string} source
   * @param {{ renderMarkdown?: Function, highlightCode?: Function, t?: Function, copyText?: Function, onSwitchSource?: Function, blockMenuHandlers?: object, from?: number, to?: number, lineHeight?: number }} [opts]
   */
  constructor(source, opts) {
    super(source, opts);
    this.opts = opts || {};
    const parsed = parseFencedCode(this.source);
    this.lang = parsed ? parsed.lang : '';
    this.code = parsed ? parsed.code : this.source;
    const codeLines = countSourceLines(this.code);
    this._minHeight = Math.max(codeLines * 21 + 48, this._lineCount * this._lineHeight);
  }
  eq(other) {
    return (
      other instanceof CodeFenceWidget &&
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
    root.className = 'mda-cm-code-block';
    root.setAttribute('contenteditable', 'false');
    if (self.from != null) root.setAttribute('data-mda-block-from', String(self.from));
    if (self.to != null) root.setAttribute('data-mda-block-to', String(self.to));
    if (self.source) root.setAttribute('data-mda-block-source', self.source);

    attachBlockDragHandle(
      root,
      view,
      { from: self.from, to: self.to, source: self.source },
      {
        blockRoot: root,
        blockSelector: '.mda-cm-code-block',
        replaceOnHover: false,
        blockKind: 'code',
        blockMenuHandlers: opts.blockMenuHandlers,
        t: t,
      }
    );

    const toolbarSpec = {
      t: t,
      buttons: [
        { id: 'copy', i18nKey: 'copyBtn' },
        { id: 'source', i18nKey: 'widgetCodeSource' },
      ],
    };
    if (this.lang) toolbarSpec.label = this.lang;
    else toolbarSpec.labelKey = 'widgetCodeLangPlain';
    const toolbar = createBlockToolbar(root, toolbarSpec);

    const body = document.createElement('pre');
    body.className = 'mda-cm-code-body';
    const codeEl = document.createElement('code');
    codeEl.className = 'hljs language-' + (this.lang || 'plaintext');
    codeEl.innerHTML = highlightFenceBody(this.code, this.lang, opts.highlightCode);
    body.appendChild(codeEl);
    root.appendChild(body);

    function selectBlock() {
      const editorRoot = root.closest('.cm-editor');
      clearMediaSelection(editorRoot, 'mda-cm-media-selected');
      clearBlockWidgetSelection(editorRoot || document);
      root.classList.add('mda-cm-block-selected');
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
      if (action === 'copy') {
        copyText(self.source, opts.copyText);
      } else if (action === 'source' && typeof opts.onSwitchSource === 'function') {
        opts.onSwitchSource({ from: self.from, to: self.to, kind: 'code' });
      }
    });

    root.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-toolbar')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      selectBlock();
    });

    this.bindMeasure(view, root);
    return root;
  }
}

module.exports = {
  CodeFenceWidget: CodeFenceWidget,
  highlightFenceBody: highlightFenceBody,
};

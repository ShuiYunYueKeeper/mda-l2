'use strict';

const { parseFencedCode } = require('../model/parse-fence');
const { createBlockToolbar, copyText, uiT } = require('./widget-common');
const { BlockReplaceWidget, countSourceLines } = require('./block-widget-base');

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
   * @param {{ renderMarkdown?: Function, highlightCode?: Function, t?: Function, copyText?: Function, onSwitchSource?: Function, from?: number, to?: number, lineHeight?: number }} [opts]
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
    return other instanceof CodeFenceWidget && other.source === this.source;
  }
  toDOM(view) {
    const opts = this.opts;
    const t = opts.t;
    const root = document.createElement('div');
    root.className = 'mda-cm-code-block';
    root.setAttribute('contenteditable', 'false');

    const toolbar = createBlockToolbar(root, {
      label: this.lang || uiT('widgetCodeLangPlain', t),
      buttons: [
        { id: 'copy', label: uiT('copyBtn', t), title: uiT('copyBtn', t) },
        { id: 'source', label: uiT('widgetCodeSource', t), title: uiT('widgetCodeSource', t) },
      ],
    });

    const body = document.createElement('pre');
    body.className = 'mda-cm-code-body';
    const codeEl = document.createElement('code');
    codeEl.className = 'hljs language-' + (this.lang || 'plaintext');
    codeEl.innerHTML = highlightFenceBody(this.code, this.lang, opts.highlightCode);
    body.appendChild(codeEl);
    root.appendChild(body);

    toolbar.addEventListener('click', function (e) {
      const btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      if (action === 'copy') {
        copyText(this.code, opts.copyText);
      } else if (action === 'source' && typeof opts.onSwitchSource === 'function') {
        opts.onSwitchSource({ from: this.from, to: this.to, kind: 'code' });
      }
    }.bind(this));

    this.bindMeasure(view, root);
    return root;
  }
}

module.exports = {
  CodeFenceWidget: CodeFenceWidget,
  highlightFenceBody: highlightFenceBody,
};

/**
 * 围栏代码块 widget：单层 contenteditable + 输入时重绘 hljs（避免透明叠层在 Electron 丢光标/选区字）。
 */
'use strict';

const { parseFencedCode, extractFenceCodeBody } = require('../model/parse-fence');
const {
  createBlockToolbar,
  copyText,
  uiT,
  clearMediaSelection,
  clearBlockWidgetSelection,
} = require('./widget-common');
const { BlockReplaceWidget, countSourceLines, syncWidgetHeightFromDom } = require('./block-widget-base');
const { createCodeLangPicker } = require('./code-lang-picker');
const { normalizeCodeBlockLang } = require('./code-languages');
const { attachBlockDragHandle } = require('./block-drag-handle');
const { setSelectedCodeBlock } = require('./code-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedMermaidBlock } = require('./mermaid-selection');
const { clearSelectedInlineMath, clearInlineMathSelectedClass } = require('./inline-math-selection');
const { Transaction } = require('@codemirror/state');

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

/**
 * @param {HTMLElement} root
 * @param {HTMLElement} frame
 * @param {object} opts
 * @param {import('@codemirror/view').EditorView} view
 * @param {() => void} [onSized]
 */
function attachCodeBlockLayout(root, frame, opts, view, onSized) {
  function sync() {
    if (typeof opts.onScaleCodeBlock === 'function') {
      opts.onScaleCodeBlock({ root: root, frame: frame });
    }
    if (typeof onSized === 'function') onSized();
  }
  sync();
  requestAnimationFrame(sync);
  let content = root.isConnected ? root.closest('.cm-content') : null;
  if (!content && view && view.dom) content = view.dom.querySelector('.cm-content');
  if (content && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(sync);
    ro.observe(content);
    root._mdaCodeWidthRo = ro;
  }
}

/**
 * @param {string} code
 */
function buildLineNumbers(code) {
  const n = Math.max(1, countSourceLines(code));
  const lines = [];
  for (let i = 1; i <= n; i++) lines.push(String(i));
  return lines.join('\n');
}

/**
 * 当前选区起点在 el 内的字符偏移（UTF-16 / DOM 文本）。
 * @param {HTMLElement} el
 */
function caretOffsetIn(el) {
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/**
 * @param {HTMLElement} el
 * @param {number} offset
 */
function setCaretOffsetIn(el, offset) {
  let remaining = Math.max(0, offset | 0);
  const sel = window.getSelection && window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue ? node.nodeValue.length : 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

const CODE_LINE_HEIGHT = 21;
const CODE_CHROME_HEIGHT = 84;
const MAX_CODE_WIDGET_LINES = 400;
const MAX_CODE_WIDGET_HEIGHT = 12000;

/**
 * @param {string} code
 */
function estimateCodeFenceHeight(code) {
  const n = Math.min(Math.max(1, countSourceLines(code)), MAX_CODE_WIDGET_LINES);
  return Math.min(n * CODE_LINE_HEIGHT + CODE_CHROME_HEIGHT, MAX_CODE_WIDGET_HEIGHT);
}

class CodeFenceWidget extends BlockReplaceWidget {
  /**
   * @param {string} source
   * @param {object} [opts]
   */
  constructor(source, opts) {
    super(source, Object.assign({ heightKind: 'code' }, opts || {}));
    this.opts = opts || {};
    const parsed = parseFencedCode(this.source);
    this.lang = parsed ? normalizeCodeBlockLang(parsed.lang) : '';
    this.code = parsed ? parsed.code : extractFenceCodeBody(this.source);
    this.marker = parsed && parsed.marker ? parsed.marker : '```';
    this._maxMeasuredHeight = MAX_CODE_WIDGET_HEIGHT;
    this._minHeight = estimateCodeFenceHeight(this.code);
  }
  get estimatedHeight() {
    if (this._dom && this._dom.isConnected) {
      return Math.min(super.estimatedHeight, MAX_CODE_WIDGET_HEIGHT);
    }
    if (this._measured > 0) {
      return Math.min(this._measured, MAX_CODE_WIDGET_HEIGHT);
    }
    return estimateCodeFenceHeight(this.code);
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
    root.className = 'mda-cm-code-block mda-cm-code-block-line';
    root.setAttribute('contenteditable', 'false');
    if (self.from != null) root.setAttribute('data-mda-block-from', String(self.from));
    if (self.to != null) root.setAttribute('data-mda-block-to', String(self.to));
    if (self.source) root.setAttribute('data-mda-block-source', self.source);

    const frame = document.createElement('div');
    frame.className = 'mda-cm-code-frame mda-cm-media-block';

    const toolbar = createBlockToolbar(frame, {
      t: t,
      buttons: [{ id: 'copy', i18nKey: 'copyBtn' }],
    });

    const previewPanel = document.createElement('div');
    previewPanel.className = 'mda-cm-code-preview';
    const stage = document.createElement('div');
    stage.className = 'mda-cm-code-stage';

    const gutter = document.createElement('div');
    gutter.className = 'mda-cm-code-gutter';
    gutter.setAttribute('aria-hidden', 'true');
    gutter.textContent = buildLineNumbers(self.code);

    const scroll = document.createElement('div');
    scroll.className = 'mda-cm-code-scroll';
    const stack = document.createElement('div');
    stack.className = 'mda-cm-code-stack';

    const highlightPre = document.createElement('pre');
    highlightPre.className = 'mda-cm-code-highlight';

    const codeInput = document.createElement('code');
    codeInput.className = 'mda-cm-code-input hljs language-' + (self.lang || 'plaintext');
    codeInput.setAttribute('contenteditable', 'true');
    codeInput.setAttribute('role', 'textbox');
    codeInput.setAttribute('aria-multiline', 'true');
    codeInput.setAttribute('spellcheck', 'false');
    codeInput.setAttribute('data-i18n-aria', 'widgetCodeEdit');
    codeInput.setAttribute('aria-label', uiT('widgetCodeEdit', t));

    highlightPre.appendChild(codeInput);
    stack.appendChild(highlightPre);
    scroll.appendChild(stack);
    stage.appendChild(gutter);
    stage.appendChild(scroll);
    previewPanel.appendChild(stage);
    frame.appendChild(previewPanel);

    let composing = false;
    let plainEditing = false;

    function readCodeText() {
      return (codeInput.innerText || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\u00a0/g, ' ');
    }

    function paintHighlight(restoreCaret) {
      const text = readCodeText();
      const pos = restoreCaret ? caretOffsetIn(codeInput) : 0;
      const html = highlightFenceBody(text, self.lang, opts.highlightCode);
      codeInput.innerHTML = html || '\n';
      if (restoreCaret) setCaretOffsetIn(codeInput, Math.min(pos, text.length));
    }

    /**
     * Electron 对 hljs 嵌套 span 的 ::selection 会回落系统深蓝。
     * 聚焦编辑时压成单一文本节点，选区浅蓝色才能生效；失焦再上色。
     */
    function flattenToPlain() {
      if (plainEditing) return;
      const text = readCodeText();
      const pos = caretOffsetIn(codeInput);
      codeInput.textContent = text;
      setCaretOffsetIn(codeInput, Math.min(pos, text.length));
      plainEditing = true;
    }

    function syncLineNumbers() {
      gutter.textContent = buildLineNumbers(readCodeText());
    }

    function enterEditMode() {
      frame.classList.add('mda-cm-code-editing');
    }

    // 初始：用源码直接上色（勿先 textContent 再读，避免多余换行）
    codeInput.textContent = self.code || '';
    paintHighlight(false);
    syncLineNumbers();

    function commitLangChange(nextLang) {
      const normalized = normalizeCodeBlockLang(nextLang);
      if (normalized === self.lang) return;
      const code = readCodeText();
      self.lang = normalized;
      codeInput.className = 'mda-cm-code-input hljs language-' + (self.lang || 'plaintext');
      if (!plainEditing) paintHighlight(true);
      if (typeof opts.onEditCodeBlock === 'function') {
        opts.onEditCodeBlock({
          from: self.from,
          to: self.to,
          source: self.source,
          lang: self.lang,
          code: code,
          marker: self.marker,
        });
      }
    }

    const langPicker = createCodeLangPicker({
      lang: self.lang,
      t: t,
      onChange: commitLangChange,
    });
    toolbar.insertBefore(langPicker, toolbar.firstChild);

    function commitCodeEdit() {
      const next = readCodeText();
      syncLineNumbers();
      if (next === self.code) return;
      if (typeof opts.onEditCodeBlock === 'function') {
        opts.onEditCodeBlock({
          from: self.from,
          to: self.to,
          source: self.source,
          lang: self.lang,
          code: next,
          marker: self.marker,
        });
      }
    }

    function requestHeightMeasure() {
      try {
        if (view) view.requestMeasure();
      } catch (_) {
        /* ignore */
      }
    }

    function selectBlock() {
      const editorRoot = root.closest('.cm-editor');
      clearMediaSelection(editorRoot, 'mda-cm-media-selected');
      clearBlockWidgetSelection(editorRoot || document);
      clearSelectedImageBlock();
      clearSelectedMermaidBlock();
      clearSelectedInlineMath();
      clearInlineMathSelectedClass(editorRoot);
      frame.classList.add('mda-cm-media-selected');
      root.classList.add('mda-cm-block-selected');
      setSelectedCodeBlock({
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

    attachBlockDragHandle(
      frame,
      view,
      { from: self.from, to: self.to, source: self.source },
      {
        blockRoot: root,
        blockSelector: '.mda-cm-code-block',
        replaceOnHover: false,
        blockKind: 'code',
        blockMenuHandlers: opts.blockMenuHandlers,
        t: t,
        onMoveBlock: opts.onMoveCodeBlock,
      }
    );

    toolbar.addEventListener('click', function (e) {
      const btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      if (action === 'copy') {
        copyText(self.source, opts.copyText);
      }
    });

    codeInput.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      enterEditMode();
    });
    codeInput.addEventListener('compositionstart', function () {
      composing = true;
    });
    codeInput.addEventListener('compositionend', function () {
      composing = false;
      syncLineNumbers();
      requestHeightMeasure();
    });
    codeInput.addEventListener('input', function () {
      if (composing) return;
      // 编辑中保持纯文本，勿重绘 hljs（否则 ::selection 再次失效）
      syncLineNumbers();
      requestHeightMeasure();
    });
    codeInput.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      document.execCommand('insertText', false, '\n');
    });
    codeInput.addEventListener('paste', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (text == null) return;
      document.execCommand('insertText', false, text);
    });
    codeInput.addEventListener('focus', function () {
      enterEditMode();
      // 等点击落点落稳后再压平，保留光标位置
      requestAnimationFrame(function () {
        flattenToPlain();
      });
    });
    codeInput.addEventListener('blur', function () {
      commitCodeEdit();
      plainEditing = false;
      paintHighlight(false);
      syncLineNumbers();
      frame.classList.remove('mda-cm-code-editing');
      requestHeightMeasure();
      try {
        if (view) {
          requestAnimationFrame(function () {
            syncWidgetHeightFromDom(self, view, root);
          });
        }
      } catch (_) {
        /* ignore */
      }
    });

    scroll.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.stopPropagation();
    });

    root.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-code-input')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-code-scroll')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-toolbar [data-action]')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-code-lang-picker')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      selectBlock();
    });

    root.appendChild(frame);
    attachCodeBlockLayout(root, frame, opts, view, requestHeightMeasure);
    this.bindMeasure(view, root);
    return root;
  }
  destroy(dom) {
    if (dom && dom._mdaCodeWidthRo) {
      dom._mdaCodeWidthRo.disconnect();
      dom._mdaCodeWidthRo = null;
    }
    super.destroy(dom);
  }
}

module.exports = {
  CodeFenceWidget: CodeFenceWidget,
  highlightFenceBody: highlightFenceBody,
  buildLineNumbers: buildLineNumbers,
  estimateCodeFenceHeight: estimateCodeFenceHeight,
  MAX_CODE_WIDGET_HEIGHT: MAX_CODE_WIDGET_HEIGHT,
  caretOffsetIn: caretOffsetIn,
  setCaretOffsetIn: setCaretOffsetIn,
};

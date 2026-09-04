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
const { attachWidgetEditablePointerIsolation } = require('../widget-editable-guard');
const { isWidgetDomMenuGuard } = require('../widget-context-menu-guard');
const { normalizeCodeBlockLang } = require('./code-languages');
const { attachBlockDragHandle } = require('./block-drag-handle');
const { setSelectedCodeBlock } = require('./code-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedMermaidBlock } = require('./mermaid-selection');
const { clearSelectedInlineMath, clearInlineMathSelectedClass } = require('./inline-math-selection');
const { Transaction } = require('@codemirror/state');

/** @type {{ from: number, caret: number } | null} */
let codeEditResume = null;

/** @type {{ undo: () => boolean, redo: () => boolean } | null} */
let activeCodeEditSession = null;

/**
 * @returns {boolean}
 */
function tryCodeBlockUndo() {
  return !!(activeCodeEditSession && activeCodeEditSession.undo());
}

/**
 * @returns {boolean}
 */
function tryCodeBlockRedo() {
  return !!(activeCodeEditSession && activeCodeEditSession.redo());
}

/**
 * @param {number} from
 * @param {number} caret
 */
function stashCodeEditResume(from, caret) {
  codeEditResume = { from: from, caret: caret };
}

/**
 * @param {number} from
 * @returns {{ caret: number } | null}
 */
function takeCodeEditResume(from) {
  if (!codeEditResume || codeEditResume.from !== from) return null;
  const s = codeEditResume;
  codeEditResume = null;
  return s;
}

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

/** 空行占位：contenteditable 吞尾部换行，须用 <br>+ZWSP 保留可视行 */
const CODE_PLAIN_ZWSP = '\u200b';

/**
 * @param {string | null | undefined} text
 */
function logicalTextLength(text) {
  return String(text || '')
    .replace(/\u200b/g, '')
    .replace(/\u00a0/g, ' ')
    .length;
}

/**
 * @param {Node} root
 */
function plainDomLogicalLength(root) {
  let len = 0;
  /** @param {Node} node */
  function walk(node) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        len += logicalTextLength(child.nodeValue);
      } else if (child.nodeName === 'BR') {
        len += 1;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  }
  walk(root);
  return len;
}

/**
 * 将代码写入 contenteditable（每行 <br> 分隔，空行用 ZWSP 撑高）。
 * @param {HTMLElement} el
 * @param {string} code
 */
function setPlainCodeDom(el, code) {
  while (el.firstChild) el.removeChild(el.firstChild);
  const normalized = String(code || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized === '') {
    el.appendChild(document.createTextNode(CODE_PLAIN_ZWSP));
    return;
  }
  const lines = normalized.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) el.appendChild(document.createElement('br'));
    const line = lines[i];
    if (line.length > 0) {
      el.appendChild(document.createTextNode(line));
    } else {
      el.appendChild(document.createTextNode(CODE_PLAIN_ZWSP));
    }
  }
}

/**
 * 从 <br> 结构的 contenteditable 读回代码（与 setPlainCodeDom 对偶）。
 * @param {HTMLElement} el
 */
function readPlainCodeDom(el) {
  let out = '';
  /** @param {Node} node */
  function walk(node) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child.nodeValue || '').replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
      } else if (child.nodeName === 'BR') {
        out += '\n';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  }
  walk(el);
  return out;
}

/**
 * @param {HTMLElement} el
 */
function caretOffsetInPlain(el) {
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return plainDomLogicalLength(pre.cloneContents());
}

/**
 * @param {HTMLElement} el
 * @param {number} offset
 */
function setCaretOffsetInPlain(el, offset) {
  let remaining = Math.max(0, offset | 0);
  const sel = window.getSelection && window.getSelection();
  if (!sel) return;

  /** @param {Node} node @param {number} domOff */
  function place(node, domOff) {
    const range = document.createRange();
    range.setStart(node, domOff);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * @param {Node} node
   * @returns {boolean}
   */
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.nodeValue || '';
      const logical = logicalTextLength(raw);
      if (remaining <= logical) {
        let logicalSeen = 0;
        let domOff = 0;
        for (let i = 0; i < raw.length; i++) {
          if (raw.charAt(i) === CODE_PLAIN_ZWSP) continue;
          if (logicalSeen === remaining) {
            place(node, domOff);
            return true;
          }
          logicalSeen += 1;
          domOff = i + 1;
        }
        place(node, raw.length);
        return true;
      }
      remaining -= logical;
      return false;
    }
    if (node.nodeName === 'BR') {
      if (remaining === 0) {
        const parent = node.parentNode;
        if (parent) place(parent, Array.prototype.indexOf.call(parent.childNodes, node));
        return true;
      }
      if (remaining === 1) {
        const next = node.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) place(next, 0);
        else {
          const parent = node.parentNode;
          if (parent) {
            place(parent, Array.prototype.indexOf.call(parent.childNodes, node) + 1);
          }
        }
        return true;
      }
      remaining -= 1;
      return false;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (walk(child)) return true;
    }
    return false;
  }

  if (!walk(el)) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * hljs HTML 不保留尾部换行的可视行，补 <br>。
 * @param {string} html
 * @param {string} code
 */
function highlightHtmlWithTrailingLines(html, code) {
  const m = /\n+$/.exec(String(code || ''));
  if (!m) return html || '';
  let out = html || '';
  for (let i = 0; i < m[0].length; i++) out += '<br>';
  return out;
}

/**
 * 当前选区起点在 el 内的字符偏移（UTF-16 / DOM 文本）。
 * @param {HTMLElement} el
 */
function caretOffsetIn(el) {
  if (el.querySelector && el.querySelector('br')) return caretOffsetInPlain(el);
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
 * 在 contenteditable 当前选区插入纯文本（比 execCommand 在 Electron 内更可靠）。
 * @param {HTMLElement} el
 * @param {string} text
 */
function insertTextAtCaret(el, text) {
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * @param {HTMLElement} el
 * @param {Node} container
 * @param {number} offset
 */
function logicalOffsetFromPoint(el, container, offset) {
  const probe = document.createRange();
  probe.setStart(container, offset);
  probe.collapse(true);
  if (!el.contains(probe.startContainer)) return 0;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(probe.startContainer, probe.startOffset);
  if (el.querySelector && el.querySelector('br')) {
    return plainDomLogicalLength(pre.cloneContents());
  }
  return pre.toString().replace(/\u200b/g, '').replace(/\u00a0/g, ' ').length;
}

/**
 * @param {HTMLElement} el
 * @returns {{ start: number, end: number } | null}
 */
function getLogicalSelectionOffsets(el) {
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return null;
  const a = logicalOffsetFromPoint(el, range.startContainer, range.startOffset);
  const b = logicalOffsetFromPoint(el, range.endContainer, range.endOffset);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (end <= start) return null;
  return { start: start, end: end };
}

/**
 * @param {HTMLElement} el
 * @param {number} clientX
 * @param {number} clientY
 */
function caretOffsetFromClient(el, clientX, clientY) {
  let probe = null;
  if (typeof document.caretRangeFromPoint === 'function') {
    probe = document.caretRangeFromPoint(clientX, clientY);
  } else if (typeof document.caretPositionFromPoint === 'function') {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      probe = document.createRange();
      probe.setStart(pos.offsetNode, pos.offset);
      probe.collapse(true);
    }
  }
  if (probe && el.contains(probe.startContainer)) {
    return logicalOffsetFromPoint(el, probe.startContainer, probe.startOffset);
  }
  return caretOffsetIn(el);
}

/**
 * @param {HTMLElement} el
 * @param {number} start
 * @param {number} end
 */
function setLogicalSelection(el, start, end) {
  const sel = window.getSelection && window.getSelection();
  if (!sel) return;
  const lo = Math.min(start | 0, end | 0);
  const hi = Math.max(start | 0, end | 0);
  if (hi <= lo) {
    setCaretOffsetIn(el, lo);
    return;
  }
  setCaretOffsetIn(el, lo);
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const endPoint = logicalOffsetToDomPoint(el, hi);
  if (!endPoint) return;
  try {
    range.setEnd(endPoint.node, endPoint.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {HTMLElement} el
 * @param {number} offset
 * @returns {{ node: Node, offset: number } | null}
 */
function logicalOffsetToDomPoint(el, offset) {
  let remaining = Math.max(0, offset | 0);
  /** @type {{ node: Node, offset: number } | null} */
  let last = null;

  /** @param {Node} node @returns {boolean} */
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.nodeValue || '';
      const logical = logicalTextLength(raw);
      if (remaining <= logical) {
        let logicalSeen = 0;
        let domOff = 0;
        for (let i = 0; i < raw.length; i++) {
          if (raw.charAt(i) === CODE_PLAIN_ZWSP) continue;
          if (logicalSeen === remaining) {
            last = { node: node, offset: domOff };
            return true;
          }
          logicalSeen += 1;
          domOff = i + 1;
        }
        last = { node: node, offset: raw.length };
        return true;
      }
      remaining -= logical;
      last = { node: node, offset: raw.length };
      return false;
    }
    if (node.nodeName === 'BR') {
      if (remaining === 0) {
        const parent = node.parentNode;
        if (parent) {
          last = { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, node) };
        }
        return true;
      }
      if (remaining === 1) {
        const next = node.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) last = { node: next, offset: 0 };
        else {
          const parent = node.parentNode;
          if (parent) {
            last = {
              node: parent,
              offset: Array.prototype.indexOf.call(parent.childNodes, node) + 1,
            };
          }
        }
        return true;
      }
      remaining -= 1;
      return false;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (walk(child)) return true;
    }
    return false;
  }

  if (el.querySelector && el.querySelector('br')) {
    walk(el);
    return last;
  }

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue ? node.nodeValue.length : 0;
    if (remaining <= len) {
      return { node: node, offset: remaining };
    }
    remaining -= len;
    last = { node: node, offset: len };
    node = walker.nextNode();
  }
  return last;
}

/**
 * @param {HTMLElement} el
 * @param {number} offset
 */
function setCaretOffsetIn(el, offset) {
  if (el.querySelector && el.querySelector('br')) {
    setCaretOffsetInPlain(el, offset);
    return;
  }
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

    attachWidgetEditablePointerIsolation(codeInput);

    highlightPre.appendChild(codeInput);
    stack.appendChild(highlightPre);
    scroll.appendChild(stack);
    stage.appendChild(gutter);
    stage.appendChild(scroll);
    previewPanel.appendChild(stage);
    frame.appendChild(previewPanel);

    let composing = false;
    let plainEditing = false;
    let applyingProgrammatic = false;
    /** @type {string} */
    let localCode = self.code || '';
    /** @type {string[]} */
    const undoStack = [];
    /** @type {string[]} */
    const redoStack = [];

    function readCodeText() {
      return localCode;
    }

    function readDomCodeText() {
      if (plainEditing || (codeInput.querySelector && codeInput.querySelector('br'))) {
        return readPlainCodeDom(codeInput);
      }
      return (codeInput.textContent || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\u00a0/g, ' ');
    }

    function getCaretOffset() {
      return plainEditing ? caretOffsetInPlain(codeInput) : caretOffsetIn(codeInput);
    }

    function setCaretOffset(off) {
      if (plainEditing) setCaretOffsetInPlain(codeInput, off);
      else setCaretOffsetIn(codeInput, off);
    }

    function paintHighlight(restoreCaret) {
      const text = localCode;
      const pos = restoreCaret ? getCaretOffset() : 0;
      applyingProgrammatic = true;
      try {
        const html = highlightHtmlWithTrailingLines(
          highlightFenceBody(text, self.lang, opts.highlightCode),
          text
        );
        codeInput.innerHTML = html || '\n';
        if (restoreCaret) setCaretOffset(Math.min(pos, text.length));
      } finally {
        applyingProgrammatic = false;
      }
    }

    function renderFromLocalCode(caretOffset) {
      applyingProgrammatic = true;
      try {
        if (plainEditing) {
          setPlainCodeDom(codeInput, localCode);
        } else {
          const html = highlightHtmlWithTrailingLines(
            highlightFenceBody(localCode, self.lang, opts.highlightCode),
            localCode
          );
          codeInput.innerHTML = html || '\n';
        }
        if (caretOffset != null) {
          setCaretOffset(Math.min(caretOffset, localCode.length));
        }
      } finally {
        applyingProgrammatic = false;
      }
      syncLineNumbers();
    }

    function pushUndoSnapshot() {
      undoStack.push(localCode);
      if (undoStack.length > 200) undoStack.shift();
      redoStack.length = 0;
    }

    function applyLocalCode(next, caret) {
      localCode = next;
      renderFromLocalCode(caret);
      self._minHeight = estimateCodeFenceHeight(localCode);
      requestHeightMeasure();
      syncWidgetHeightFromDom(self, view, root);
      markCodeDirty();
    }

    function spliceLocalCode(offset, insert, removeLen) {
      const off = Math.max(0, Math.min(offset | 0, localCode.length));
      const rm = removeLen == null ? 0 : Math.max(0, removeLen | 0);
      pushUndoSnapshot();
      const next =
        localCode.slice(0, off) + String(insert || '') + localCode.slice(off + rm);
      applyLocalCode(next, off + String(insert || '').length);
    }

    function undoLocal() {
      if (!undoStack.length) return false;
      redoStack.push(localCode);
      const prev = undoStack.pop();
      const caret = Math.min(getCaretOffset(), prev.length);
      applyLocalCode(prev, caret);
      return true;
    }

    function redoLocal() {
      if (!redoStack.length) return false;
      undoStack.push(localCode);
      const next = redoStack.pop();
      const caret = Math.min(getCaretOffset(), next.length);
      applyLocalCode(next, caret);
      return true;
    }

    let selectionAnchor = 0;

    /**
     * @param {{ start?: number, end?: number, caret?: number, clientX?: number, clientY?: number, preserveSelection?: boolean }} [opts]
     */
    function ensurePlainForEdit(opts) {
      opts = opts || {};
      let selOffsets = null;
      if (typeof opts.start === 'number' && typeof opts.end === 'number' && opts.end > opts.start) {
        selOffsets = { start: opts.start, end: opts.end };
      } else if (opts.preserveSelection) {
        selOffsets = getLogicalSelectionOffsets(codeInput);
      }
      let caret = typeof opts.caret === 'number' ? opts.caret : null;
      if (plainEditing) {
        if (selOffsets) setLogicalSelection(codeInput, selOffsets.start, selOffsets.end);
        else if (caret != null) setCaretOffset(caret);
        return;
      }
      if (!selOffsets && caret == null && typeof opts.clientX === 'number' && typeof opts.clientY === 'number') {
        caret = caretOffsetFromClient(codeInput, opts.clientX, opts.clientY);
      }
      if (caret == null && !selOffsets) caret = getCaretOffset();
      plainEditing = true;
      renderFromLocalCode(selOffsets ? selOffsets.start : caret);
      if (selOffsets) setLogicalSelection(codeInput, selOffsets.start, selOffsets.end);
      else if (caret != null) setCaretOffset(caret);
    }

    function flattenToPlain(opts) {
      ensurePlainForEdit(opts || {});
    }

    function stabilizeForContextMenu() {
      enterEditMode();
      const offsets = getLogicalSelectionOffsets(codeInput);
      if (!offsets) return;
      ensurePlainForEdit({ start: offsets.start, end: offsets.end });
    }

    function restoreLogicalSelection(start, end) {
      enterEditMode();
      if (!plainEditing) {
        plainEditing = true;
        renderFromLocalCode(start);
      }
      setLogicalSelection(codeInput, start, end);
    }

    root._mdaStabilizeCodeSelection = stabilizeForContextMenu;
    root._mdaRestoreLogicalSelection = restoreLogicalSelection;
    codeInput._mdaRestoreLogicalSelection = restoreLogicalSelection;
    codeInput._mdaLogicalOffsetFromPoint = function (container, offset) {
      return logicalOffsetFromPoint(codeInput, container, offset);
    };

    function syncLineNumbers() {
      gutter.textContent = buildLineNumbers(readCodeText());
    }

    function enterEditMode() {
      frame.classList.add('mda-cm-code-editing');
    }

    // 初始：用 localCode 上色（勿先 textContent 再读，避免多余换行）
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

    function markCodeDirty() {
      if (typeof opts.onCodeBlockDirty === 'function') {
        opts.onCodeBlockDirty({ dirty: localCode !== self.code });
      }
    }

    function syncCodeLayout() {
      syncLineNumbers();
      self._minHeight = estimateCodeFenceHeight(readCodeText());
      requestHeightMeasure();
      syncWidgetHeightFromDom(self, view, root);
    }

    function commitCodeEdit(keepCaret) {
      const next = readCodeText();
      syncCodeLayout();
      if (next === self.code) return;
      const caret = keepCaret ? getCaretOffset() : 0;
      if (keepCaret) stashCodeEditResume(self.from, caret);
      self.code = next;
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

    codeInput.addEventListener(
      'mousedown',
      function (e) {
        e.stopPropagation();
        if (e.button === 2) return;
        if (isWidgetDomMenuGuard()) return;
        enterEditMode();
        if (e.shiftKey) {
          const head = caretOffsetFromClient(codeInput, e.clientX, e.clientY);
          ensurePlainForEdit({ caret: selectionAnchor });
          setLogicalSelection(codeInput, selectionAnchor, head);
          e.preventDefault();
        }
      },
      true
    );
    codeInput.addEventListener(
      'mouseup',
      function (e) {
        if (e.button !== 0) return;
        if (isWidgetDomMenuGuard()) return;
        enterEditMode();
        if (e.shiftKey) return;
        const offsets = getLogicalSelectionOffsets(codeInput);
        if (offsets) {
          ensurePlainForEdit({ start: offsets.start, end: offsets.end });
          selectionAnchor = offsets.start;
        } else {
          const caret = caretOffsetFromClient(codeInput, e.clientX, e.clientY);
          ensurePlainForEdit({ caret: caret });
          selectionAnchor = caret;
        }
      },
      true
    );
    codeInput.addEventListener('beforeinput', function (e) {
      if (composing || applyingProgrammatic) return;
      if (e.inputType === 'historyUndo') {
        e.preventDefault();
        undoLocal();
        return;
      }
      if (e.inputType === 'historyRedo') {
        e.preventDefault();
        redoLocal();
        return;
      }
      if (e.inputType === 'insertFromPaste' || e.inputType === 'insertLineBreak') return;
      pushUndoSnapshot();
    });
    codeInput.addEventListener('compositionstart', function () {
      composing = true;
    });
    codeInput.addEventListener('compositionend', function () {
      composing = false;
      localCode = readDomCodeText();
      syncCodeLayout();
      markCodeDirty();
    });
    codeInput.addEventListener('input', function () {
      if (composing || applyingProgrammatic) return;
      localCode = readDomCodeText();
      syncCodeLayout();
      markCodeDirty();
    });
    codeInput.addEventListener('keydown', function (e) {
      e.stopPropagation();
      const mod = e.ctrlKey || e.metaKey;
      if (
        mod &&
        !e.altKey &&
        (e.key === 'b' ||
          e.key === 'B' ||
          e.key === 'i' ||
          e.key === 'I' ||
          e.key === '`' ||
          ((e.key === 'x' || e.key === 'X') && e.shiftKey))
      ) {
        e.preventDefault();
        return;
      }
      if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redoLocal();
        else undoLocal();
        return;
      }
      if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redoLocal();
        return;
      }
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      spliceLocalCode(getCaretOffset(), '\n', 0);
    });
    codeInput.addEventListener('paste', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (text == null) return;
      spliceLocalCode(getCaretOffset(), text, 0);
    });
    codeInput.addEventListener('focus', function () {
      enterEditMode();
      const session = { undo: undoLocal, redo: redoLocal };
      activeCodeEditSession = session;
      root._mdaCodeEditSession = session;
      if (plainEditing || isWidgetDomMenuGuard()) return;
      requestAnimationFrame(function () {
        if (isWidgetDomMenuGuard() || plainEditing) return;
        if (document.activeElement !== codeInput) return;
        const offsets = getLogicalSelectionOffsets(codeInput);
        if (offsets) ensurePlainForEdit({ start: offsets.start, end: offsets.end });
        else ensurePlainForEdit({ caret: getCaretOffset() });
      });
    });
    codeInput.addEventListener('blur', function () {
      requestAnimationFrame(function () {
        if (isWidgetDomMenuGuard()) return;
        if (document.querySelector('.mda-cm-context-menu')) return;
        if (activeCodeEditSession === root._mdaCodeEditSession) {
          activeCodeEditSession = null;
          root._mdaCodeEditSession = null;
        }
        if (root._mdaCodeTearingDown || !codeInput.isConnected) return;
        commitCodeEdit(false);
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

    const resumed = takeCodeEditResume(self.from);
    if (resumed) {
      requestAnimationFrame(function () {
        enterEditMode();
        flattenToPlain({});
        codeInput.focus();
        setCaretOffset(resumed.caret);
      });
    }

    return root;
  }
  destroy(dom) {
    if (dom) {
      dom._mdaStabilizeCodeSelection = null;
      dom._mdaRestoreLogicalSelection = null;
      const input = dom.querySelector('.mda-cm-code-input');
      if (input) {
        input._mdaRestoreLogicalSelection = null;
        input._mdaLogicalOffsetFromPoint = null;
      }
    }
    if (dom && dom._mdaCodeEditSession && activeCodeEditSession === dom._mdaCodeEditSession) {
      activeCodeEditSession = null;
    }
    if (dom) dom._mdaCodeTearingDown = true;
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
  insertTextAtCaret: insertTextAtCaret,
  caretOffsetIn: caretOffsetIn,
  setCaretOffsetIn: setCaretOffsetIn,
  readPlainCodeDom: readPlainCodeDom,
  setPlainCodeDom: setPlainCodeDom,
  highlightHtmlWithTrailingLines: highlightHtmlWithTrailingLines,
  tryCodeBlockUndo: tryCodeBlockUndo,
  tryCodeBlockRedo: tryCodeBlockRedo,
};

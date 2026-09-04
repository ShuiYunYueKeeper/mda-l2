/**
 * 表格单元格内行内公式 / 图片 / 强调语法：渲染 + Markdown 写回。
 */
'use strict';

const { parser: mdParser, GFM } = require('@lezer/markdown');
const { findMathRanges } = require('../model/parse-math');
const { findImageRanges, serializeImageMarkdown } = require('../model/parse-image');
const { collectSyntaxNodes } = require('../model/build-specs');
const { SYNTAX_RULES } = require('../model/syntax-rules');
const { renderKatexHtml } = require('./math');
const { resolveImagesIn } = require('./md-surface');
const assist = require('../../editor-assist');
const {
  markKeyForDelims,
  toggleInlineMarkInText,
  inlineStateInText,
} = require('../state/inline-string-ops');

const cellMdParser = mdParser.configure(GFM);

/** @type {Record<string, 1>} */
const CELL_SYNTAX_TYPES = {
  StrongEmphasis: 1,
  Emphasis: 1,
  Underline: 1,
  Strikethrough: 1,
  InlineCode: 1,
  Link: 1,
  Autolink: 1,
  URL: 1,
};

/**
 * @param {{ from: number, to: number }} a
 * @param {{ from: number, to: number }} b
 */
function rangesOverlap(a, b) {
  return a.from < b.to && a.to > b.from;
}

/**
 * @param {{ from: number, to: number }[]} ranges
 */
function pickNonOverlapping(ranges) {
  const sorted = ranges.slice().sort(function (a, b) {
    const la = a.to - a.from;
    const lb = b.to - b.from;
    return lb - la || a.from - b.from;
  });
  const picked = [];
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    let overlap = false;
    for (let j = 0; j < picked.length; j++) {
      if (rangesOverlap(r, picked[j])) {
        overlap = true;
        break;
      }
    }
    if (!overlap) picked.push(r);
  }
  return picked.sort(function (a, b) {
    return a.from - b.from;
  });
}

/**
 * @param {string} raw
 * @returns {{ kind: 'syntax', type: string, from: number, to: number }[]}
 */
function findSyntaxInlineRanges(raw) {
  const text = String(raw || '');
  if (!text) return [];
  const tree = cellMdParser.parse(text);
  const nodes = collectSyntaxNodes(tree, text);
  const syntax = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!CELL_SYNTAX_TYPES[n.type]) continue;
    syntax.push({ kind: 'syntax', type: n.type, from: n.from, to: n.to });
  }
  return pickNonOverlapping(syntax);
}

/**
 * 合并行内公式 / 图片 / 语法区间（公式优先，其次图片，再语法）。
 * @param {string} raw
 * @returns {{ kind: string, from: number, to: number, [key: string]: any }[]}
 */
function findCellInlineRanges(raw) {
  const text = String(raw || '');
  const math = findMathRanges(text).filter(function (r) {
    return r.kind === 'math-inline';
  });
  const images = findImageRanges(text).filter(function (img) {
    for (let i = 0; i < math.length; i++) {
      if (rangesOverlap(img, math[i])) return false;
    }
    return true;
  });
  const syntax = findSyntaxInlineRanges(text).filter(function (s) {
    for (let i = 0; i < math.length; i++) {
      if (rangesOverlap(s, math[i])) return false;
    }
    for (let j = 0; j < images.length; j++) {
      if (rangesOverlap(s, images[j])) return false;
    }
    return true;
  });
  return math.concat(images).concat(syntax).sort(function (a, b) {
    return a.from - b.from;
  });
}

/**
 * @param {string} text
 * @returns {string}
 */
function wrapInlineCode(text) {
  let fence = '`';
  while (String(text).indexOf(fence) >= 0) fence += '`';
  return fence + text + fence;
}

/**
 * @param {HTMLElement} el
 * @returns {string | null}
 */
function serializeInlineStyledElement(el) {
  if (!el || !el.getAttribute) return null;
  const text = el.textContent || '';
  const source = el.getAttribute('data-mda-inline-source');
  if (source) {
    // source 是渲染那一刻的源码快照。用户在样式段内改过字之后再原样吐回去，等于把这次
    // 编辑整个吞掉（`加粗` 改成 `加粗改了` 仍写回 `**加粗**`，删空则文字复活）。
    // 因此只有当可见文字与渲染时一致，才认这份快照。
    const rendered = el.getAttribute('data-mda-inline-text');
    if (rendered == null || rendered === text) return source;
  }
  if (!el.classList) return null;
  // 内容被删光时整对定界符一并丢弃，否则序列化出裸 `****`
  if (!text) {
    return el.classList.contains('mda-cm-strong') ||
      el.classList.contains('mda-cm-em') ||
      el.classList.contains('mda-cm-underline') ||
      el.classList.contains('mda-cm-strike') ||
      el.classList.contains('mda-cm-code') ||
      el.classList.contains('mda-cm-link')
      ? ''
      : null;
  }
  if (el.classList.contains('mda-cm-strong')) return '**' + text + '**';
  if (el.classList.contains('mda-cm-em')) return '*' + text + '*';
  if (el.classList.contains('mda-cm-underline')) return '~' + text + '~';
  if (el.classList.contains('mda-cm-strike')) return '~~' + text + '~~';
  if (el.classList.contains('mda-cm-code')) return wrapInlineCode(text);
  if (el.classList.contains('mda-cm-link')) {
    const href = el.getAttribute('href') || '';
    return '[' + text + '](' + href + ')';
  }
  return null;
}

/**
 * @param {HTMLElement} cell
 * @param {{ type: string, from: number, to: number }} r
 * @param {string} raw
 */
function appendSyntaxInline(cell, r, raw) {
  const rule = SYNTAX_RULES[r.type];
  if (!rule) return;
  const node = { from: r.from, to: r.to, type: r.type };
  const source = raw.slice(r.from, r.to);
  const contentRange =
    typeof rule.contentRange === 'function' ? rule.contentRange(node, raw) : null;
  const visible = contentRange ? raw.slice(contentRange.from, contentRange.to) : source;
  const cls = rule.cls || '';

  if (r.type === 'Link' || r.type === 'Autolink' || r.type === 'URL') {
    const a = document.createElement('a');
    a.className = cls;
    a.setAttribute('href', typeof rule.hrefOf === 'function' ? rule.hrefOf(node, raw) : visible);
    a.setAttribute('data-mda-inline-source', source);
    // 与 source 配套：序列化时用它判断用户是否改过可见文字（改过则快照作废）
    a.setAttribute('data-mda-inline-text', visible);
    a.setAttribute('draggable', 'false');
    a.textContent = visible;
    cell.appendChild(a);
    return;
  }

  const span = document.createElement('span');
  span.className = 'mda-cm-table-inline ' + cls;
  span.setAttribute('data-mda-inline-source', source);
  span.setAttribute('data-mda-inline-text', visible);
  span.textContent = visible;
  cell.appendChild(span);
}

/**
 * @param {HTMLElement} cell
 * @param {string} text
 * @param {{ resolveImageUrl?: Function }} [opts]
 */
function setCellMarkdownContent(cell, text, opts) {
  if (!cell) return;
  opts = opts || {};
  cell.textContent = '';
  const raw = String(text == null ? '' : text);
  const ranges = findCellInlineRanges(raw);
  if (!ranges.length) {
    cell.textContent = raw;
    return;
  }
  let pos = 0;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r.from > pos) {
      cell.appendChild(document.createTextNode(raw.slice(pos, r.from)));
    }
    if (r.kind === 'math-inline') {
      const span = document.createElement('span');
      span.className = 'mda-cm-table-math mda-cm-math-inline';
      span.setAttribute('contenteditable', 'false');
      span.setAttribute('data-mda-math-tex', r.tex);
      span.setAttribute('data-mda-math-source', raw.slice(r.from, r.to));
      span.setAttribute('title', raw.slice(r.from, r.to));
      span.innerHTML = renderKatexHtml(r.tex, false);
      cell.appendChild(span);
    } else if (r.kind === 'image') {
      const wrap = document.createElement('span');
      wrap.className = 'mda-cm-table-img';
      wrap.setAttribute('contenteditable', 'false');
      const source =
        r.source ||
        serializeImageMarkdown({ alt: r.alt, src: r.src, title: r.title });
      wrap.setAttribute('data-mda-image-source', source);
      wrap.setAttribute('data-mda-image-src', r.src || '');
      wrap.setAttribute('data-mda-image-alt', r.alt || '');
      if (r.title) wrap.setAttribute('data-mda-image-title', r.title);
      wrap.setAttribute('title', source);
      const img = document.createElement('img');
      img.setAttribute('alt', r.alt || '');
      img.setAttribute('src', r.src || '');
      if (r.title) img.setAttribute('title', r.title);
      wrap.appendChild(img);
      cell.appendChild(wrap);
    } else if (r.kind === 'syntax') {
      appendSyntaxInline(cell, r, raw);
    }
    pos = r.to;
  }
  if (pos < raw.length) {
    cell.appendChild(document.createTextNode(raw.slice(pos)));
  }
  resolveImagesIn(cell, opts.resolveImageUrl);
}

/**
 * @param {Node | null} node
 * @param {(chunk: string) => void} emit
 */
function walkCellMarkdownNode(node, emit) {
  if (!node) return;
  if (node.nodeType === 3) {
    emit(node.nodeValue || '');
    return;
  }
  if (node.nodeType !== 1) return;
  const el = /** @type {HTMLElement} */ (node);
  if (el.getAttribute && el.getAttribute('data-mda-math-source')) {
    emit(el.getAttribute('data-mda-math-source') || '');
    return;
  }
  if (el.getAttribute && el.hasAttribute('data-mda-math-tex')) {
    emit('$' + (el.getAttribute('data-mda-math-tex') || '') + '$');
    return;
  }
  if (el.getAttribute && el.getAttribute('data-mda-image-source')) {
    emit(el.getAttribute('data-mda-image-source') || '');
    return;
  }
  if (
    el.classList &&
    el.classList.contains('mda-cm-table-img') &&
    el.getAttribute
  ) {
    emit(
      serializeImageMarkdown({
        alt: el.getAttribute('data-mda-image-alt') || '',
        src: el.getAttribute('data-mda-image-src') || '',
        title: el.getAttribute('data-mda-image-title') || '',
      })
    );
    return;
  }
  const inline = serializeInlineStyledElement(el);
  if (inline != null) {
    emit(inline);
    return;
  }
  const children = el.childNodes;
  for (let i = 0; i < children.length; i++) walkCellMarkdownNode(children[i], emit);
}

/**
 * 从单元格 DOM 还原 Markdown。
 * @param {HTMLElement | null} cell
 * @returns {string}
 */
function serializeTableCellDom(cell) {
  if (!cell) return '';
  let out = '';
  walkCellMarkdownNode(cell, function (chunk) {
    out += chunk;
  });
  return String(out)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n');
}

/**
 * @param {HTMLElement | null} cell
 * @returns {string}
 */
function getCellMarkdownContent(cell) {
  return serializeTableCellDom(cell);
}

/**
 * 选中单元格内的公式 / 图片原子（供整体删除）。
 * @param {HTMLElement} atomEl
 */
function selectTableMathAtom(atomEl) {
  if (!atomEl || !window.getSelection) return;
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNode(atomEl);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * @param {Node | null} node
 * @returns {boolean}
 */
function isTableCellAtom(node) {
  return !!(
    node &&
    node.nodeType === 1 &&
    /** @type {HTMLElement} */ (node).classList &&
    (/** @type {HTMLElement} */ (node).classList.contains('mda-cm-table-math') ||
      /** @type {HTMLElement} */ (node).classList.contains('mda-cm-table-img'))
  );
}

/**
 * @param {Node | null} node
 * @param {HTMLElement} cell
 * @returns {HTMLElement | null}
 */
function closestTableCellAtom(node, cell) {
  if (!node || !cell) return null;
  let el = node.nodeType === 1 ? /** @type {HTMLElement} */ (node) : node.parentElement;
  while (el && el !== cell) {
    if (isTableCellAtom(el)) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * @param {HTMLElement} cell
 * @param {KeyboardEvent} e
 * @returns {boolean} 是否已处理（删除了公式 / 图片原子）
 */
function handleTableMathDeleteKey(cell, e) {
  if (!cell || (e.key !== 'Delete' && e.key !== 'Backspace')) return false;
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.rangeCount < 1) return false;
  const range = sel.getRangeAt(0);

  const covered = closestTableCellAtom(range.commonAncestorContainer, cell);
  if (covered && cell.contains(covered) && !range.collapsed) {
    e.preventDefault();
    covered.parentNode.removeChild(covered);
    return true;
  }
  if (!range.collapsed) {
    const startAtom = closestTableCellAtom(range.startContainer, cell);
    if (startAtom && cell.contains(startAtom)) {
      e.preventDefault();
      startAtom.parentNode.removeChild(startAtom);
      return true;
    }
    return false;
  }

  if (e.key === 'Delete') {
    let next = null;
    if (range.startContainer.nodeType === 3) {
      const t = range.startContainer;
      if (range.startOffset >= (t.nodeValue || '').length) {
        next = t.nextSibling;
      }
    } else if (range.startContainer === cell) {
      next = cell.childNodes[range.startOffset] || null;
    }
    if (isTableCellAtom(next)) {
      e.preventDefault();
      next.parentNode.removeChild(next);
      return true;
    }
  }
  if (e.key === 'Backspace') {
    let prev = null;
    if (range.startContainer.nodeType === 3) {
      const t = range.startContainer;
      if (range.startOffset === 0) prev = t.previousSibling;
    } else if (range.startContainer === cell) {
      prev = range.startOffset > 0 ? cell.childNodes[range.startOffset - 1] : null;
    }
    if (isTableCellAtom(prev)) {
      e.preventDefault();
      prev.parentNode.removeChild(prev);
      return true;
    }
  }
  return false;
}

/**
 * @param {string} url
 * @returns {string}
 */
function fileUrlToLocalPath(url) {
  if (!url || !/^file:/i.test(url)) return '';
  try {
    return decodeURIComponent(String(url).replace(/^file:\/\//i, '').replace(/^\/([A-Za-z]:)/, '$1'));
  } catch (_) {
    return '';
  }
}

/**
 * 单元格内图片 Markdown（复制为：全路径 src）。
 * @param {HTMLElement | null} wrap
 * @param {(href: string) => string | null | undefined} [resolveImageUrl]
 * @returns {string}
 */
function tableCellImageMarkdownAbs(wrap, resolveImageUrl) {
  if (!wrap) return '';
  const alt = wrap.getAttribute('data-mda-image-alt') || '';
  const title = wrap.getAttribute('data-mda-image-title') || '';
  const href = wrap.getAttribute('data-mda-image-src') || '';
  const img = wrap.querySelector('img');
  const imgSrc = img ? img.getAttribute('src') || '' : '';
  let abs = fileUrlToLocalPath(imgSrc);
  if (!abs && typeof resolveImageUrl === 'function' && href) {
    const resolved = resolveImageUrl(href);
    abs = fileUrlToLocalPath(resolved) || '';
    if (!abs && resolved && !/^https?:/i.test(resolved) && !/^data:/i.test(resolved)) {
      abs = String(resolved);
    }
  }
  if (!abs && href) {
    const norm = String(href).replace(/\\/g, '/');
    if (/^[a-zA-Z]:/.test(norm) || norm.charAt(0) === '/') abs = norm;
    else abs = href;
  }
  abs = String(abs).replace(/\\/g, '/');
  return serializeImageMarkdown({ alt: alt, src: abs, title: title });
}

/**
 * @param {{ kind: string, type?: string, from: number, to: number }} r
 * @param {string} raw
 * @returns {{ from: number, to: number } | null}
 */
function syntaxVisibleRange(r, raw) {
  if (r.kind !== 'syntax') return null;
  const rule = SYNTAX_RULES[r.type];
  const node = { from: r.from, to: r.to, type: r.type };
  const cr =
    rule && typeof rule.contentRange === 'function' ? rule.contentRange(node, raw) : null;
  if (cr && cr.to >= cr.from) return cr;
  return { from: r.from, to: r.to };
}

/**
 * 单元格可见偏移 → Markdown 偏移（跳过隐藏的定界符）。
 * @param {string} raw
 * @param {number} visPos
 */
function visibleToMarkdownOffset(raw, visPos) {
  raw = String(raw || '');
  visPos = Math.max(0, visPos | 0);
  const ranges = findCellInlineRanges(raw);
  let v = 0;
  let m = 0;
  let ri = 0;
  while (true) {
    const r = ranges[ri];
    if (r && m === r.from) {
      const cr = syntaxVisibleRange(r, raw);
      if (cr) {
        const visLen = cr.to - cr.from;
        if (visPos <= v + visLen) return cr.from + (visPos - v);
        v += visLen;
      } else {
        if (visPos <= v + 1) return visPos === v ? r.from : r.to;
        v += 1;
      }
      m = r.to;
      ri += 1;
      continue;
    }
    const next = r ? r.from : raw.length;
    const plain = next - m;
    if (visPos <= v + plain) return m + (visPos - v);
    v += plain;
    m = next;
    if (!r) return raw.length;
  }
}

/**
 * Markdown 偏移 → 单元格可见偏移。
 * @param {string} raw
 * @param {number} mdPos
 */
function markdownToVisibleOffset(raw, mdPos) {
  raw = String(raw || '');
  mdPos = Math.max(0, Math.min(mdPos | 0, raw.length));
  const ranges = findCellInlineRanges(raw);
  let v = 0;
  let m = 0;
  let ri = 0;
  while (true) {
    const r = ranges[ri];
    if (r && m === r.from) {
      const cr = syntaxVisibleRange(r, raw);
      if (cr) {
        if (mdPos <= cr.from) return v;
        if (mdPos <= cr.to) return v + (mdPos - cr.from);
        v += cr.to - cr.from;
        if (mdPos < r.to) return v;
      } else {
        if (mdPos <= r.from) return v;
        if (mdPos < r.to) return v;
        v += 1;
      }
      m = r.to;
      ri += 1;
      continue;
    }
    const next = r ? r.from : raw.length;
    if (mdPos <= next) return v + (mdPos - m);
    v += next - m;
    m = next;
    if (!r) return v;
  }
}

/**
 * @param {Range} range
 * @param {HTMLElement} cell
 */
function rangeStillInCell(range, cell) {
  if (!range || !cell) return false;
  try {
    return cell.contains(range.startContainer) && cell.contains(range.endContainer);
  } catch (_) {
    return false;
  }
}

/**
 * @param {HTMLElement} cell
 * @param {Range} range
 * @returns {{ start: number, end: number }}
 */
function getRangeVisibleOffsets(cell, range) {
  const pre = document.createRange();
  pre.selectNodeContents(cell);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { start: start, end: start + range.toString().length };
}

/**
 * @param {HTMLElement} cell
 * @param {number} visStart
 * @param {number} visEnd
 */
function setCellVisibleSelection(cell, visStart, visEnd) {
  if (!cell || typeof document === 'undefined') return;
  visStart = Math.max(0, visStart | 0);
  visEnd = Math.max(visStart, visEnd | 0);
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
  let pos = 0;
  let startNode = null;
  let startOff = 0;
  let endNode = null;
  let endOff = 0;
  let n = walker.nextNode();
  while (n) {
    const len = (n.nodeValue || '').length;
    if (!startNode && visStart <= pos + len) {
      startNode = n;
      startOff = visStart - pos;
    }
    if (visEnd <= pos + len) {
      endNode = n;
      endOff = visEnd - pos;
      break;
    }
    pos += len;
    n = walker.nextNode();
  }
  if (!startNode) return;
  if (!endNode) {
    endNode = startNode;
    endOff = (startNode.nodeValue || '').length;
  }
  const maxS = (startNode.nodeValue || '').length;
  const maxE = (endNode.nodeValue || '').length;
  try {
    const range = document.createRange();
    range.setStart(startNode, Math.max(0, Math.min(startOff, maxS)));
    range.setEnd(endNode, Math.max(0, Math.min(endOff, maxE)));
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * 在表格单元格选区上切换行内格式：重绘样式并恢复可见选区。
 * @param {HTMLElement} cell
 * @param {string} before
 * @param {string} after
 * @param {Range | null} [savedRange]
 * @returns {boolean}
 */
function applyInlineFormatToTableCell(cell, before, after, savedRange, visHint) {
  if (!cell) return false;
  const md = serializeTableCellDom(cell);
  let visStart;
  let visEnd;
  if (
    visHint &&
    typeof visHint.visStart === 'number' &&
    typeof visHint.visEnd === 'number' &&
    visHint.visEnd >= visHint.visStart
  ) {
    visStart = visHint.visStart;
    visEnd = visHint.visEnd;
  } else {
    let range = savedRange && rangeStillInCell(savedRange, cell) ? savedRange : null;
    if (!range && typeof window !== 'undefined' && window.getSelection) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const live = sel.getRangeAt(0);
        if (rangeStillInCell(live, cell)) range = live;
      }
    }
    if (range) {
      const off = getRangeVisibleOffsets(cell, range);
      visStart = off.start;
      visEnd = off.end;
    } else {
      visStart = visEnd = (cell.textContent || '').length;
    }
  }
  const mdA = visibleToMarkdownOffset(md, visStart);
  const mdB = visibleToMarkdownOffset(md, visEnd);
  // 走正文同一套规划器：融合相邻同类样式段、部分取消时拆分，不留可见定界符。
  // 拿不到规划（如空选区）才退回 editor-assist 的朴素包裹。
  const markKey = markKeyForDelims(before, after);
  const planned = markKey ? toggleInlineMarkInText(md, mdA, mdB, markKey) : null;
  const result =
    planned ||
    (before === '~' && after === '~'
      ? assist.toggleUnderline(md, mdA, mdB)
      : assist.toggleWrap(md, mdA, mdB, before, after));
  if (!result) return false;
  setCellMarkdownContent(cell, result.value);
  const newVisStart = markdownToVisibleOffset(result.value, result.selectionStart);
  const newVisEnd = markdownToVisibleOffset(result.value, result.selectionEnd);
  function restore() {
    if (!cell.isConnected) return;
    try {
      cell.focus();
    } catch (_) {
      /* ignore */
    }
    setCellVisibleSelection(cell, newVisStart, newVisEnd);
  }
  restore();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(restore);
  }
  try {
    cell.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (_) {
    /* ignore */
  }
  return true;
}

/**
 * @param {HTMLElement} cell
 * @param {{ visStart?: number, visEnd?: number }} [visHint] 优先用调用方快照的可见偏移
 * @returns {{ start: number, end: number } | null}
 */
function resolveCellVisRange(cell, visHint) {
  if (!cell) return null;
  if (
    visHint &&
    typeof visHint.visStart === 'number' &&
    typeof visHint.visEnd === 'number' &&
    visHint.visEnd >= visHint.visStart
  ) {
    return { start: visHint.visStart, end: visHint.visEnd };
  }
  if (typeof window === 'undefined' || !window.getSelection) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount < 1) return null;
  const range = sel.getRangeAt(0);
  if (!rangeStillInCell(range, cell)) return null;
  return getRangeVisibleOffsets(cell, range);
}

/**
 * 格内光标/选区处的行内标记状态（工具栏高亮用）。
 *
 * 格内选区活在 contenteditable 的 DOM 里，CM6 文档选区停在表首，
 * 直接问 `getInlineToolbarState(view.state)` 只会得到「什么样式都没有」——
 * 这正是「点进格内加粗文字，工具栏不高亮」的成因。这里改从单元格自己的 Markdown 取。
 *
 * @param {HTMLElement} cell
 * @param {{ visStart?: number, visEnd?: number }} [visHint]
 * @returns {{ bold: {on:boolean,mixed:boolean}, italic: {on:boolean,mixed:boolean}, underline: {on:boolean,mixed:boolean}, strike: {on:boolean,mixed:boolean}, code: {on:boolean,mixed:boolean} } | null}
 */
function getCellInlineState(cell, visHint) {
  const vis = resolveCellVisRange(cell, visHint);
  if (!vis) return null;
  const md = serializeTableCellDom(cell);
  return inlineStateInText(
    md,
    visibleToMarkdownOffset(md, vis.start),
    visibleToMarkdownOffset(md, vis.end)
  );
}

/**
 * 光标处的标记位（待输入格式的基准），语义同正文 `getInlineFlagsAt`。
 *
 * @param {HTMLElement} cell
 * @param {{ visStart?: number, visEnd?: number }} [visHint]
 * @returns {{ pos: number, flags: Record<string, boolean> } | null}
 */
function getCellInlineFlags(cell, visHint) {
  const vis = resolveCellVisRange(cell, visHint);
  if (!vis) return null;
  const md = serializeTableCellDom(cell);
  const at = visibleToMarkdownOffset(md, vis.start);
  const st = inlineStateInText(md, at, at);
  /** @type {Record<string, boolean>} */
  const flags = {};
  for (const k in st) {
    if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
    flags[k] = !!(st[k] && st[k].on && !st[k].mixed);
  }
  return { pos: vis.start, flags: flags };
}

module.exports = {
  setCellMarkdownContent: setCellMarkdownContent,
  getCellMarkdownContent: getCellMarkdownContent,
  getCellInlineState: getCellInlineState,
  getCellInlineFlags: getCellInlineFlags,
  getCellVisibleSelection: resolveCellVisRange,
  serializeTableCellDom: serializeTableCellDom,
  serializeInlineStyledElement: serializeInlineStyledElement,
  wrapInlineCode: wrapInlineCode,
  findSyntaxInlineRanges: findSyntaxInlineRanges,
  selectTableMathAtom: selectTableMathAtom,
  handleTableMathDeleteKey: handleTableMathDeleteKey,
  findCellInlineRanges: findCellInlineRanges,
  tableCellImageMarkdownAbs: tableCellImageMarkdownAbs,
  applyInlineFormatToTableCell: applyInlineFormatToTableCell,
  setCellVisibleSelection: setCellVisibleSelection,
  visibleToMarkdownOffset: visibleToMarkdownOffset,
  markdownToVisibleOffset: markdownToVisibleOffset,
};

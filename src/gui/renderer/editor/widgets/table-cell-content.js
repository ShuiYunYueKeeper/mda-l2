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
function listAllCellSyntaxNodes(raw) {
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
  return syntax;
}

/**
 * 顶层互不重叠的语法区间（对外兼容：并列样式段）。
 * 嵌套叠套须走递归渲染，不能只用这一层。
 * @param {string} raw
 * @returns {{ kind: 'syntax', type: string, from: number, to: number }[]}
 */
function findSyntaxInlineRanges(raw) {
  return pickNonOverlapping(listAllCellSyntaxNodes(raw));
}

/**
 * 窗口 [winFrom, winTo) 内的顶层语法节点（不被同窗口内另一节点包含）。
 * @param {{ kind: string, type: string, from: number, to: number }[]} nodes
 * @param {number} winFrom
 * @param {number} winTo
 */
function topLevelSyntaxInWindow(nodes, winFrom, winTo) {
  const inside = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.from >= winFrom && n.to <= winTo && n.to > n.from) inside.push(n);
  }
  const top = [];
  for (let i = 0; i < inside.length; i++) {
    const n = inside[i];
    let nested = false;
    for (let j = 0; j < inside.length; j++) {
      if (i === j) continue;
      const o = inside[j];
      if (o.from <= n.from && o.to >= n.to && (o.from < n.from || o.to > n.to)) {
        nested = true;
        break;
      }
    }
    if (!nested) top.push(n);
  }
  return top.sort(function (a, b) {
    return a.from - b.from;
  });
}

/**
 * 所有定界符区间（含嵌套层），用于可见偏移映射。
 * @param {string} raw
 * @returns {{ from: number, to: number }[]}
 */
function collectCellDelimiterExclusions(raw) {
  const text = String(raw || '');
  const nodes = listAllCellSyntaxNodes(text);
  /** @type {{ from: number, to: number }[]} */
  const excl = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const rule = SYNTAX_RULES[n.type];
    if (!rule || typeof rule.markRanges !== 'function') continue;
    const marks = rule.markRanges({ from: n.from, to: n.to, type: n.type }, text) || [];
    for (let j = 0; j < marks.length; j++) {
      const m = marks[j];
      if (m && m.to > m.from) excl.push({ from: m.from, to: m.to });
    }
  }
  excl.sort(function (a, b) {
    return a.from - b.from || a.to - b.to;
  });
  // 合并重叠/相接，便于线性扫描
  const merged = [];
  for (let i = 0; i < excl.length; i++) {
    const cur = excl[i];
    const last = merged[merged.length - 1];
    if (last && cur.from <= last.to) {
      if (cur.to > last.to) last.to = cur.to;
    } else {
      merged.push({ from: cur.from, to: cur.to });
    }
  }
  return merged;
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
 * @returns {string}
 */
function serializeInlineChildMarkdown(el) {
  let out = '';
  const children = el.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === 3) {
      out += child.nodeValue || '';
      continue;
    }
    if (child.nodeType !== 1) continue;
    const nested = serializeInlineStyledElement(/** @type {HTMLElement} */ (child));
    if (nested != null) out += nested;
    else out += /** @type {HTMLElement} */ (child).textContent || '';
  }
  return out;
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
    // 编辑整个吞掉（改可见字仍写回旧快照，删空则文字复活）。
    // 因此只有当可见文字与渲染时一致，才认这份快照。
    const rendered = el.getAttribute('data-mda-inline-text');
    if (rendered == null || rendered === text) return source;
  }
  if (!el.classList) return null;
  // 内容被删光时整对定界符一并丢弃，否则序列化出裸定界符
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
  // 叠套样式：子节点已是行内 span 时须先序列化子树再包本层定界符
  let inner = text;
  let hasElementChild = false;
  const kids = el.childNodes;
  if (kids && kids.length) {
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].nodeType === 1) {
        hasElementChild = true;
        break;
      }
    }
  }
  if (hasElementChild) inner = serializeInlineChildMarkdown(el);

  if (el.classList.contains('mda-cm-strong')) return '**' + inner + '**';
  if (el.classList.contains('mda-cm-em')) return '*' + inner + '*';
  if (el.classList.contains('mda-cm-underline')) return '~' + inner + '~';
  if (el.classList.contains('mda-cm-strike')) return '~~' + inner + '~~';
  if (el.classList.contains('mda-cm-code')) return wrapInlineCode(text);
  if (el.classList.contains('mda-cm-link')) {
    const href = el.getAttribute('href') || '';
    return '[' + text + '](' + href + ')';
  }
  return null;
}

/** 叶子样式：不递归解析内容（定界符内是字面文本） */
const LEAF_SYNTAX_TYPES = {
  InlineCode: 1,
  Link: 1,
  Autolink: 1,
  URL: 1,
};

/**
 * @param {HTMLElement} parent
 * @param {{ kind: string, type?: string, from: number, to: number, [key: string]: any }} r
 * @param {string} raw
 * @param {{ kind: string, type?: string, from: number, to: number, [key: string]: any }[]} allSyntax
 * @param {{ resolveImageUrl?: Function }} opts
 */
function appendCellInlineRange(parent, r, raw, allSyntax, opts) {
  if (r.kind === 'math-inline') {
    const span = document.createElement('span');
    span.className = 'mda-cm-table-math mda-cm-math-inline';
    span.setAttribute('contenteditable', 'false');
    span.setAttribute('data-mda-math-tex', r.tex);
    span.setAttribute('data-mda-math-source', raw.slice(r.from, r.to));
    span.setAttribute('title', raw.slice(r.from, r.to));
    span.innerHTML = renderKatexHtml(r.tex, false);
    parent.appendChild(span);
    return;
  }
  if (r.kind === 'image') {
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
    parent.appendChild(wrap);
    return;
  }
  if (r.kind !== 'syntax' || !r.type) return;
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
    a.setAttribute('data-mda-inline-text', visible);
    a.setAttribute('draggable', 'false');
    a.textContent = visible;
    parent.appendChild(a);
    return;
  }

  const span = document.createElement('span');
  span.className = 'mda-cm-table-inline ' + cls;
  span.setAttribute('data-mda-inline-source', source);
  if (LEAF_SYNTAX_TYPES[r.type] || !contentRange) {
    span.setAttribute('data-mda-inline-text', visible);
    span.textContent = visible;
  } else {
    // 递归填内容区：内层删除线/下划线/斜体等不再被最外层吞掉
    fillCellInlineWindow(span, raw, contentRange.from, contentRange.to, allSyntax, opts);
    span.setAttribute('data-mda-inline-text', span.textContent || '');
  }
  parent.appendChild(span);
}

/**
 * 在 [from, to) 窗口内渲染顶层行内节点（可嵌套）。
 * @param {HTMLElement} parent
 * @param {string} raw
 * @param {number} from
 * @param {number} to
 * @param {{ kind: string, type?: string, from: number, to: number, [key: string]: any }[]} allSyntax
 * @param {{ resolveImageUrl?: Function }} opts
 */
function fillCellInlineWindow(parent, raw, from, to, allSyntax, opts) {
  if (to <= from) return;
  const math = findMathRanges(raw).filter(function (r) {
    return r.kind === 'math-inline' && r.from >= from && r.to <= to;
  });
  const images = findImageRanges(raw).filter(function (img) {
    if (img.from < from || img.to > to) return false;
    for (let i = 0; i < math.length; i++) {
      if (rangesOverlap(img, math[i])) return false;
    }
    return true;
  });
  const syntaxTop = topLevelSyntaxInWindow(allSyntax, from, to).filter(function (s) {
    for (let i = 0; i < math.length; i++) {
      if (rangesOverlap(s, math[i])) return false;
    }
    for (let j = 0; j < images.length; j++) {
      if (rangesOverlap(s, images[j])) return false;
    }
    return true;
  });
  const ranges = math
    .concat(images)
    .concat(syntaxTop)
    .sort(function (a, b) {
      return a.from - b.from;
    });

  let pos = from;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r.from > pos) {
      parent.appendChild(document.createTextNode(raw.slice(pos, r.from)));
    }
    appendCellInlineRange(parent, r, raw, allSyntax, opts);
    pos = r.to;
  }
  if (pos < to) {
    parent.appendChild(document.createTextNode(raw.slice(pos, to)));
  }
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
  if (!raw) return;
  const allSyntax = listAllCellSyntaxNodes(raw);
  fillCellInlineWindow(cell, raw, 0, raw.length, allSyntax, opts);
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
 * 把单元格内当前 DOM 选区序列化为 Markdown（保留成对定界符）。
 * 用于格内 Ctrl+C：原生 contenteditable 只会拷可见字，样式定界符会丢。
 * @param {HTMLElement} cell
 * @returns {string | null}
 */
function serializeCellSelectionMarkdown(cell) {
  if (!cell || typeof window === 'undefined' || !window.getSelection) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!rangeStillInCell(range, cell)) return null;

  // 选区落在单个样式 span 内且盖住其全部可见文字 → 直接用源码快照（含定界符）
  const startNode = range.startContainer;
  const endNode = range.endContainer;
  const startEl =
    startNode && startNode.nodeType === 1
      ? /** @type {HTMLElement} */ (startNode).closest
        ? /** @type {HTMLElement} */ (startNode).closest('.mda-cm-table-inline, .mda-cm-link')
        : null
      : startNode && startNode.parentElement
        ? startNode.parentElement.closest('.mda-cm-table-inline, .mda-cm-link')
        : null;
  const endEl =
    endNode && endNode.nodeType === 1
      ? /** @type {HTMLElement} */ (endNode).closest
        ? /** @type {HTMLElement} */ (endNode).closest('.mda-cm-table-inline, .mda-cm-link')
        : null
      : endNode && endNode.parentElement
        ? endNode.parentElement.closest('.mda-cm-table-inline, .mda-cm-link')
        : null;
  if (startEl && startEl === endEl && cell.contains(startEl)) {
    const source = startEl.getAttribute('data-mda-inline-source');
    const rendered =
      startEl.getAttribute('data-mda-inline-text') != null
        ? startEl.getAttribute('data-mda-inline-text')
        : startEl.textContent || '';
    const selected = String(range.toString() || '');
    if (source && selected === rendered) return source;
  }

  try {
    const frag = range.cloneContents();
    const wrap = document.createElement('div');
    wrap.appendChild(frag);
    // cloneContents 常只带文本节点；若整格可见文字都被选中，回退整格 Markdown
    const cloned = serializeTableCellDom(wrap);
    const full = serializeTableCellDom(cell);
    const cellVis = String(cell.textContent || '').replace(/\u00a0/g, ' ');
    const selVis = String(range.toString() || '').replace(/\u00a0/g, ' ');
    if (selVis && selVis === cellVis && full) return full;
    return cloned == null ? null : String(cloned);
  } catch (_) {
    return null;
  }
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
  const excl = collectCellDelimiterExclusions(raw);
  let v = 0;
  let m = 0;
  let ei = 0;
  while (true) {
    const e = excl[ei];
    if (e && m === e.from) {
      m = e.to;
      ei += 1;
      continue;
    }
    const next = e ? e.from : raw.length;
    const plain = next - m;
    if (visPos <= v + plain) return m + (visPos - v);
    v += plain;
    m = next;
    if (!e) return raw.length;
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
  const excl = collectCellDelimiterExclusions(raw);
  let v = 0;
  let m = 0;
  let ei = 0;
  while (true) {
    const e = excl[ei];
    if (e && m === e.from) {
      if (mdPos <= e.from) return v;
      if (mdPos < e.to) return v;
      m = e.to;
      ei += 1;
      continue;
    }
    const next = e ? e.from : raw.length;
    if (mdPos <= next) return v + (mdPos - m);
    v += next - m;
    m = next;
    if (!e) return v;
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

/**
 * 把 Markdown 贴进单元格并立刻按样式重绘，避免先露出 `**…**` 源码、失焦才渲染。
 * @param {HTMLElement} cell
 * @param {string} pasted
 * @param {{ resolveImageUrl?: Function }} [opts]
 * @returns {boolean}
 */
function pasteMarkdownIntoTableCell(cell, pasted, opts) {
  if (!cell) return false;
  const insert = String(pasted == null ? '' : pasted);
  const md = serializeTableCellDom(cell);
  let from = md.length;
  let to = md.length;
  if (typeof window !== 'undefined' && window.getSelection) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (rangeStillInCell(range, cell)) {
        const off = getRangeVisibleOffsets(cell, range);
        from = visibleToMarkdownOffset(md, off.start);
        to = visibleToMarkdownOffset(md, off.end);
      }
    }
  }
  const next = md.slice(0, from) + insert + md.slice(to);
  setCellMarkdownContent(cell, next, opts || {});
  const caretVis = markdownToVisibleOffset(next, from + insert.length);
  setCellVisibleSelection(cell, caretVis, caretVis);
  return true;
}

module.exports = {
  setCellMarkdownContent: setCellMarkdownContent,
  getCellMarkdownContent: getCellMarkdownContent,
  getCellInlineState: getCellInlineState,
  getCellInlineFlags: getCellInlineFlags,
  getCellVisibleSelection: resolveCellVisRange,
  serializeTableCellDom: serializeTableCellDom,
  serializeInlineStyledElement: serializeInlineStyledElement,
  serializeCellSelectionMarkdown: serializeCellSelectionMarkdown,
  pasteMarkdownIntoTableCell: pasteMarkdownIntoTableCell,
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

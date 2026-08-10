/**
 * 表格单元格内行内公式 / 图片：渲染原子 + Markdown 写回。
 */
'use strict';

const { findMathRanges } = require('../model/parse-math');
const { findImageRanges, serializeImageMarkdown } = require('../model/parse-image');
const { renderKatexHtml } = require('./math');
const { resolveImagesIn } = require('./md-surface');

/**
 * 合并行内公式与图片区间（重叠时优先公式）。
 * @param {string} raw
 * @returns {{ kind: string, from: number, to: number, [key: string]: any }[]}
 */
function findCellInlineRanges(raw) {
  const math = findMathRanges(raw).filter(function (r) {
    return r.kind === 'math-inline';
  });
  const images = findImageRanges(raw).filter(function (img) {
    for (let i = 0; i < math.length; i++) {
      const m = math[i];
      if (img.from < m.to && img.to > m.from) return false;
    }
    return true;
  });
  return math.concat(images).sort(function (a, b) {
    return a.from - b.from;
  });
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
    }
    pos = r.to;
  }
  if (pos < raw.length) {
    cell.appendChild(document.createTextNode(raw.slice(pos)));
  }
  resolveImagesIn(cell, opts.resolveImageUrl);
}

/**
 * 从单元格 DOM 还原 Markdown（公式 / 图片原子回写）。
 * @param {HTMLElement | null} cell
 * @returns {string}
 */
function getCellMarkdownContent(cell) {
  if (!cell) return '';
  let out = '';
  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      out += node.nodeValue || '';
      return;
    }
    if (node.nodeType !== 1) return;
    const el = /** @type {HTMLElement} */ (node);
    if (el.getAttribute && el.getAttribute('data-mda-math-source')) {
      out += el.getAttribute('data-mda-math-source') || '';
      return;
    }
    if (el.getAttribute && el.hasAttribute('data-mda-math-tex')) {
      out += '$' + (el.getAttribute('data-mda-math-tex') || '') + '$';
      return;
    }
    if (el.getAttribute && el.getAttribute('data-mda-image-source')) {
      out += el.getAttribute('data-mda-image-source') || '';
      return;
    }
    if (
      el.classList &&
      el.classList.contains('mda-cm-table-img') &&
      el.getAttribute
    ) {
      out += serializeImageMarkdown({
        alt: el.getAttribute('data-mda-image-alt') || '',
        src: el.getAttribute('data-mda-image-src') || '',
        title: el.getAttribute('data-mda-image-title') || '',
      });
      return;
    }
    const children = el.childNodes;
    for (let i = 0; i < children.length; i++) walk(children[i]);
  }
  walk(cell);
  return String(out)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n');
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

  // 选区覆盖原子
  const covered = closestTableCellAtom(range.commonAncestorContainer, cell);
  if (covered && cell.contains(covered) && !range.collapsed) {
    e.preventDefault();
    covered.parentNode.removeChild(covered);
    return true;
  }
  if (!range.collapsed) {
    // 选区起点落在原子上
    const startAtom = closestTableCellAtom(range.startContainer, cell);
    if (startAtom && cell.contains(startAtom)) {
      e.preventDefault();
      startAtom.parentNode.removeChild(startAtom);
      return true;
    }
    return false;
  }

  // 光标紧邻原子：Delete 删右侧，Backspace 删左侧
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

module.exports = {
  setCellMarkdownContent: setCellMarkdownContent,
  getCellMarkdownContent: getCellMarkdownContent,
  selectTableMathAtom: selectTableMathAtom,
  handleTableMathDeleteKey: handleTableMathDeleteKey,
  findCellInlineRanges: findCellInlineRanges,
  tableCellImageMarkdownAbs: tableCellImageMarkdownAbs,
};

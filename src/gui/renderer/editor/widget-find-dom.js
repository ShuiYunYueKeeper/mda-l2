/**
 * 块 widget 内查找高亮：共享 DOM 包裹工具。
 */
'use strict';

const FIND_MARK_CLS = 'mda-cm-table-find';
const FIND_ACTIVE_CLS = 'mda-cm-table-find-active';

/**
 * @param {HTMLElement} container
 */
function clearContainerFindMarks(container) {
  if (!container) return;
  const marks = container.querySelectorAll(
    'mark.' + FIND_MARK_CLS + ', mark.' + FIND_ACTIVE_CLS + ', span.' + FIND_MARK_CLS + ', span.' + FIND_ACTIVE_CLS
  );
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    if (parent.normalize) parent.normalize();
  }
}

/**
 * @param {string | null | undefined} text
 */
function logicalTextCharLength(text) {
  return String(text || '')
    .replace(/\u200b/g, '')
    .replace(/\u00a0/g, ' ')
    .length;
}

/**
 * 逻辑坐标内 raw 文本偏移（跳过 ZWSP，与 code.js readPlainCodeDom 一致）。
 * @param {string} raw
 * @param {number} localLogicalStart
 * @param {number} localLogicalEnd
 */
function logicalToRawSlice(raw, localLogicalStart, localLogicalEnd) {
  let logical = 0;
  let rawStart = -1;
  let rawEnd = raw.length;
  const s = String(raw || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '\u200b') continue;
    if (logical === localLogicalStart && rawStart < 0) rawStart = i;
    if (logical >= localLogicalEnd) {
      rawEnd = i;
      break;
    }
    logical += 1;
  }
  if (rawStart < 0) rawStart = 0;
  return { start: rawStart, end: rawEnd };
}

/**
 * @param {HTMLElement} container
 * @returns {{ node: Text, globalStart: number, globalEnd: number }[]}
 */
function indexTextNodes(container) {
  const list = [];
  if (!container) return list;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      const p = node.parentElement;
      if (p && p.closest && p.closest('[data-mda-widget-find]')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let pos = 0;
  let node = walker.nextNode();
  while (node) {
    const len = logicalTextCharLength(node.nodeValue);
    if (len > 0) {
      list.push({ node: node, globalStart: pos, globalEnd: pos + len });
    }
    pos += len;
    node = walker.nextNode();
  }
  return list;
}

/**
 * 与围栏源码字符串对齐的逻辑坐标（含 <br> 为 \n，忽略 ZWSP）。
 * @param {HTMLElement} container
 * @returns {{ node: Text, globalStart: number, globalEnd: number }[]}
 */
function indexLogicalTextNodes(container) {
  const list = [];
  if (!container) return list;

  /** @param {Node} node */
  function walk(node) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        const p = child.parentElement;
        if (p && p.closest && p.closest('[data-mda-widget-find]')) continue;
        const len = logicalTextCharLength(child.nodeValue);
        if (len > 0) {
          list.push({
            node: child,
            globalStart: logicalPos,
            globalEnd: logicalPos + len,
          });
        }
        logicalPos += len;
      } else if (child.nodeName === 'BR') {
        const p = child.parentElement;
        if (p && p.closest && p.closest('[data-mda-widget-find]')) continue;
        logicalPos += 1;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  }

  let logicalPos = 0;
  walk(container);
  return list;
}

/**
 * @param {HTMLElement} container
 * @param {number} visStart
 * @param {number} visEnd
 * @returns {{ node: Text, start: number, end: number }[]}
 */
function collectVisibleTextSegments(container, visStart, visEnd) {
  const segments = [];
  if (!container || visEnd <= visStart) return segments;
  const useLogical = !!(container.querySelector && container.querySelector('br'));
  const nodes = useLogical ? indexLogicalTextNodes(container) : indexTextNodes(container);
  for (let i = 0; i < nodes.length; i++) {
    const entry = nodes[i];
    const overlapStart = Math.max(visStart, entry.globalStart);
    const overlapEnd = Math.min(visEnd, entry.globalEnd);
    if (overlapEnd <= overlapStart) continue;
    const localLogicalStart = overlapStart - entry.globalStart;
    const localLogicalEnd = overlapEnd - entry.globalStart;
    const raw = logicalToRawSlice(entry.node.nodeValue || '', localLogicalStart, localLogicalEnd);
    segments.push({
      node: entry.node,
      start: raw.start,
      end: raw.end,
    });
  }
  return segments;
}

/**
 * @param {Text} textNode
 * @param {number} start
 * @param {number} end
 * @param {string} className
 */
function splitAndWrapTextNode(textNode, start, end, className) {
  if (!textNode || start >= end) return;
  const parent = textNode.parentNode;
  if (!parent) return;
  const full = textNode.nodeValue || '';
  const safeStart = Math.max(0, Math.min(start, full.length));
  const safeEnd = Math.max(safeStart, Math.min(end, full.length));
  if (safeEnd <= safeStart) return;

  const before = full.slice(0, safeStart);
  const mid = full.slice(safeStart, safeEnd);
  const after = full.slice(safeEnd);

  const wrap = document.createElement('span');
  wrap.className = className;
  wrap.setAttribute('data-mda-widget-find', '1');
  wrap.textContent = mid;

  if (before) parent.insertBefore(document.createTextNode(before), textNode);
  parent.insertBefore(wrap, textNode);
  if (after) parent.insertBefore(document.createTextNode(after), textNode);
  parent.removeChild(textNode);
}

/**
 * @param {HTMLElement} container
 * @param {{ visStart: number, visEnd: number, cls: string }[]} ranges
 */
function applyVisibleHighlightsInContainer(container, ranges) {
  if (!container || !ranges.length) return;
  const sorted = ranges.slice().sort(function (a, b) {
    return b.visStart - a.visStart;
  });
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.visEnd <= r.visStart) continue;
    const segs = collectVisibleTextSegments(container, r.visStart, r.visEnd);
    for (let j = segs.length - 1; j >= 0; j--) {
      const seg = segs[j];
      if (!seg.node.isConnected) continue;
      splitAndWrapTextNode(seg.node, seg.start, seg.end, r.cls);
    }
  }
}

module.exports = {
  FIND_MARK_CLS: FIND_MARK_CLS,
  FIND_ACTIVE_CLS: FIND_ACTIVE_CLS,
  clearContainerFindMarks: clearContainerFindMarks,
  collectVisibleTextSegments: collectVisibleTextSegments,
  splitAndWrapTextNode: splitAndWrapTextNode,
  applyVisibleHighlightsInContainer: applyVisibleHighlightsInContainer,
  indexTextNodes: indexTextNodes,
  indexLogicalTextNodes: indexLogicalTextNodes,
};

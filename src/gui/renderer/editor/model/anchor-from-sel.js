/**
 * P2 §4.4：CM6 选区 → 批注 anchor（UTF-16 源码偏移）。
 */
'use strict';

const { findAnnotationHideRanges } = require('./anno-lines');

const QUOTE_MAX = 200;

/**
 * @param {string} text
 * @param {number} pos
 * @param {number} dir +1 向前找可见端点，-1 向后
 * @param {{ from: number, to: number }[]} hidden
 * @returns {number}
 */
function skipHiddenAt(text, pos, dir, hidden) {
  let p = pos;
  const len = text.length;
  for (let guard = 0; guard < 4096 && p >= 0 && p <= len; guard++) {
    let inside = false;
    for (let i = 0; i < hidden.length; i++) {
      const h = hidden[i];
      if (p >= h.from && p < h.to) {
        inside = true;
        p = dir > 0 ? h.to : h.from - 1;
        break;
      }
    }
    if (!inside) break;
  }
  return Math.max(0, Math.min(len, p));
}

/**
 * @param {string} text
 * @param {number} from
 * @param {number} to
 * @param {number} dir
 * @param {{ from: number, to: number }[]} hidden
 * @returns {number}
 */
function trimEndpoint(text, from, to, dir, hidden) {
  let p = dir > 0 ? from : Math.max(from, to - 1);
  const end = dir > 0 ? to : from;
  while (p !== end) {
    p = skipHiddenAt(text, p, dir, hidden);
    const ch = text.charAt(p);
    if (!ch || !/\s/.test(ch)) break;
    p += dir;
  }
  p = skipHiddenAt(text, p, dir, hidden);
  return Math.max(0, Math.min(text.length, p));
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @returns {{ start: number, end: number, quote: string } | null}
 */
function anchorFromSelection(state) {
  if (!state || !state.selection) return null;
  const r = state.selection.main;
  if (!r || r.empty) return null;
  const text = state.doc.toString();
  const hidden = findAnnotationHideRanges(text).map(function (x) {
    return { from: x.from, to: x.to };
  });
  let from = trimEndpoint(text, r.from, r.to, 1, hidden);
  let endIdx = trimEndpoint(text, r.from, r.to, -1, hidden);
  if (from > endIdx) return null;
  const endPos = endIdx + 1;
  let quote = text.slice(from, endPos);
  if (quote.length > QUOTE_MAX) quote = quote.slice(0, QUOTE_MAX);
  return { start: from, end: endPos, quote: quote };
}

module.exports = {
  anchorFromSelection: anchorFromSelection,
  QUOTE_MAX: QUOTE_MAX,
};

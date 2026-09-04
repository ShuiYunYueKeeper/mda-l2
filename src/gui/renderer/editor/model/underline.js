/**
 * 单波浪线下划线 `~text~`（排除 GFM `~~删除线~~`）。
 */
'use strict';

/**
 * @param {number} from
 * @param {number} to
 * @param {{ from: number, to: number }[]} excludes
 */
function overlapsExclude(from, to, excludes) {
  if (!excludes || !excludes.length) return false;
  for (let i = 0; i < excludes.length; i++) {
    const e = excludes[i];
    if (from < e.to && to > e.from) return true;
  }
  return false;
}

/**
 * @param {string} text
 * @param {{ from: number, to: number }[]} [excludeRanges]
 * @returns {{ from: number, to: number, type: 'Underline' }[]}
 */
function findUnderlineRanges(text, excludeRanges) {
  const src = text == null ? '' : String(text);
  const n = src.length;
  /** @type {{ from: number, to: number, type: 'Underline' }[]} */
  const ranges = [];
  let i = 0;
  while (i < n) {
    const ch = src.charAt(i);
    if (ch === '~' && src.charAt(i + 1) === '~') {
      i += 2;
      continue;
    }
    if (ch === '~') {
      let j = i + 1;
      let close = -1;
      while (j < n) {
        const c = src.charAt(j);
        if (c === '\n' || c === '\r') break;
        if (c === '~' && src.charAt(j + 1) === '~') {
          j += 2;
          continue;
        }
        if (c === '~') {
          close = j;
          break;
        }
        j += 1;
      }
      if (close > i) {
        const from = i;
        const to = close + 1;
        if (!overlapsExclude(from, to, excludeRanges || [])) {
          ranges.push({ from: from, to: to, type: 'Underline' });
        }
        i = close + 1;
        continue;
      }
    }
    i += 1;
  }
  return ranges;
}

/**
 * 选区是否已为单 `~` 包裹（非 `~~`）。
 * @param {string} selected
 */
function isSingleTildeWrapped(selected) {
  const s = String(selected || '');
  if (s.length < 2) return false;
  if (s.charAt(0) !== '~' || s.charAt(s.length - 1) !== '~') return false;
  if (s.charAt(1) === '~') return false;
  if (s.length >= 3 && s.charAt(s.length - 2) === '~') return false;
  return true;
}

/**
 * @param {string} value
 * @param {number} pos
 * @returns {boolean}
 */
function isSingleTildeAt(value, pos) {
  if (pos < 0 || pos >= value.length || value.charAt(pos) !== '~') return false;
  if (pos > 0 && value.charAt(pos - 1) === '~') return false;
  if (pos + 1 < value.length && value.charAt(pos + 1) === '~') return false;
  return true;
}

module.exports = {
  findUnderlineRanges: findUnderlineRanges,
  isSingleTildeWrapped: isSingleTildeWrapped,
  isSingleTildeAt: isSingleTildeAt,
  overlapsExclude: overlapsExclude,
};

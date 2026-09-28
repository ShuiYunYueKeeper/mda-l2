/**
 * 单波浪线下划线 `~text~`（排除 GFM `~~删除线~~`）。
 * 叠套形态 `~~~text~~~` = 下划线 + 删除线（wrapWithAdds / 先后点两种标记的产物）。
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
 * `~~~text~~~`：两侧各恰好三个 `~`（第四个 `~` 不跟），内容非空且同行。
 * @param {string} text
 * @param {{ from: number, to: number }[]} [excludeRanges]
 * @returns {{ from: number, to: number, type: 'UnderlineStrike' }[]}
 */
function findTripleTildeRanges(text, excludeRanges) {
  const src = text == null ? '' : String(text);
  const n = src.length;
  /** @type {{ from: number, to: number, type: 'UnderlineStrike' }[]} */
  const ranges = [];
  let i = 0;
  while (i < n) {
    if (
      src.charAt(i) === '~' &&
      src.charAt(i + 1) === '~' &&
      src.charAt(i + 2) === '~' &&
      src.charAt(i + 3) !== '~'
    ) {
      let j = i + 3;
      let close = -1;
      while (j < n) {
        const c = src.charAt(j);
        if (c === '\n' || c === '\r') break;
        if (
          c === '~' &&
          src.charAt(j + 1) === '~' &&
          src.charAt(j + 2) === '~' &&
          src.charAt(j + 3) !== '~'
        ) {
          close = j;
          break;
        }
        j += 1;
      }
      if (close > i + 3) {
        const from = i;
        const to = close + 3;
        if (!overlapsExclude(from, to, excludeRanges || [])) {
          ranges.push({ from: from, to: to, type: 'UnderlineStrike' });
        }
        i = to;
        continue;
      }
    }
    i += 1;
  }
  return ranges;
}

/**
 * @param {string} text
 * @param {{ from: number, to: number }[]} [excludeRanges]
 * @returns {{ from: number, to: number, type: 'Underline' }[]}
 */
function findUnderlineRanges(text, excludeRanges) {
  const src = text == null ? '' : String(text);
  const n = src.length;
  const triples = findTripleTildeRanges(src, excludeRanges);
  /** @type {{ from: number, to: number, type: 'Underline' }[]} */
  const ranges = [];
  for (let t = 0; t < triples.length; t++) {
    const tr = triples[t];
    ranges.push({ from: tr.from, to: tr.to, type: 'Underline' });
  }
  let i = 0;
  while (i < n) {
    let inTriple = false;
    for (let t = 0; t < triples.length; t++) {
      if (i >= triples[t].from && i < triples[t].to) {
        i = triples[t].to;
        inTriple = true;
        break;
      }
    }
    if (inTriple) continue;

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
        let skipTriple = false;
        for (let t = 0; t < triples.length; t++) {
          if (j >= triples[t].from && j < triples[t].to) {
            j = triples[t].to;
            skipTriple = true;
            break;
          }
        }
        if (skipTriple) continue;
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
 * 叠套段上的删除线区段（内层 `~~…~~`）。
 * @param {{ from: number, to: number }} triple
 * @returns {{ open: {from:number,to:number}, content: {from:number,to:number}, close: {from:number,to:number} }}
 */
function strikeSpansInTriple(triple) {
  return {
    open: { from: triple.from + 1, to: triple.from + 3 },
    content: { from: triple.from + 3, to: triple.to - 3 },
    close: { from: triple.to - 3, to: triple.to - 1 },
  };
}

/**
 * 叠套段上的下划线区段（外层单 `~`；内容为可见正文，不含内层 `~~`）。
 * @param {{ from: number, to: number }} triple
 */
function underlineSpansInTriple(triple) {
  return {
    open: { from: triple.from, to: triple.from + 1 },
    content: { from: triple.from + 3, to: triple.to - 3 },
    close: { from: triple.to - 1, to: triple.to },
  };
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
  findTripleTildeRanges: findTripleTildeRanges,
  strikeSpansInTriple: strikeSpansInTriple,
  underlineSpansInTriple: underlineSpansInTriple,
  isSingleTildeWrapped: isSingleTildeWrapped,
  isSingleTildeAt: isSingleTildeAt,
  overlapsExclude: overlapsExclude,
};

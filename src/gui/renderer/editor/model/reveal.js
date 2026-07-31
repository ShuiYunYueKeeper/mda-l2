/**
 * P2 §4.2 显露判定（纯函数）：根据光标位置计算需显露语法标记的区间。
 */
'use strict';

const BLOCK_TYPES = {
  ATXHeading1: 1,
  ATXHeading2: 1,
  ATXHeading3: 1,
  ATXHeading4: 1,
  ATXHeading5: 1,
  ATXHeading6: 1,
  Paragraph: 1,
  Blockquote: 1,
  BulletList: 1,
  OrderedList: 1,
  ListItem: 1,
  Task: 1,
  FencedCode: 1,
  CodeBlock: 1,
  HorizontalRule: 1,
  SetextHeading1: 1,
  SetextHeading2: 1,
  Table: 1,
  TableRow: 1,
  TableCell: 1,
  TableHeader: 1,
};

/**
 * @param {{ from: number, to: number }[]} ranges
 * @returns {{ from: number, to: number }[]}
 */
function mergeOverlaps(ranges) {
  if (!ranges.length) return [];
  const sorted = ranges.slice().sort(function (a, b) {
    return a.from - b.from || a.to - b.to;
  });
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur.from <= prev.to) {
      prev.to = Math.max(prev.to, cur.to);
    } else {
      out.push({ from: cur.from, to: cur.to });
    }
  }
  return out;
}

/**
 * @param {number} pos
 * @param {{ from: number, to: number }[]} ranges
 */
function isPosInRanges(pos, ranges) {
  for (let i = 0; i < ranges.length; i++) {
    if (pos >= ranges[i].from && pos <= ranges[i].to) return true;
  }
  return false;
}

/**
 * @param {{ from: number, to: number }} node
 * @param {{ from: number, to: number }[]} revealRanges
 */
function isRevealed(node, revealRanges) {
  if (!revealRanges || !revealRanges.length) return false;
  // 节点与任一显露区间有交集 → 显露（聚焦块内的行内标记一并显示）
  for (let i = 0; i < revealRanges.length; i++) {
    const r = revealRanges[i];
    if (node.to > r.from && node.from < r.to) return true;
  }
  return false;
}

/**
 * @param {object} opts
 * @param {number} opts.docLength
 * @param {{ from: number, to: number, empty?: boolean }[]} opts.selectionRanges
 * @param {'block'|'nearby'|'never'} [opts.granularity]
 * @param {(pos: number) => { from: number, to: number } | null} opts.enclosingBlock
 * @param {(pos: number, pad: number) => { from: number, to: number }} [opts.lineRangeAround]
 * @param {boolean} [opts.composing]
 * @param {{ from: number, to: number }[]} [opts.lastRevealRanges]
 * @returns {{ from: number, to: number }[]}
 */
function computeRevealRanges(opts) {
  const granularity = opts.granularity || 'never';
  if (opts.composing && opts.lastRevealRanges) {
    return opts.lastRevealRanges;
  }
  if (granularity === 'never') return [];

  const ranges = [];
  const sels = opts.selectionRanges || [];
  for (let i = 0; i < sels.length; i++) {
    const sel = sels[i];
    const head = typeof sel.head === 'number' ? sel.head : sel.to;
    if (granularity === 'nearby' && typeof opts.lineRangeAround === 'function') {
      ranges.push(opts.lineRangeAround(head, 1));
    } else if (typeof opts.enclosingBlock === 'function') {
      const blk = opts.enclosingBlock(head);
      if (blk) ranges.push(blk);
      else ranges.push({ from: head, to: head });
    }
  }
  return mergeOverlaps(ranges);
}

/**
 * 从语法树游标解析 enclosing block（供视图层注入）。
 * @param {import('@lezer/common').Tree} tree
 * @param {number} pos
 * @param {number} docLength
 */
function enclosingBlockFromTree(tree, pos, docLength) {
  let best = null;
  tree.iterate({
    enter(node) {
      if (pos < node.from || pos > node.to) return false;
      if (BLOCK_TYPES[node.name]) {
        best = { from: node.from, to: node.to, type: node.name };
      }
    },
  });
  if (best) return best;
  return { from: Math.max(0, pos), to: Math.min(docLength, pos) };
}

function readRevealGranularity() {
  try {
    var v = localStorage.getItem('mda-live-reveal');
    if (v === 'nearby' || v === 'never' || v === 'block') return v;
  } catch (_) { /* ignore */ }
  return 'never';
}

function writeRevealGranularity(value) {
  var allowed = ['block', 'nearby', 'never'];
  var v = allowed.indexOf(value) >= 0 ? value : 'never';
  try {
    localStorage.setItem('mda-live-reveal', v);
  } catch (_) { /* ignore */ }
  return v;
}

module.exports = {
  mergeOverlaps: mergeOverlaps,
  isPosInRanges: isPosInRanges,
  isRevealed: isRevealed,
  computeRevealRanges: computeRevealRanges,
  enclosingBlockFromTree: enclosingBlockFromTree,
  BLOCK_TYPES: BLOCK_TYPES,
  REVEAL_STORAGE_KEY: 'mda-live-reveal',
  REVEAL_GRANULARITIES: ['block', 'nearby', 'never'],
  readRevealGranularity: readRevealGranularity,
  writeRevealGranularity: writeRevealGranularity,
};

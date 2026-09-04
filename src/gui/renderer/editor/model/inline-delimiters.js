/**
 * 行内成对定界符编辑（纯函数，无 DOM / 无 EditorView）。
 *
 * 预览模式下定界符始终隐藏（D15），用户看到的是「可见文本」。因此所有编辑都必须保证：
 * 编辑后不残留任何**会被渲染出来**的定界符——相邻同类样式段一律**融合**，空内容样式段一律清除。
 */
'use strict';

const { ChangeSet } = require('@codemirror/state');

/**
 * @typedef {{ from: number, to: number }} Span
 * @typedef {{ key: string, open: Span, content: Span, close: Span }} MarkRegion
 * @typedef {{ from: number, to: number, insert: string }} Change
 */

/**
 * @param {Change[]} changes
 * @returns {Change[]}
 */
function sortChanges(changes) {
  return changes.slice().sort(function (a, b) {
    if (a.from !== b.from) return a.from - b.from;
    return a.to - b.to;
  });
}

/**
 * 纯插入与等长删除相抵时抵消，避免产生「删了又插同样内容」的空转变更。
 * @param {Change[]} changes
 * @returns {Change[]}
 */
function pruneNoopChanges(changes) {
  const out = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (c.from === c.to && !c.insert) continue;
    out.push(c);
  }
  return out;
}

/**
 * @param {Change[]} changes
 * @param {number} docLength
 */
function toChangeSet(changes, docLength) {
  return ChangeSet.of(sortChanges(pruneNoopChanges(changes)), docLength);
}

/**
 * @param {Span[]} spans
 * @param {number} from
 * @param {number} to
 */
function spanCoveredBy(spans, from, to) {
  if (to <= from) return true;
  let cur = from;
  let moved = true;
  while (moved && cur < to) {
    moved = false;
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (s.from <= cur && s.to > cur) {
        cur = s.to;
        moved = true;
        break;
      }
    }
  }
  return cur >= to;
}

/**
 * 选区端点不得落在定界符内部，否则包裹/取消会切碎定界符。
 * @param {Span[]} runs 全部定界符 run（任意标记类型）
 * @param {number} from
 * @param {number} to
 * @returns {{ from: number, to: number }}
 */
function snapOutOfDelimiters(runs, from, to) {
  let a = from;
  let b = to;
  let moved = true;
  while (moved) {
    moved = false;
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (r.from < a && a < r.to) {
        a = r.from;
        moved = true;
      }
      if (r.from < b && b < r.to) {
        b = r.to;
        moved = true;
      }
    }
  }
  return { from: a, to: b };
}

/**
 * @param {Span[]} out
 * @param {Span} span
 * @param {number} lo
 * @param {number} hi
 */
function pushClipped(out, span, lo, hi) {
  if (!span) return;
  const a = Math.max(lo, span.from);
  const b = Math.min(hi, span.to);
  if (b > a) out.push({ from: a, to: b });
}

/**
 * 删除区间与样式段的关系有三种，处理方式各不相同：
 * ① 整对定界符都在区间内 → 连定界符一起删；
 * ② 内容被整段覆盖、定界符在区间外 → 把定界符也吃进来，避免留下空定界符对；
 * ③ 只覆盖一侧定界符 → **原样保留**该定界符，否则另一侧会裸露出来。
 *
 * 定界符在预览里不可见，用户「看到」自己只选了正文，所以③绝不能反过来撑到整对
 * （那会把没被选中的可见文字一起删掉）。
 *
 * ② 只适用于**纯删除**：若区间会被新文本替换（粘贴、替换输入），掏空的样式段随即
 * 又被填满，此时删掉定界符等于顺手取消了用户的样式，须用 collapseEmptied=false。
 *
 * @param {MarkRegion[]} regions
 * @param {number} from
 * @param {number} to
 * @param {boolean} [collapseEmptied=true]
 * @returns {{ from: number, to: number }[]} 实际要删除的区间（升序、互不相交）
 */
function planDeleteRangePreservingPairs(regions, from, to, collapseEmptied) {
  let lo = Math.min(from, to);
  let hi = Math.max(from, to);
  if (hi <= lo) return [];
  const collapse = collapseEmptied !== false;

  /** @type {MarkRegion[]} */
  const list = [];
  for (let i = 0; i < (regions || []).length; i++) {
    const r = regions[i];
    if (r && r.open && r.content && r.close) list.push(r);
  }

  // ②：内容被整段覆盖时把定界符也纳入（嵌套样式段需迭代到稳定）
  let grew = collapse;
  let guard = 0;
  while (grew && guard++ < 16) {
    grew = false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (lo > r.content.from || r.content.to > hi) continue;
      if (r.open.from < lo) {
        lo = r.open.from;
        grew = true;
      }
      if (r.close.to > hi) {
        hi = r.close.to;
        grew = true;
      }
    }
  }

  /** @type {Span[]} */
  const keep = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (lo <= r.open.from && r.close.to <= hi) continue;
    pushClipped(keep, r.open, lo, hi);
    pushClipped(keep, r.close, lo, hi);
  }
  if (!keep.length) return [{ from: lo, to: hi }];

  keep.sort(function (a, b) {
    return a.from - b.from;
  });
  /** @type {{ from: number, to: number }[]} */
  const out = [];
  let cur = lo;
  for (let i = 0; i < keep.length; i++) {
    const k = keep[i];
    if (k.from > cur) out.push({ from: cur, to: k.from });
    if (k.to > cur) cur = k.to;
  }
  if (cur < hi) out.push({ from: cur, to: hi });
  return out;
}

/**
 * 融合包裹：把 [from,to) 变成该标记的样式段。与之相交**或紧邻**的同类样式段一并吸收，
 * 只留一对定界符，杜绝 `**A****B**` 这类相邻定界符泄漏。
 *
 * @param {string} text 全文
 * @param {MarkRegion[]} regions 同一标记的全部样式段
 * @param {number} from
 * @param {number} to
 * @param {string} delim 定界符（开闭同串）
 * @returns {{ changes: Change[], select: { from: number, to: number } } | null}
 */
function planFusedWrap(text, regions, from, to, delim) {
  if (to <= from || !delim) return null;
  let lo = from;
  let hi = to;
  /** @type {MarkRegion[]} */
  const absorbed = [];
  const taken = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < regions.length; i++) {
      if (taken[i]) continue;
      const r = regions[i];
      // 紧邻也算相交：close.to === lo 或 open.from === hi 时必须融合
      if (r.close.to < lo || r.open.from > hi) continue;
      taken[i] = true;
      absorbed.push(r);
      if (r.open.from < lo) lo = r.open.from;
      if (r.close.to > hi) hi = r.close.to;
      grew = true;
    }
  }

  /** @type {Span[]} */
  const drops = [];
  for (let i = 0; i < absorbed.length; i++) {
    drops.push(absorbed[i].open);
    drops.push(absorbed[i].close);
  }
  drops.sort(function (a, b) {
    return a.from - b.from;
  });

  let inner = '';
  let cur = lo;
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    if (d.to <= cur || d.from >= hi) continue;
    if (d.from > cur) inner += text.slice(cur, d.from);
    cur = d.to;
  }
  if (cur < hi) inner += text.slice(cur, hi);

  // 空内容不产生定界符对（否则渲染出裸 `****`）
  if (!inner) return null;
  const insert = delim + inner + delim;
  if (insert === text.slice(lo, hi)) return null;
  return {
    changes: [{ from: lo, to: hi, insert: insert }],
    select: { from: lo + delim.length, to: lo + delim.length + inner.length },
  };
}

/**
 * 拆分取消：把 [from,to) 从所属样式段中摘出来，两侧剩余部分保持样式。
 * 剩余部分为空则整对定界符删除，绝不留下空定界符对。
 *
 * @param {string} text
 * @param {MarkRegion[]} regions 同一标记的全部样式段
 * @param {number} from
 * @param {number} to
 * @returns {{ changes: Change[], select: { from: number, to: number } } | null}
 */
function planSplitUnwrap(text, regions, from, to) {
  if (to <= from) return null;
  /** @type {Change[]} */
  const changes = [];
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const wholeInside = r.open.from >= from && r.close.to <= to;
    const contentHit = r.content.from < to && r.content.to > from;
    if (!wholeInside && !contentHit) continue;

    const a = Math.max(from, r.content.from);
    const b = Math.min(to, r.content.to);
    if (b <= a) continue;
    const delim = text.slice(r.open.from, r.open.to);
    const leftKeep = a > r.content.from;
    const rightKeep = b < r.content.to;

    if (leftKeep) changes.push({ from: a, to: a, insert: delim });
    else changes.push({ from: r.open.from, to: r.open.to, insert: '' });
    if (rightKeep) changes.push({ from: b, to: b, insert: delim });
    else changes.push({ from: r.close.from, to: r.close.to, insert: '' });
  }
  if (!changes.length) return null;
  const set = toChangeSet(changes, text.length);
  return {
    changes: changes,
    // 左侧闭合定界符插在 from 处 → 选区起点落到它之后；右侧开定界符插在 to 处 → 终点落到它之前
    select: { from: set.mapPos(from, 1), to: set.mapPos(to, -1) },
  };
}

/**
 * 清理：空内容样式段整对删除；相邻同类样式段融合（删掉贴在一起的闭+开定界符）。
 * regions 必须是**当前文本**坐标下的样式段（编辑后由旧区段映射而来）。
 *
 * @param {MarkRegion[]} regions
 * @returns {Change[]}
 */
function planRegionCleanup(regions) {
  /** @type {Span[]} */
  const drops = [];
  const dead = [];
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (!r || !r.open || !r.close) continue;
    const openLen = r.open.to - r.open.from;
    const closeLen = r.close.to - r.close.from;
    // 定界符长度变了 = 这次变更**自己重写了**这对定界符（待输入插入、IME 上屏都会）。
    // 此时区段的新形态由变更方负责，清理必须回避：拿变更前的坐标去判，
    // 会把刚写进去的定界符当成残余删掉（曾导致整段样式连同新输入一起消失）。
    const openMoved = r.openLen != null && openLen !== r.openLen;
    const closeMoved = r.closeLen != null && closeLen !== r.closeLen;
    if (openMoved || closeMoved) {
      dead[i] = true;
      continue;
    }
    if (openLen <= 0 || closeLen <= 0) {
      dead[i] = true;
      continue;
    }
    if (r.content.to <= r.content.from) {
      drops.push(r.open, r.close);
      dead[i] = true;
    }
  }

  /** @type {Record<string, MarkRegion[]>} */
  const byKey = {};
  for (let i = 0; i < regions.length; i++) {
    if (dead[i]) continue;
    const r = regions[i];
    if (!byKey[r.key]) byKey[r.key] = [];
    byKey[r.key].push(r);
  }
  const keys = Object.keys(byKey);
  for (let k = 0; k < keys.length; k++) {
    const list = byKey[keys[k]].slice().sort(function (a, b) {
      return a.open.from - b.open.from;
    });
    for (let i = 0; i + 1 < list.length; i++) {
      const A = list[i];
      const B = list[i + 1];
      if (A.close.to - A.close.from !== B.open.to - B.open.from) continue;
      // 中间只剩已被删掉的定界符时同样算「紧邻」
      if (!spanCoveredBy(drops, A.close.to, B.open.from)) continue;
      drops.push(A.close, B.open);
    }
  }

  /** @type {Change[]} */
  const changes = [];
  const seen = {};
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    if (!d || d.to <= d.from) continue;
    const id = d.from + ':' + d.to;
    if (seen[id]) continue;
    seen[id] = true;
    changes.push({ from: d.from, to: d.to, insert: '' });
  }
  return sortChanges(changes);
}

/**
 * 跳过隐藏定界符：定界符在预览里不可见，光标「贴着」它时删除必须作用到可见字符。
 * @param {Span[]} runs
 * @param {number} pos
 * @param {boolean} forward
 */
function skipHiddenRuns(runs, pos, forward) {
  let p = pos;
  let moved = true;
  let guard = 0;
  while (moved && guard++ < 64) {
    moved = false;
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (r.to <= r.from) continue;
      if (forward ? r.from === p : r.to === p) {
        p = forward ? r.to : r.from;
        moved = true;
        break;
      }
    }
  }
  return p;
}

module.exports = {
  sortChanges: sortChanges,
  pruneNoopChanges: pruneNoopChanges,
  toChangeSet: toChangeSet,
  snapOutOfDelimiters: snapOutOfDelimiters,
  planDeleteRangePreservingPairs: planDeleteRangePreservingPairs,
  planFusedWrap: planFusedWrap,
  planSplitUnwrap: planSplitUnwrap,
  planRegionCleanup: planRegionCleanup,
  skipHiddenRuns: skipHiddenRuns,
  spanCoveredBy: spanCoveredBy,
};

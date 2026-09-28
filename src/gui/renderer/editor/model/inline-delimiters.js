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
 * 格式化用：把落在定界符上（含端点）的选区端点推进到可见内容内。
 * 预览拖选后左缘常被校准到开定界符外侧，若直接包裹会把 `**` 吃进新样式
 * （`~~**能打开~~…**`），整段加粗被拆坏。
 * @param {Span[]} runs
 * @param {number} from
 * @param {number} to
 * @returns {{ from: number, to: number }}
 */
function snapIntoMarkContent(runs, from, to) {
  let a = Math.min(from, to);
  let b = Math.max(from, to);
  let moved = true;
  let guard = 0;
  while (moved && guard++ < 64) {
    moved = false;
    for (let i = 0; i < (runs || []).length; i++) {
      const r = runs[i];
      if (!r || r.to <= r.from) continue;
      // 左端落在定界符上（含起点）→ 推到定界符右侧（内容侧）
      if (a >= r.from && a < r.to) {
        a = r.to;
        moved = true;
      }
      // 右端落在定界符上（含终点）→ 推到定界符左侧
      if (b > r.from && b <= r.to) {
        b = r.from;
        moved = true;
      }
    }
  }
  if (b < a) b = a;
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
 * CommonMark flanking：开定界符右邻为标点、左邻为文字时不能开启（闭定界符对称），
 * 于是 `能打开**、能看懂**` 每对都配对却渲染出裸 `**`，`**甲、**乙**、丙**` 更会被
 * 重新配对成外层强调。`*` / `**` / `~~` 受此约束；自定义 `~` 下划线与行内代码不受。
 * 标点判定与 @lezer/markdown 保持一致（`\p{S}` / `\p{P}`）。
 */
const PUNCT_RE = /[\p{S}\p{P}]/u;
const SPACE_RE = /\s/;
/** Markdown 语法字符挪动后会改变其它结构的解析，不参与让位 */
const SYNTAX_CHARS = '*_~`[]()<>!\\|&#';

/** @param {string} delim */
function needsFlanking(delim) {
  return delim === '*' || delim === '**' || delim === '~~';
}

/** @param {string} ch */
function charKind(ch) {
  if (!ch || SPACE_RE.test(ch)) return 'space';
  return PUNCT_RE.test(ch) ? 'punct' : 'word';
}

/** @param {string} before @param {string} after */
function canOpenBetween(before, after) {
  const a = charKind(after);
  return a !== 'space' && (a !== 'punct' || charKind(before) !== 'word');
}

/** @param {string} before @param {string} after */
function canCloseBetween(before, after) {
  const b = charKind(before);
  return b !== 'space' && (b !== 'punct' || charKind(after) !== 'word');
}

/** 定界符可以让到其外侧的字符：空白与非语法标点 */
function isYieldable(ch) {
  return !!ch && charKind(ch) !== 'word' && SYNTAX_CHARS.indexOf(ch) < 0;
}

/** @param {string} text @param {number} pos */
function charBefore(text, pos) {
  if (pos <= 0) return '';
  const lo = text.charCodeAt(pos - 1);
  if (pos >= 2 && lo >= 0xdc00 && lo <= 0xdfff) {
    const hi = text.charCodeAt(pos - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) return text.slice(pos - 2, pos);
  }
  return text.charAt(pos - 1);
}

/** @param {string} text @param {number} pos */
function charAfter(text, pos) {
  if (pos >= text.length) return '';
  const cp = text.codePointAt(pos);
  return cp == null ? '' : String.fromCodePoint(cp);
}

/**
 * 在 pos 插入闭定界符、样式段内容起于 floor 时，把 pos 向左让过内容尾部的标点/空白直到闭定界符成立。
 * 返回 floor 表示残段只剩标点，整对应删除。
 * @param {string} text @param {number} pos @param {number} floor
 */
function yieldCloseLeft(text, pos, floor) {
  let p = pos;
  let after = charAfter(text, pos);
  while (p > floor) {
    const before = charBefore(text, p);
    if (canCloseBetween(before, after) || !isYieldable(before)) break;
    p -= before.length;
    after = before;
  }
  return p;
}

/**
 * 在 pos 插入开定界符、样式段内容止于 ceil 时，把 pos 向右让过内容头部的标点/空白直到开定界符成立。
 * @param {string} text @param {number} pos @param {number} ceil
 */
function yieldOpenRight(text, pos, ceil) {
  let p = pos;
  let before = charBefore(text, pos);
  while (p < ceil) {
    const after = charAfter(text, p);
    if (canOpenBetween(before, after) || !isYieldable(after)) break;
    p += after.length;
    before = after;
  }
  return p;
}

/**
 * [a,b) 之间只剩可让位的标点/空白（含空区间）。用于隔着顿号融合，避免
 * `**能打开**、**能看懂**` 这种「取消再加粗」拆成两段。
 * @param {string} text
 * @param {number} a
 * @param {number} b
 */
function isYieldableGap(text, a, b) {
  if (b < a) return false;
  if (a === b) return true;
  let p = a;
  while (p < b) {
    const ch = charAfter(text, p);
    if (!ch || !isYieldable(ch)) return false;
    p += ch.length;
  }
  return true;
}

/**
 * @param {MarkRegion} r
 * @param {number} lo
 * @param {number} hi
 * @param {string} text
 */
function regionTouchesWrap(r, lo, hi, text) {
  if (r.close.to >= lo && r.open.from <= hi) return true;
  if (r.close.to < lo && isYieldableGap(text, r.close.to, lo)) return true;
  if (r.open.from > hi && isYieldableGap(text, hi, r.open.from)) return true;
  return false;
}

/**
 * [lo,hi) 去掉定界符后，原文 pos 对应的可见偏移。
 * @param {string} text
 * @param {number} lo
 * @param {number} hi
 * @param {Span[]} drops
 * @param {number} pos
 */
function visibleOffsetInRange(text, lo, hi, drops, pos) {
  const p = pos < lo ? lo : pos > hi ? hi : pos;
  let vis = 0;
  let cur = lo;
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    if (d.to <= lo || d.from >= hi) continue;
    const a = Math.max(cur, d.from);
    const b = Math.min(hi, d.to);
    if (b <= a) continue;
    if (p <= a) return vis + (p - cur);
    if (a > cur) vis += a - cur;
    cur = Math.max(cur, b);
  }
  return vis + Math.max(0, p - cur);
}

/**
 * 可见偏移映到 `lead + delim + inner + delim + trail` 替换后的原文坐标。
 * @param {number} vis
 * @param {number} lo
 * @param {number} leadLen
 * @param {number} innerLen
 * @param {number} delimLen
 */
function mapVisibleIntoWrap(vis, lo, leadLen, innerLen, delimLen) {
  if (vis < leadLen) return lo + vis;
  const inInner = vis - leadLen;
  if (inInner <= innerLen) return lo + leadLen + delimLen + inInner;
  return lo + leadLen + delimLen + innerLen + delimLen + (inInner - innerLen);
}

/**
 * 融合包裹：把 [from,to) 变成该标记的样式段。与之相交、紧邻、或只隔可让位标点
 * 的同类样式段一并吸收，只留一对定界符，杜绝 `**A****B**` / `**A**、**B**`。
 * 选区钉在调用方传入的 [from,to)，不随融合范围撑开。
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
      if (!regionTouchesWrap(r, lo, hi, text)) continue;
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

  // 选区首尾的标点/空白会让定界符无法成立，让到定界符外侧（`、**能看懂**`）
  let lead = '';
  let trail = '';
  if (needsFlanking(delim) && inner) {
    const beforeCh = charBefore(text, lo);
    const s =
      yieldOpenRight(beforeCh + inner, beforeCh.length, beforeCh.length + inner.length) -
      beforeCh.length;
    lead = inner.slice(0, s);
    inner = inner.slice(s);
    const e = yieldCloseLeft(inner + charAfter(text, hi), inner.length, 0);
    trail = inner.slice(e);
    inner = inner.slice(0, e);
  }

  // 空内容不产生定界符对（否则渲染出裸 `****`）
  if (!inner) return null;
  const insert = lead + delim + inner + delim + trail;
  if (insert === text.slice(lo, hi)) return null;
  const userA = visibleOffsetInRange(text, lo, hi, drops, from);
  const userB = visibleOffsetInRange(text, lo, hi, drops, to);
  return {
    changes: [{ from: lo, to: hi, insert: insert }],
    select: {
      from: mapVisibleIntoWrap(userA, lo, lead.length, inner.length, delim.length),
      to: mapVisibleIntoWrap(userB, lo, lead.length, inner.length, delim.length),
    },
  };
}

/**
 * 相交或套叠的同类样式段并成一组（紧邻但不重叠的 `**A****B**` 仍各自独立）。
 * @param {MarkRegion[]} regions
 * @returns {MarkRegion[][]}
 */
function overlappingRegionGroups(regions) {
  /** @type {MarkRegion[]} */
  const items = [];
  for (let i = 0; i < (regions || []).length; i++) {
    const r = regions[i];
    if (r && r.open && r.close) items.push(r);
  }
  const used = [];
  /** @type {MarkRegion[][]} */
  const groups = [];
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue;
    const group = [items[i]];
    used[i] = true;
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < items.length; j++) {
        if (used[j]) continue;
        const r = items[j];
        let hit = false;
        for (let k = 0; k < group.length; k++) {
          const g = group[k];
          if (g.open.from < r.close.to && r.open.from < g.close.to) {
            hit = true;
            break;
          }
        }
        if (!hit) continue;
        used[j] = true;
        group.push(r);
        grew = true;
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * 把 [lo,hi) 里挖掉定界符后的可见文本，以及原文坐标 → 可见坐标。
 * @param {string} text
 * @param {number} lo
 * @param {number} hi
 * @param {Span[]} delimSpans
 */
function visibleSlice(text, lo, hi, delimSpans) {
  /** @type {Span[]} */
  const cuts = [];
  for (let i = 0; i < delimSpans.length; i++) {
    const a = Math.max(lo, delimSpans[i].from);
    const b = Math.min(hi, delimSpans[i].to);
    if (b > a) cuts.push({ from: a, to: b });
  }
  cuts.sort(function (a, b) {
    return a.from - b.from;
  });
  /** @type {Span[]} */
  const merged = [];
  for (let i = 0; i < cuts.length; i++) {
    const c = cuts[i];
    const last = merged.length ? merged[merged.length - 1] : null;
    if (last && c.from <= last.to) {
      if (c.to > last.to) last.to = c.to;
    } else {
      merged.push({ from: c.from, to: c.to });
    }
  }
  /** @type {{ origFrom: number, origTo: number, visFrom: number }[]} */
  const segs = [];
  let visible = '';
  let cur = lo;
  for (let i = 0; i < merged.length; i++) {
    const c = merged[i];
    if (c.from > cur) {
      segs.push({ origFrom: cur, origTo: c.from, visFrom: visible.length });
      visible += text.slice(cur, c.from);
    }
    cur = Math.max(cur, c.to);
  }
  if (cur < hi) {
    segs.push({ origFrom: cur, origTo: hi, visFrom: visible.length });
    visible += text.slice(cur, hi);
  }
  /**
   * @param {number} pos
   */
  function origToVis(pos) {
    if (pos <= lo) return 0;
    if (pos >= hi) return visible.length;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (pos < s.origFrom) return s.visFrom;
      if (pos <= s.origTo) return s.visFrom + (pos - s.origFrom);
    }
    return visible.length;
  }
  return { visible: visible, origToVis: origToVis };
}

/**
 * 拆分取消：把 [from,to) 从所属样式段中摘出来，两侧剩余部分保持样式。
 * 剩余部分为空则整对定界符删除，绝不留下空定界符对。
 *
 * 套叠/残留的同类定界符（`****能打开**、**能看懂**、……**`）先按**可见文本**摊平再切：
 * 切口落在内层 `**` 上时，若仍按原文坐标让位，会把内层定界符留在可见区。
 *
 * @param {string} text
 * @param {MarkRegion[]} regions 同一标记或多种标记（清除格式）的样式段
 * @param {number} from
 * @param {number} to
 * @returns {{ changes: Change[], select: { from: number, to: number } } | null}
 */
function planSplitUnwrap(text, regions, from, to) {
  if (to <= from) return null;
  /** @type {Record<string, MarkRegion[]>} */
  const byKey = {};
  for (let i = 0; i < (regions || []).length; i++) {
    const r = regions[i];
    if (!r || !r.open || !r.close) continue;
    const key = r.key || '';
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(r);
  }
  /** @type {(Change & { leftWrapLen?: number, selOffset?: number, selLen?: number })[]} */
  const changes = [];
  const keys = Object.keys(byKey);
  for (let k = 0; k < keys.length; k++) {
    const groups = overlappingRegionGroups(byKey[keys[k]]);
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      let lo = group[0].open.from;
      let hi = group[0].close.to;
      /** @type {Span[]} */
      const delims = [];
      for (let i = 0; i < group.length; i++) {
        const r = group[i];
        if (r.open.from < lo) lo = r.open.from;
        if (r.close.to > hi) hi = r.close.to;
        delims.push(r.open, r.close);
      }
      const hits = from < hi && to > lo;
      if (!hits) continue;
      const delim = text.slice(group[0].open.from, group[0].open.to);
      if (!delim) continue;
      const slice = visibleSlice(text, lo, hi, delims);
      if (!slice.visible) continue;
      let va = slice.origToVis(Math.max(from, lo));
      let vb = slice.origToVis(Math.min(to, hi));
      if (vb <= va) continue;
      // 让位只改文档切口，选区仍钉在用户点的可见文字上，否则「能打开」会扩成「能打开、」
      // 再点一次加粗就会和后面的样式段贴上融成整句。
      const userVa = va;
      const userVb = vb;
      if (needsFlanking(delim)) {
        if (va > 0) va = yieldCloseLeft(slice.visible, va, 0);
        if (vb < slice.visible.length) vb = yieldOpenRight(slice.visible, vb, slice.visible.length);
      }
      const left = slice.visible.slice(0, va);
      const mid = slice.visible.slice(va, vb);
      const right = slice.visible.slice(vb);
      const leftWrap = left ? delim + left + delim : '';
      const rightWrap = right ? delim + right + delim : '';
      const insert = leftWrap + mid + rightWrap;
      if (insert === text.slice(lo, hi)) continue;
      const selOffset = Math.max(0, userVa - va);
      const selEnd = Math.min(mid.length, Math.max(selOffset, userVb - va));
      changes.push({
        from: lo,
        to: hi,
        insert: insert,
        leftWrapLen: leftWrap.length,
        selOffset: selOffset,
        selLen: selEnd - selOffset,
      });
    }
  }
  if (!changes.length) return null;
  changes.sort(function (a, b) {
    return a.from - b.from;
  });
  let selFrom = null;
  let selTo = null;
  let shift = 0;
  for (let i = 0; i < changes.length; i++) {
    const ch = changes[i];
    const midFrom = ch.from + shift + (ch.leftWrapLen || 0);
    const a = midFrom + (ch.selOffset || 0);
    const b = a + (ch.selLen || 0);
    if (selFrom == null) selFrom = a;
    selTo = b;
    shift += ch.insert.length - (ch.to - ch.from);
    delete ch.leftWrapLen;
    delete ch.selOffset;
    delete ch.selLen;
  }
  return {
    changes: changes,
    select: { from: selFrom, to: selTo },
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

/**
 * 下划线 `~` 与删除线 `~~` 叠套必须走专用路径：朴素再包一层会得到 `~~~text~~~`，
 * 但拆分取消若按「可见切片」处理会把内层 `~~` 当成正文拆坏。
 * 约定形态：`~~~text~~~` = 外层下划线 + 内层删除线。
 *
 * @param {string} text
 * @param {MarkRegion[]} underlineRegions
 * @param {MarkRegion[]} strikeRegions
 * @param {number} from
 * @param {number} to
 * @param {'underline'|'strike'} markKey
 * @param {boolean} fullyOn
 * @returns {{ changes: Change[], select: Span } | null}
 */
function planCombinedTildeToggle(text, underlineRegions, strikeRegions, from, to, markKey, fullyOn) {
  if (markKey !== 'underline' && markKey !== 'strike') return null;
  const src = String(text || '');
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  if (b <= a) return null;

  const { findTripleTildeRanges, underlineSpansInTriple, strikeSpansInTriple } = require('./underline');
  const triples = findTripleTildeRanges(src);

  // 取消：在叠套段上摘掉外层或内层
  for (let i = 0; i < triples.length; i++) {
    const tr = triples[i];
    const u = underlineSpansInTriple(tr);
    const s = strikeSpansInTriple(tr);
    if (b <= u.open.from || a >= u.close.to) continue;
    if (!fullyOn) continue;
    if (markKey === 'underline') {
      return {
        changes: [
          { from: u.close.from, to: u.close.to, insert: '' },
          { from: u.open.from, to: u.open.to, insert: '' },
        ],
        select: { from: s.content.from - 1, to: s.content.to - 1 },
      };
    }
    // 去掉内层 ~~，留下 ~text~
    return {
      changes: [
        { from: s.close.from, to: s.close.to, insert: '' },
        { from: s.open.from, to: s.open.to, insert: '' },
      ],
      select: { from: s.content.from - 2, to: s.content.to - 2 },
    };
  }

  if (fullyOn) return null;

  // 给已有删除线加上外层下划线
  if (markKey === 'underline') {
    for (let i = 0; i < (strikeRegions || []).length; i++) {
      const r = strikeRegions[i];
      if (!r || !r.open || !r.close || !r.content) continue;
      if (a >= r.content.from && b <= r.content.to) {
        // 选区在删除线正文内 → 包整段删除线
        return {
          changes: [
            { from: r.close.to, to: r.close.to, insert: '~' },
            { from: r.open.from, to: r.open.from, insert: '~' },
          ],
          select: { from: a + 1, to: b + 1 },
        };
      }
      if (a <= r.open.from && b >= r.close.to) {
        return {
          changes: [
            { from: r.close.to, to: r.close.to, insert: '~' },
            { from: r.open.from, to: r.open.from, insert: '~' },
          ],
          select: { from: a + 1, to: b + 1 },
        };
      }
    }
  }

  // 给已有下划线加上内层删除线
  if (markKey === 'strike') {
    for (let i = 0; i < (underlineRegions || []).length; i++) {
      const r = underlineRegions[i];
      if (!r || !r.open || !r.close || !r.content) continue;
      // 跳过已是叠套的（content 与 open 不紧邻）
      if (r.open.to !== r.content.from) continue;
      if (a >= r.content.from && b <= r.content.to) {
        return {
          changes: [
            { from: r.close.from, to: r.close.from, insert: '~~' },
            { from: r.open.to, to: r.open.to, insert: '~~' },
          ],
          select: { from: a + 2, to: b + 2 },
        };
      }
      if (a <= r.open.from && b >= r.close.to) {
        return {
          changes: [
            { from: r.close.from, to: r.close.from, insert: '~~' },
            { from: r.open.to, to: r.open.to, insert: '~~' },
          ],
          select: { from: a + 2, to: b + 2 },
        };
      }
    }
  }

  return null;
}

module.exports = {
  sortChanges: sortChanges,
  pruneNoopChanges: pruneNoopChanges,
  toChangeSet: toChangeSet,
  snapOutOfDelimiters: snapOutOfDelimiters,
  snapIntoMarkContent: snapIntoMarkContent,
  planDeleteRangePreservingPairs: planDeleteRangePreservingPairs,
  planFusedWrap: planFusedWrap,
  planSplitUnwrap: planSplitUnwrap,
  planRegionCleanup: planRegionCleanup,
  planCombinedTildeToggle: planCombinedTildeToggle,
  skipHiddenRuns: skipHiddenRuns,
  spanCoveredBy: spanCoveredBy,
};

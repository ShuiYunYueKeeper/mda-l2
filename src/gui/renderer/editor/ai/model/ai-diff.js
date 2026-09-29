/**
 * 改写结果的词级 diff（纯函数）：中文按字、英文按词、空白成段。
 * 规模超限时退化为整段删除 + 整段插入，避免 O(n·m) 卡住界面。
 */
'use strict';

const MAX_CELLS = 2000000;
const TOKEN_RE = /[A-Za-z0-9_]+|\s+|[\s\S]/g;

/** @param {string} s */
function tokenize(s) {
  return String(s || '').match(TOKEN_RE) || [];
}

/**
 * @typedef {{ op: 'eq'|'del'|'ins', text: string }} DiffOp
 */

function pushOp(out, op, text) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.op === op) last.text += text;
  else out.push({ op, text });
}

/**
 * 夹在两处改动之间、只有 1 个非空白 token 的相等段并入改动，减少中文逐字跳变的噪音。
 * @param {DiffOp[]} ops
 */
function absorbTinyEquals(ops) {
  const out = [];
  for (let i = 0; i < ops.length; i++) {
    const cur = ops[i];
    const prev = ops[i - 1];
    const next = ops[i + 1];
    const tiny = cur.op === 'eq' && prev && next && prev.op !== 'eq' && next.op !== 'eq' &&
      tokenize(cur.text).length === 1 && cur.text.trim();
    if (tiny) {
      pushOp(out, 'del', cur.text);
      pushOp(out, 'ins', cur.text);
    } else {
      pushOp(out, cur.op, cur.text);
    }
  }
  // 合并后重排：相邻 del/ins 交错时统一成「先删后插」
  const merged = [];
  let del = '';
  let ins = '';
  const flush = () => {
    pushOp(merged, 'del', del);
    pushOp(merged, 'ins', ins);
    del = '';
    ins = '';
  };
  for (const op of out) {
    if (op.op === 'del') del += op.text;
    else if (op.op === 'ins') ins += op.text;
    else {
      flush();
      pushOp(merged, 'eq', op.text);
    }
  }
  flush();
  return merged;
}

/**
 * @param {string} a 原文
 * @param {string} b 建议
 * @returns {DiffOp[]}
 */
function diffText(a, b) {
  if (a === b) return a ? [{ op: 'eq', text: a }] : [];
  const x = tokenize(a);
  const y = tokenize(b);
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const out = [];
  pushOp(out, 'eq', x.slice(0, start).join(''));
  const n = endX - start;
  const m = endY - start;
  if (n * m > MAX_CELLS) {
    pushOp(out, 'del', x.slice(start, endX).join(''));
    pushOp(out, 'ins', y.slice(start, endY).join(''));
  } else if (n === 0 || m === 0) {
    pushOp(out, 'del', x.slice(start, endX).join(''));
    pushOp(out, 'ins', y.slice(start, endY).join(''));
  } else {
    // LCS 表（Uint32 行滚动不便回溯，规模已受限，直接用完整表）
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = x[start + i] === y[start + j]
          ? dp[(i + 1) * w + j + 1] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[start + i] === y[start + j]) {
        pushOp(out, 'eq', x[start + i]);
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
        pushOp(out, 'del', x[start + i]);
        i++;
      } else {
        pushOp(out, 'ins', y[start + j]);
        j++;
      }
    }
    while (i < n) pushOp(out, 'del', x[start + i++]);
    while (j < m) pushOp(out, 'ins', y[start + j++]);
  }
  pushOp(out, 'eq', x.slice(endX).join(''));
  return absorbTinyEquals(out);
}

/**
 * 统计：用于决定是否值得展示行内 diff。
 * @param {DiffOp[]} ops
 */
function diffStats(ops) {
  let eq = 0;
  let changed = 0;
  for (const op of ops) {
    if (op.op === 'eq') eq += op.text.length;
    else changed += op.text.length;
  }
  return { eq, changed };
}

module.exports = {
  tokenize,
  diffText,
  diffStats,
};

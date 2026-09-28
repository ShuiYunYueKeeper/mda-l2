/**
 * 行内标记区域判定（头/中/尾）与待输入插入落点。
 * 与 caret-syntax-adjust 一致：leading.from / trailing.to 边界视为「处于该样式内」。
 */
'use strict';

const { syntaxTree } = require('@codemirror/language');
const { SYNTAX_RULES } = require('../model/syntax-rules');
const { findUnderlineRanges, findTripleTildeRanges, underlineSpansInTriple, strikeSpansInTriple } = require('../model/underline');
const { buildCodeFenceMask } = require('../model/parse-math');

/** @type {Record<string, string>} */
const MARK_NODE = {
  bold: 'StrongEmphasis',
  italic: 'Emphasis',
  strike: 'Strikethrough',
  code: 'InlineCode',
};

const MARK_KEYS = ['bold', 'italic', 'underline', 'strike', 'code'];

/**
 * @param {{ from: number, to: number }[]} marks
 * @param {{ from: number, to: number }} content
 */
function findLeadingMark(marks, content) {
  let leading = null;
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].to <= content.from) {
      if (!leading || marks[i].from < leading.from) leading = marks[i];
    }
  }
  return leading || (marks.length ? marks[0] : null);
}

/**
 * @param {{ from: number, to: number }[]} marks
 * @param {{ from: number, to: number }} content
 */
function findTrailingMark(marks, content) {
  let trailing = null;
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].from >= content.to) {
      if (!trailing || marks[i].to > trailing.to) trailing = marks[i];
    }
  }
  return trailing;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {{ from: number, to: number }} [window] 仅限定语法树迭代范围；围栏遮罩仍需全文
 * @returns {{ from: number, to: number }[]}
 */
function underlineExcludeRanges(state, window) {
  const text = state.doc.toString();
  const lines = [];
  for (let n = 1; n <= state.doc.lines; n++) lines.push(state.doc.line(n).text);
  const fence = buildCodeFenceMask(lines);
  /** @type {{ from: number, to: number }[]} */
  const exclude = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    if (!fence[n - 1]) continue;
    const line = state.doc.line(n);
    exclude.push({ from: line.from, to: line.to });
  }
  try {
    const tree = syntaxTree(state);
    tree.iterate({
      from: window ? window.from : undefined,
      to: window ? window.to : undefined,
      enter: function (node) {
        if (
          node.name === 'InlineCode' ||
          node.name === 'Strikethrough' ||
          node.name === 'FencedCode' ||
          node.name === 'CodeBlock'
        ) {
          exclude.push({ from: node.from, to: node.to });
        }
      },
    });
  } catch (_) {
    /* ignore */
  }
  return exclude;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {string} nodeName
 * @returns {{ leading: {from:number,to:number}, trailing: {from:number,to:number}, content: {from:number,to:number} } | null}
 */
function resolveSyntaxMarkRegion(state, pos, nodeName) {
  const rule = SYNTAX_RULES[nodeName];
  if (!rule || rule.class !== 'R' || !rule.contentRange || !rule.markRanges) return null;
  const doc = state.doc.toString();
  let tree;
  try {
    tree = syntaxTree(state);
  } catch (_) {
    return null;
  }
  /** @type {{ leading: {from:number,to:number}, trailing: {from:number,to:number}, content: {from:number,to:number} } | null} */
  let hit = null;
  tree.iterate({
    enter: function (node) {
      if (node.name !== nodeName) return;
      if (pos < node.from || pos > node.to) return;
      const adapted = { from: node.from, to: node.to, type: node.name };
      const content = rule.contentRange(adapted, doc);
      if (!content || content.from > content.to) return;
      const marks = rule.markRanges(adapted, doc) || [];
      const leading = findLeadingMark(marks, content);
      const trailing = findTrailingMark(marks, content);
      if (!leading || !trailing) return;
      if (pos < leading.from || pos > trailing.to) return;
      hit = { leading: leading, trailing: trailing, content: content };
      return false;
    },
  });
  return hit;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 */
function resolveUnderlineRegion(state, pos) {
  const text = state.doc.toString();
  const triples = findTripleTildeRanges(text);
  for (let i = 0; i < triples.length; i++) {
    const spans = underlineSpansInTriple(triples[i]);
    if (pos >= spans.open.from && pos <= spans.close.to) {
      return {
        leading: spans.open,
        trailing: spans.close,
        content: spans.content,
      };
    }
  }
  const ranges = findUnderlineRanges(text, underlineExcludeRanges(state));
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    // 叠套段已按可见正文处理，跳过全宽 Underline 回退
    let isTriple = false;
    for (let t = 0; t < triples.length; t++) {
      if (r.from === triples[t].from && r.to === triples[t].to) {
        isTriple = true;
        break;
      }
    }
    if (isTriple) continue;
    if (pos >= r.from && pos <= r.to) {
      return {
        leading: { from: r.from, to: r.from + 1 },
        trailing: { from: r.to - 1, to: r.to },
        content: { from: r.from + 1, to: r.to - 1 },
      };
    }
  }
  return null;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {string} markKey
 */
function resolveMarkRegion(state, pos, markKey) {
  if (markKey === 'underline') return resolveUnderlineRegion(state, pos);
  if (markKey === 'strike') {
    const text = state.doc.toString();
    const triples = findTripleTildeRanges(text);
    for (let i = 0; i < triples.length; i++) {
      const spans = strikeSpansInTriple(triples[i]);
      if (pos >= spans.open.from && pos <= spans.close.to) {
        return {
          leading: spans.open,
          trailing: spans.close,
          content: spans.content,
        };
      }
    }
  }
  const nodeName = MARK_NODE[markKey];
  if (!nodeName) return null;
  return resolveSyntaxMarkRegion(state, pos, nodeName);
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {string} markKey
 */
function posInMarkRegion(state, pos, markKey) {
  return !!resolveMarkRegion(state, pos, markKey);
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @returns {{ bold: boolean, italic: boolean, underline: boolean, strike: boolean, code: boolean }}
 */
function getInlineFlagsAtPos(state, pos) {
  return {
    bold: posInMarkRegion(state, pos, 'bold'),
    italic: posInMarkRegion(state, pos, 'italic'),
    underline: posInMarkRegion(state, pos, 'underline'),
    strike: posInMarkRegion(state, pos, 'strike'),
    code: posInMarkRegion(state, pos, 'code'),
  };
}

function isAdjacentGap(doc, from, to) {
  if (to < from) return false;
  if (from === to) return true;
  return /^\s*$/.test(doc.slice(from, to));
}

/**
 * 纯文本区紧邻前方的样式段（头前插入并入内容首）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {string} markKey
 */
function findMarkRegionAhead(state, pos, markKey) {
  const doc = state.doc.toString();
  if (markKey === 'underline') {
    const ranges = findUnderlineRanges(doc, underlineExcludeRanges(state));
    let hit = null;
    let best = Infinity;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      if (r.from < pos) continue;
      if (!isAdjacentGap(doc, pos, r.from)) continue;
      if (r.from >= best) continue;
      best = r.from;
      hit = {
        leading: { from: r.from, to: r.from + 1 },
        trailing: { from: r.to - 1, to: r.to },
        content: { from: r.from + 1, to: r.to - 1 },
      };
    }
    return hit;
  }
  const nodeName = MARK_NODE[markKey];
  if (!nodeName) return null;
  let tree;
  try {
    tree = syntaxTree(state);
  } catch (_) {
    return null;
  }
  /** @type {{ leading: {from:number,to:number}, trailing: {from:number,to:number}, content: {from:number,to:number} } | null} */
  let hit = null;
  let best = Infinity;
  tree.iterate({
    enter: function (node) {
      if (node.name !== nodeName) return;
      const leadFrom = node.from;
      if (leadFrom < pos) return;
      if (!isAdjacentGap(doc, pos, leadFrom)) return;
      if (leadFrom >= best) return;
      const rule = SYNTAX_RULES[nodeName];
      if (!rule || !rule.contentRange || !rule.markRanges) return;
      const adapted = { from: node.from, to: node.to, type: node.name };
      const content = rule.contentRange(adapted, doc);
      if (!content || content.from > content.to) return;
      const marks = rule.markRanges(adapted, doc) || [];
      const leading = findLeadingMark(marks, content);
      const trailing = findTrailingMark(marks, content);
      if (!leading || !trailing) return;
      best = leadFrom;
      hit = { leading: leading, trailing: trailing, content: content };
    },
  });
  return hit;
}

/**
 * 纯文本区紧邻后方的样式段（尾后插入并入内容末）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {string} markKey
 */
function findMarkRegionBehind(state, pos, markKey) {
  const doc = state.doc.toString();
  if (markKey === 'underline') {
    const ranges = findUnderlineRanges(doc, underlineExcludeRanges(state));
    let hit = null;
    let best = -1;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      if (r.to > pos) continue;
      if (!isAdjacentGap(doc, r.to, pos)) continue;
      if (r.to <= best) continue;
      best = r.to;
      hit = {
        leading: { from: r.from, to: r.from + 1 },
        trailing: { from: r.to - 1, to: r.to },
        content: { from: r.from + 1, to: r.to - 1 },
      };
    }
    return hit;
  }
  const nodeName = MARK_NODE[markKey];
  if (!nodeName) return null;
  let tree;
  try {
    tree = syntaxTree(state);
  } catch (_) {
    return null;
  }
  /** @type {{ leading: {from:number,to:number}, trailing: {from:number,to:number}, content: {from:number,to:number} } | null} */
  let hit = null;
  let best = -1;
  tree.iterate({
    enter: function (node) {
      if (node.name !== nodeName) return;
      const trailTo = node.to;
      if (trailTo > pos) return;
      if (!isAdjacentGap(doc, trailTo, pos)) return;
      if (trailTo <= best) return;
      const rule = SYNTAX_RULES[nodeName];
      if (!rule || !rule.contentRange || !rule.markRanges) return;
      const adapted = { from: node.from, to: node.to, type: node.name };
      const content = rule.contentRange(adapted, doc);
      if (!content || content.from > content.to) return;
      const marks = rule.markRanges(adapted, doc) || [];
      const leading = findLeadingMark(marks, content);
      const trailing = findTrailingMark(marks, content);
      if (!leading || !trailing) return;
      best = trailTo;
      hit = { leading: leading, trailing: trailing, content: content };
    },
  });
  return hit;
}

/** 链接类节点的定界符也隐藏，删除时须跳过（但不参与融合/清理） */
const LINK_NODES = ['Link', 'Autolink'];

/**
 * 扫描单个标记类型在 [from,to) 行窗口内的全部样式段。
 * @param {import('@codemirror/state').EditorState} state
 * @param {string} markKey
 * @param {{ from: number, to: number }} [window]
 * @returns {{ key: string, open: {from:number,to:number}, content: {from:number,to:number}, close: {from:number,to:number} }[]}
 */
function collectMarkRegions(state, markKey, window) {
  const doc = state.doc.toString();
  const lo = window ? window.from : 0;
  const hi = window ? window.to : doc.length;
  /** @type {{ key: string, open: {from:number,to:number}, content: {from:number,to:number}, close: {from:number,to:number} }[]} */
  const out = [];
  const triples = findTripleTildeRanges(doc);

  if (markKey === 'underline') {
    for (let t = 0; t < triples.length; t++) {
      const spans = underlineSpansInTriple(triples[t]);
      if (spans.close.to <= lo || spans.open.from >= hi) continue;
      out.push({ key: 'underline', open: spans.open, content: spans.content, close: spans.close });
    }
    const ranges = findUnderlineRanges(doc, underlineExcludeRanges(state, window));
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      if (r.to <= lo || r.from >= hi) continue;
      if (r.to - r.from < 2) continue;
      let isTriple = false;
      for (let t = 0; t < triples.length; t++) {
        if (r.from === triples[t].from && r.to === triples[t].to) {
          isTriple = true;
          break;
        }
      }
      if (isTriple) continue;
      out.push({
        key: 'underline',
        open: { from: r.from, to: r.from + 1 },
        content: { from: r.from + 1, to: r.to - 1 },
        close: { from: r.to - 1, to: r.to },
      });
    }
    return out;
  }

  if (markKey === 'strike') {
    for (let t = 0; t < triples.length; t++) {
      const spans = strikeSpansInTriple(triples[t]);
      if (spans.close.to <= lo || spans.open.from >= hi) continue;
      out.push({ key: 'strike', open: spans.open, content: spans.content, close: spans.close });
    }
  }

  const nodeName = MARK_NODE[markKey];
  const rule = nodeName ? SYNTAX_RULES[nodeName] : null;
  if (!rule || !rule.markRanges || !rule.contentRange) return out;
  let tree;
  try {
    tree = syntaxTree(state);
  } catch (_) {
    return out;
  }
  tree.iterate({
    from: lo,
    to: hi,
    enter: function (node) {
      if (node.name !== nodeName) return;
      // 叠套段已用手写区段，避开 Lezer 对 ~~~ 的误解析
      if (markKey === 'strike') {
        for (let t = 0; t < triples.length; t++) {
          if (node.from < triples[t].to && node.to > triples[t].from) return;
        }
      }
      const adapted = { from: node.from, to: node.to, type: node.name };
      const content = rule.contentRange(adapted, doc);
      if (!content || content.from > content.to) return;
      const marks = rule.markRanges(adapted, doc) || [];
      const leading = findLeadingMark(marks, content);
      const trailing = findTrailingMark(marks, content);
      if (!leading || !trailing) return;
      out.push({ key: markKey, open: leading, content: content, close: trailing });
    },
  });
  return out;
}

/**
 * 五类行内标记的全部样式段（融合/清理用）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {{ from: number, to: number }} [window]
 */
function collectAllMarkRegions(state, window) {
  let out = [];
  for (let i = 0; i < MARK_KEYS.length; i++) {
    out = out.concat(collectMarkRegions(state, MARK_KEYS[i], window));
  }
  return out;
}

/**
 * 预览中不可见的定界符 run（含链接括号），删除定位须跳过。
 * @param {import('@codemirror/state').EditorState} state
 * @param {{ from: number, to: number }} [window]
 * @returns {{ from: number, to: number }[]}
 */
function collectDelimiterRuns(state, window) {
  const regions = collectAllMarkRegions(state, window);
  /** @type {{ from: number, to: number }[]} */
  const runs = [];
  for (let i = 0; i < regions.length; i++) {
    runs.push(regions[i].open, regions[i].close);
  }
  const doc = state.doc.toString();
  const lo = window ? window.from : 0;
  const hi = window ? window.to : doc.length;
  let tree;
  try {
    tree = syntaxTree(state);
  } catch (_) {
    return runs;
  }
  tree.iterate({
    from: lo,
    to: hi,
    enter: function (node) {
      if (LINK_NODES.indexOf(node.name) < 0) return;
      const rule = SYNTAX_RULES[node.name];
      if (!rule || !rule.markRanges) return;
      const marks = rule.markRanges({ from: node.from, to: node.to, type: node.name }, doc) || [];
      for (let m = 0; m < marks.length; m++) {
        if (marks[m].to > marks[m].from) runs.push(marks[m]);
      }
    },
  });
  return runs;
}

/**
 * 光标所在行的窗口（行内标记不跨行，逐键处理时不必全文扫描）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} [to]
 */
function lineWindow(state, from, to) {
  const a = state.doc.lineAt(Math.max(0, Math.min(from, state.doc.length)));
  const b = state.doc.lineAt(Math.max(0, Math.min(to == null ? from : to, state.doc.length)));
  return { from: a.from, to: b.to };
}

/**
 * @param {{ leading: {from:number,to:number}, trailing: {from:number,to:number}, content: {from:number,to:number} } | null} region
 * @param {number} pos
 * @returns {'plain' | 'before' | 'head-out' | 'open' | 'inside' | 'close' | 'tail-out'}
 */
function classifyMarkZone(region, pos) {
  if (!region) return 'plain';
  const leading = region.leading;
  const trailing = region.trailing;
  const content = region.content;
  if (pos < leading.from) return 'before';
  if (pos < content.from) return pos === leading.from ? 'head-out' : 'open';
  if (pos <= content.to) return 'inside';
  if (pos < trailing.to) return 'close';
  return 'tail-out';
}

/**
 * 待输入与当前一致，且落在内容区 inside：交给 CM6/IME，不改写 Markdown。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {Record<string, boolean>} intended
 */
function canPassThroughPendingInput(state, pos, intended) {
  for (let i = 0; i < MARK_KEYS.length; i++) {
    const k = MARK_KEYS[i];
    const intend = !!intended[k];
    const current = posInMarkRegion(state, pos, k);
    if (intend !== current) return false;

    const region = resolveMarkRegion(state, pos, k);
    if (intend) {
      if (!region) return false;
      if (classifyMarkZone(region, pos) !== 'inside') return false;
    } else if (region && classifyMarkZone(region, pos) === 'inside') {
      return false;
    }
  }
  return true;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {Record<string, boolean>} intended
 */
function needsPendingInputTransform(state, pos, intended) {
  return !canPassThroughPendingInput(state, pos, intended);
}

/**
 * 待输入插入落点：延续样式 / 退出样式。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {string} markKey
 * @param {boolean} intendOn 用户希望后续输入是否带该样式
 * @returns {{ insertAt: number, split: boolean }}
 */
function planMarkInsert(state, pos, markKey, intendOn) {
  const region = resolveMarkRegion(state, pos, markKey);
  if (!region) {
    return { insertAt: pos, split: false };
  }
  const leading = region.leading;
  const trailing = region.trailing;
  const content = region.content;
  if (intendOn) {
    const zone = classifyMarkZone(region, pos);
    if (zone === 'head-out' || zone === 'before' || zone === 'open') {
      return { insertAt: content.from, split: false };
    }
    if (zone === 'close') return { insertAt: content.to, split: false };
    if (zone === 'tail-out') return { insertAt: content.to, split: false };
    return { insertAt: pos, split: false };
  }
  if (pos <= content.from) return { insertAt: leading.from, split: false };
  if (pos >= content.to) return { insertAt: trailing.to, split: false };
  return { insertAt: pos, split: true };
}

/**
 * @param {{ armed: boolean, marks: Record<string, boolean> }} pending
 * @param {string} markKey
 * @param {Record<string, boolean>} atCursor
 */
function effectivePendingMark(pending, markKey, atCursor) {
  if (pending && pending.armed && !!pending.marks[markKey] !== !!atCursor[markKey]) {
    return !!pending.marks[markKey];
  }
  return !!atCursor[markKey];
}

/**
 * 无选区切换待输入格式：头/尾在定界符内外切换落点；头外/尾外可关闭待输入格式。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {string} markKey
 * @param {{ armed: boolean, marks: Record<string, boolean> }} pending
 * @returns {{ cursor: number, marks: Record<string, boolean> }}
 */
function planPendingMarkToggle(state, pos, markKey, pending) {
  const atCursor = getInlineFlagsAtPos(state, pos);
  /** @type {Record<string, boolean>} */
  const base = {
    bold: !!atCursor.bold,
    italic: !!atCursor.italic,
    underline: !!atCursor.underline,
    strike: !!atCursor.strike,
    code: !!atCursor.code,
  };
  if (pending && pending.armed) {
    for (let i = 0; i < MARK_KEYS.length; i++) {
      const k = MARK_KEYS[i];
      if (!!pending.marks[k] !== !!atCursor[k]) base[k] = !!pending.marks[k];
    }
  }

  const region = resolveMarkRegion(state, pos, markKey);
  if (region) {
    const marks = Object.assign({}, base);
    const content = region.content;
    const leading = region.leading;
    const trailing = region.trailing;
    const zone = classifyMarkZone(region, pos);
    const effOn = effectivePendingMark(pending, markKey, atCursor);

    if (zone === 'head-out') {
      if (effOn) {
        marks[markKey] = false;
        return { cursor: pos, marks: marks };
      }
      marks[markKey] = true;
      return { cursor: content.from, marks: marks };
    }
    if (zone === 'open') {
      marks[markKey] = true;
      return { cursor: content.from, marks: marks };
    }
    // 内容首/尾这两个边界位与 head-out/tail-out 在屏幕上是同一个点（定界符是隐藏的），
    // 所以必须同样是「真切换」：开着就关掉并把光标挪到定界符外侧，关着就打开、光标留在内容里。
    // 早先这里只挪光标、不动 marks，用户看到的就是「第一次点没反应，要点两次」。
    if (zone === 'inside' && pos === content.from) {
      if (effOn) {
        marks[markKey] = false;
        return { cursor: leading.from, marks: marks };
      }
      marks[markKey] = true;
      return { cursor: pos, marks: marks };
    }
    if (zone === 'tail-out') {
      if (effOn) {
        marks[markKey] = false;
        return { cursor: pos, marks: marks };
      }
      marks[markKey] = true;
      return { cursor: content.to, marks: marks };
    }
    if (zone === 'close') {
      marks[markKey] = true;
      return { cursor: content.to, marks: marks };
    }
    if (zone === 'inside' && pos === content.to) {
      if (effOn) {
        marks[markKey] = false;
        return { cursor: trailing.to, marks: marks };
      }
      marks[markKey] = true;
      return { cursor: pos, marks: marks };
    }

    marks[markKey] = !effOn;
    return { cursor: pos, marks: marks };
  }

  const marks = Object.assign({}, base);
  marks[markKey] = !marks[markKey];
  return { cursor: pos, marks: marks };
}

module.exports = {
  MARK_KEYS: MARK_KEYS,
  collectMarkRegions: collectMarkRegions,
  collectAllMarkRegions: collectAllMarkRegions,
  collectDelimiterRuns: collectDelimiterRuns,
  lineWindow: lineWindow,
  getInlineFlagsAtPos: getInlineFlagsAtPos,
  posInMarkRegion: posInMarkRegion,
  resolveMarkRegion: resolveMarkRegion,
  findMarkRegionAhead: findMarkRegionAhead,
  findMarkRegionBehind: findMarkRegionBehind,
  classifyMarkZone: classifyMarkZone,
  canPassThroughPendingInput: canPassThroughPendingInput,
  needsPendingInputTransform: needsPendingInputTransform,
  planMarkInsert: planMarkInsert,
  planPendingMarkToggle: planPendingMarkToggle,
};

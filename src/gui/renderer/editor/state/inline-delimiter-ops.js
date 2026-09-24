/**
 * 行内成对定界符编辑的 CM6 接线层：选区包裹/取消（融合）、可见字符删除、变更后清理。
 *
 * 约束：所有写入都必须让编辑后的文档**不残留可见定界符**——相邻同类样式段融合、空样式段清除。
 */
'use strict';

const { EditorSelection, findClusterBreak } = require('@codemirror/state');
const {
  collectMarkRegions,
  collectAllMarkRegions,
  collectDelimiterRuns,
  lineWindow,
} = require('./inline-mark-context');
const {
  planFusedWrap,
  planSplitUnwrap,
  planRegionCleanup,
  snapOutOfDelimiters,
  planDeleteRangePreservingPairs,
  skipHiddenRuns,
  toChangeSet,
} = require('../model/inline-delimiters');
const { getInlineToolbarStateAt } = require('./block-format');
const { getEffectiveWidgetEditTarget } = require('../widget-editable-guard');
const { expandRangeOverLinks } = require('../caret-syntax-adjust');
const { planExitTrailingMarksBreak } = require('../model/inline-mark-break');
const { syntaxTree, ensureSyntaxTree } = require('@codemirror/language');
const inlineDbg = require('./inline-format-debug');

/** 与 pending-inline-format 保持同一套定界符 */
const DELIM = {
  bold: '**',
  italic: '*',
  underline: '~',
  strike: '~~',
  code: '`',
};

/**
 * 把编辑前的样式段映射到编辑后的坐标。
 * 端点一律「向外」映射（开定界符靠左、闭定界符靠右、内容两头向外），
 * 这样紧贴边界的插入会被算进内容、整段删除则塌成空区间，正好触发清理。
 *
 * @param {{ key: string, open: object, content: object, close: object }[]} regions
 * @param {import('@codemirror/state').ChangeSet} set
 */
function mapRegions(regions, set) {
  const out = [];
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    out.push({
      key: r.key,
      openLen: r.open.to - r.open.from,
      closeLen: r.close.to - r.close.from,
      open: { from: set.mapPos(r.open.from, -1), to: set.mapPos(r.open.to, -1) },
      content: { from: set.mapPos(r.content.from, -1), to: set.mapPos(r.content.to, 1) },
      close: { from: set.mapPos(r.close.from, 1), to: set.mapPos(r.close.to, 1) },
    });
  }
  return out;
}

/**
 * 派发规划器产出的变更。规划器自己保证定界符成对且不相邻，无需再清理。
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, insert: string }[]} changes
 * @param {{ from: number, to: number }} select
 * @param {string} [userEvent]
 */
function dispatchPlannedChange(view, changes, select, userEvent) {
  if (!changes || !changes.length) return false;
  view.dispatch({
    changes: changes,
    selection: EditorSelection.range(select.from, select.to),
    userEvent: userEvent || 'input',
    scrollIntoView: true,
  });
  try {
    view.focus();
  } catch (_) {
    /* ignore */
  }
  return true;
}

/**
 * 派发一次「只动内容、不动定界符」的改动，并在同一事务里补上定界符清理（同一步撤销）。
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, insert: string }[]} changes
 * @param {{ from: number, to: number }} select 变更后（清理前）的选区
 * @param {string} [userEvent]
 * @returns {boolean}
 */
function dispatchWithDelimiterCleanup(view, changes, select, userEvent) {
  const state = view.state;
  if (!changes || !changes.length) return false;
  let lo = changes[0].from;
  let hi = changes[0].to;
  for (let i = 1; i < changes.length; i++) {
    if (changes[i].from < lo) lo = changes[i].from;
    if (changes[i].to > hi) hi = changes[i].to;
  }
  const win = lineWindow(state, lo, hi);
  const before = collectAllMarkRegions(state, win);
  const set = toChangeSet(changes, state.doc.length);
  const cleanup = planRegionCleanup(mapRegions(before, set));

  const anchor = select ? select.from : set.mapPos(lo, 1);
  const head = select ? select.to : anchor;
  const specs = [
    {
      changes: changes,
      selection: EditorSelection.range(anchor, head),
      userEvent: userEvent || 'input',
      scrollIntoView: true,
    },
  ];
  if (cleanup.length) {
    const cleanupSet = toChangeSet(cleanup, set.newLength);
    specs.push({
      // sequential：坐标基于第一段变更之后的文档，否则 CM6 会按原文档解释
      sequential: true,
      changes: cleanup,
      selection: EditorSelection.range(
        cleanupSet.mapPos(anchor, 1),
        cleanupSet.mapPos(head, -1)
      ),
    });
  }
  inlineDbg.log('delim.dispatch', {
    pos: anchor,
    state: state,
    changes: changes,
    cleanup: cleanup,
  });
  view.dispatch.apply(view, specs);
  return true;
}

/**
 * 选区按行切段（跨行包裹时逐行包，不把换行卷进定界符内）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 */
function lineSegments(state, from, to) {
  const out = [];
  const firstLine = state.doc.lineAt(from).number;
  const lastLine = state.doc.lineAt(to).number;
  for (let n = firstLine; n <= lastLine; n++) {
    const line = state.doc.line(n);
    const a = Math.max(from, line.from);
    const b = Math.min(to, line.to);
    if (b > a) out.push({ from: a, to: b });
  }
  return out;
}

/**
 * 有选区时应用/取消行内标记。融合优先：与选区相交或紧邻的同类样式段一并吸收。
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {'bold'|'italic'|'underline'|'strike'|'code'} markKey
 * @returns {boolean}
 */
function applyInlineMarkToSelection(view, markKey) {
  if (!view) return false;
  const delim = DELIM[markKey];
  if (!delim) return false;
  const state = view.state;
  const sel = state.selection.main;
  if (sel.empty) return false;

  const text = state.doc.toString();
  const win = lineWindow(state, sel.from, sel.to);
  const runs = collectDelimiterRuns(state, win);
  const snapped = snapOutOfDelimiters(runs, sel.from, sel.to);
  if (snapped.to <= snapped.from) return false;
  const regions = collectMarkRegions(state, markKey, win);
  const cov = getInlineToolbarStateAt(state, snapped.from, snapped.to)[markKey];
  const fullyOn = !!(cov && cov.on && !cov.mixed);

  inlineDbg.log('delim.selection', {
    pos: sel.head,
    state: state,
    mark: markKey,
    selFrom: snapped.from,
    selTo: snapped.to,
    fullyOn: fullyOn,
    regions: regions.length,
  });

  if (fullyOn) {
    const plan = planSplitUnwrap(text, regions, snapped.from, snapped.to);
    if (!plan) return false;
    return dispatchPlannedChange(view, plan.changes, plan.select, 'input.format');
  }

  const segments = lineSegments(state, snapped.from, snapped.to);
  /** @type {{ from: number, to: number, insert: string }[]} */
  let changes = [];
  let selFrom = null;
  let selTo = null;
  let delta = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const plan = planFusedWrap(text, regions, seg.from, seg.to, delim);
    if (!plan) continue;
    if (selFrom == null) selFrom = plan.select.from + delta;
    selTo = plan.select.to + delta;
    for (let c = 0; c < plan.changes.length; c++) {
      const ch = plan.changes[c];
      changes.push(ch);
      delta += ch.insert.length - (ch.to - ch.from);
    }
  }
  if (!changes.length) return false;
  return dispatchPlannedChange(view, changes, { from: selFrom, to: selTo }, 'input.format');
}

/**
 * 选区端点推出定界符内部（复制/剪切/清除格式共用）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 */
function snapRangeOutOfDelimiters(state, from, to) {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const win = lineWindow(state, a, b);
  const runs = collectDelimiterRuns(state, win);
  return snapOutOfDelimiters(runs, a, b);
}

/**
 * 删除/替换用：把区间拆成「跳过需保留定界符」的若干段。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 * @param {boolean} [collapseEmptied]
 * @returns {{ from: number, to: number }[]}
 */
function planPreservingDeleteRanges(state, from, to, collapseEmptied) {
  const snapped = snapRangeOutOfDelimiters(state, from, to);
  if (snapped.to <= snapped.from) return [];
  const win = lineWindow(state, snapped.from, snapped.to);
  const regions = collectAllMarkRegions(state, win);
  return planDeleteRangePreservingPairs(regions, snapped.from, snapped.to, collapseEmptied);
}

/**
 * 清除选区内全部行内标记（五类一起摘），剩余两侧内容保持各自样式。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 */
function planClearInlineMarks(state, from, to) {
  const snapped = snapRangeOutOfDelimiters(state, from, to);
  if (snapped.to <= snapped.from) return null;
  const win = lineWindow(state, snapped.from, snapped.to);
  const regions = collectAllMarkRegions(state, win);
  if (!regions.length) return null;
  return planSplitUnwrap(state.doc.toString(), regions, snapped.from, snapped.to);
}

/**
 * 删除一段区间并清理被掏空 / 被截断的定界符对（剪切、粘贴替换等复用）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 * @param {string} [insert]
 * @param {string} [userEvent]
 */
function replaceRangeWithCleanup(view, from, to, insert, userEvent) {
  const text = insert || '';
  // 有新内容填回时不折叠被掏空的样式段，否则粘贴会顺手取消该段样式
  const ranges = planPreservingDeleteRanges(view.state, from, to, !text);
  if (!ranges.length) return false;
  /** @type {{ from: number, to: number, insert: string }[]} */
  const changes = [];
  for (let i = 0; i < ranges.length; i++) {
    changes.push({ from: ranges[i].from, to: ranges[i].to, insert: i === 0 ? text : '' });
  }
  const caret = ranges[0].from + text.length;
  return dispatchWithDelimiterCleanup(
    view,
    changes,
    { from: caret, to: caret },
    userEvent || 'delete.selection'
  );
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 */
function inLeadingWhitespace(state, pos) {
  const line = state.doc.lineAt(pos);
  const head = line.text.slice(0, pos - line.from);
  return head.length > 0 && !/[^ \t]/.test(head);
}

/**
 * 可见字符删除：定界符在预览中不可见，删除必须跨过它作用到真正的字符；
 * 删空样式段内容时整对定界符一并清除。
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {boolean} forward
 * @returns {boolean}
 */
function deleteAcrossDelimiters(view, forward) {
  if (!view || view.state.readOnly) return false;
  const state = view.state;
  const sel = state.selection.main;
  if (state.selection.ranges.length > 1) return false;
  // widget（代码块 / 表格格 / 公式源码）内编辑走各自的 contenteditable 链路
  if (getEffectiveWidgetEditTarget()) return false;

  const win = lineWindow(state, sel.from, sel.to);
  const regions = collectAllMarkRegions(state, win);
  // Link/Image：选区盖住可见文本时先扩成整段，再删（避免留下 ](url)）
  if (!sel.empty) {
    const linkExp = expandRangeOverLinks(state, sel.from, sel.to);
    if (linkExp.from < sel.from || linkExp.to > sel.to) {
      return dispatchWithDelimiterCleanup(
        view,
        [{ from: linkExp.from, to: linkExp.to, insert: '' }],
        { from: linkExp.from, to: linkExp.from },
        forward ? 'delete.forward' : 'delete.backward'
      );
    }
  }
  // 本行没有行内标记时交回 CM6 默认命令（保留缩进删除、IME 等原生行为）
  if (!regions.length) return false;
  if (sel.empty && !forward && inLeadingWhitespace(state, sel.head)) return false;

  const runs = collectDelimiterRuns(state, win);
  let from;
  let to;
  if (!sel.empty) {
    // 选区端点常落在隐藏定界符外侧（左缘校准到开定界符左侧），直接删会只吃掉一侧
    const snapped = snapOutOfDelimiters(runs, sel.from, sel.to);
    const ranges = planDeleteRangePreservingPairs(regions, snapped.from, snapped.to);
    if (!ranges.length) return false;
    /** @type {{ from: number, to: number, insert: string }[]} */
    const changes = [];
    for (let i = 0; i < ranges.length; i++) {
      changes.push({ from: ranges[i].from, to: ranges[i].to, insert: '' });
    }
    const caret = ranges[0].from;
    return dispatchWithDelimiterCleanup(
      view,
      changes,
      { from: caret, to: caret },
      forward ? 'delete.forward' : 'delete.backward'
    );
  } else {
    const p = skipHiddenRuns(runs, sel.head, forward);
    const line = state.doc.lineAt(p);
    if (forward) {
      if (p >= state.doc.length) return false;
      let target = p >= line.to ? p + 1 : line.from + findClusterBreak(line.text, p - line.from, true, true);
      if (target <= p) target = p + 1;
      from = p;
      to = Math.min(target, state.doc.length);
    } else {
      if (p <= 0) return false;
      let target = p <= line.from ? p - 1 : line.from + findClusterBreak(line.text, p - line.from, false, false);
      if (target >= p) target = p - 1;
      from = Math.max(0, target);
      to = p;
    }
  }
  if (to <= from) return false;

  return dispatchWithDelimiterCleanup(
    view,
    [{ from: from, to: to, insert: '' }],
    { from: from, to: from },
    forward ? 'delete.forward' : 'delete.backward'
  );
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function handleInlineDelimiterBackspace(view) {
  return deleteAcrossDelimiters(view, false);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function handleInlineDelimiterDelete(view) {
  return deleteAcrossDelimiters(view, true);
}

/**
 * 行内样式可见文本末按 Enter：换行插到闭定界符之后（避免 `**text\n**`）。
 * @param {import('@codemirror/view').EditorView} view
 * @returns {boolean}
 */
function handleInlineMarkBreakEnter(view) {
  if (!view || view.state.readOnly) return false;
  if (getEffectiveWidgetEditTarget()) return false;
  const state = view.state;
  const sel = state.selection.main;
  if (!sel.empty || sel.from !== sel.to) return false;
  const head = sel.head;
  try {
    if (typeof ensureSyntaxTree === 'function') {
      ensureSyntaxTree(state, Math.min(state.doc.length, head + 1), 50);
    }
  } catch (_) {
    /* ignore */
  }
  const plan = planExitTrailingMarksBreak(state.doc.toString(), syntaxTree(state), head, '\n');
  if (!plan) return false;
  view.dispatch({
    changes: { from: plan.from, to: plan.to, insert: plan.insert },
    selection: { anchor: plan.caret, head: plan.caret },
    userEvent: 'input.type',
  });
  return true;
}

/**
 * 供 pending 输入层复用：按已有 changes 派发并补清理。
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, insert: string }} change
 * @param {number} cursor
 * @param {import('@codemirror/state').StateEffect<unknown>[]} [effects]
 */
function dispatchTypedInsertWithCleanup(view, change, cursor, effects) {
  const state = view.state;
  const win = lineWindow(state, change.from, change.to);
  const before = collectAllMarkRegions(state, win);
  const set = toChangeSet([change], state.doc.length);
  const cleanup = planRegionCleanup(mapRegions(before, set));
  // assoc = -1：光标贴住左侧刚输入的可见文字。取消样式后落点常常紧邻被隐藏的定界符，
  // 默认 assoc 会让 coordsAtPos 量到隐藏 span 上，drawSelection 画出零高度光标（看起来就是光标没了）。
  const specs = [
    {
      changes: change,
      selection: EditorSelection.cursor(cursor, -1),
      userEvent: 'input.type',
      effects: effects,
    },
  ];
  if (cleanup.length) {
    const cleanupSet = toChangeSet(cleanup, set.newLength);
    const next = cleanupSet.mapPos(cursor, -1);
    specs.push({
      sequential: true,
      changes: cleanup,
      selection: EditorSelection.cursor(next, -1),
    });
  }
  view.dispatch.apply(view, specs);
  return true;
}

module.exports = {
  DELIM: DELIM,
  mapRegions: mapRegions,
  lineSegments: lineSegments,
  dispatchPlannedChange: dispatchPlannedChange,
  dispatchWithDelimiterCleanup: dispatchWithDelimiterCleanup,
  snapRangeOutOfDelimiters: snapRangeOutOfDelimiters,
  planPreservingDeleteRanges: planPreservingDeleteRanges,
  planClearInlineMarks: planClearInlineMarks,
  replaceRangeWithCleanup: replaceRangeWithCleanup,
  applyInlineMarkToSelection: applyInlineMarkToSelection,
  deleteAcrossDelimiters: deleteAcrossDelimiters,
  handleInlineDelimiterBackspace: handleInlineDelimiterBackspace,
  handleInlineDelimiterDelete: handleInlineDelimiterDelete,
  handleInlineMarkBreakEnter: handleInlineMarkBreakEnter,
  dispatchTypedInsertWithCleanup: dispatchTypedInsertWithCleanup,
};

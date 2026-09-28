/**
 * 在一段纯 Markdown 字符串上复用 CM6 正文的定界符规划器。
 *
 * 表格单元格是 widget 内的 contenteditable，内容以 Markdown 字符串形态存在、没有 CM6 文档可依托，
 * 早期因此另接了一套 editor-assist 的朴素 wrap/unwrap —— 结果融合包裹、拆分取消、空对清理这些
 * 正文早已有的规则在格内一条都不生效（选中加粗段中间取消会留下裸 `**`，头前带格式输入会插出
 * `**测试****加粗**`）。这里用一次性 EditorState 搭桥，让格内与正文共享同一套规划器。
 *
 * 单元格内容短且这些操作都由点击/按键驱动（非逐帧），临时建 state 的开销可以接受。
 */
'use strict';

const { EditorState, Text } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { GFM } = require('@lezer/markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const {
  collectMarkRegions,
  collectAllMarkRegions,
  collectDelimiterRuns,
} = require('./inline-mark-context');
const {
  planFusedWrap,
  planSplitUnwrap,
  planRegionCleanup,
  planCombinedTildeToggle,
  snapOutOfDelimiters,
  snapIntoMarkContent,
  toChangeSet,
} = require('../model/inline-delimiters');
const { getInlineToolbarStateAt } = require('./block-format');
const { mapRegions } = require('./inline-delimiter-ops');
const { buildPendingTypedInsert } = require('./pending-inline-format');

/** @type {Record<string, string>} */
const DELIM = {
  bold: '**',
  italic: '*',
  underline: '~',
  strike: '~~',
  code: '`',
};

/** 定界符对 → 标记名（工具栏传的是定界符串） */
function markKeyForDelims(before, after) {
  if (before !== after) return null;
  const keys = Object.keys(DELIM);
  for (let i = 0; i < keys.length; i++) {
    if (DELIM[keys[i]] === before) return keys[i];
  }
  return null;
}

/**
 * @param {string} text
 * @returns {import('@codemirror/state').EditorState}
 */
function textState(text) {
  const state = EditorState.create({
    doc: String(text || ''),
    extensions: [markdown({ extensions: GFM })],
  });
  // 规划器全部依赖 syntaxTree；不预热则短文本也可能拿到空树
  ensureSyntaxTree(state, state.doc.length);
  return state;
}

/**
 * @param {string} text
 * @param {{ from: number, to: number, insert: string }[]} changes
 */
function applyChanges(text, changes) {
  const set = toChangeSet(changes, text.length);
  return { value: set.apply(Text.of(String(text).split('\n'))).toString(), set: set };
}

/**
 * 单元格选区上切换行内标记：已全覆盖则拆分取消，否则融合包裹。
 *
 * 与正文 `applyInlineMarkToSelection` 同源，因此同样保证「编辑后不残留可见定界符」。
 * 规划器输出自带成对性，**不再叠加清理**（见 AGENTS.md §4l4）。
 *
 * @param {string} text 单元格 Markdown 全文
 * @param {number} from
 * @param {number} to
 * @param {string} markKey
 * @returns {{ value: string, selectionStart: number, selectionEnd: number } | null}
 */
function toggleInlineMarkInText(text, from, to, markKey) {
  const delim = DELIM[markKey];
  if (!delim) return null;
  const src = String(text || '');
  const a = Math.max(0, Math.min(Math.min(from, to), src.length));
  const b = Math.max(0, Math.min(Math.max(from, to), src.length));

  const state = textState(src);
  const outward = snapOutOfDelimiters(collectDelimiterRuns(state), a, b);
  const snapped = snapIntoMarkContent(collectDelimiterRuns(state), outward.from, outward.to);
  if (snapped.to <= snapped.from) return null;

  const regions = collectMarkRegions(state, markKey);
  const cov = getInlineToolbarStateAt(state, snapped.from, snapped.to)[markKey];
  const fullyOn = !!(cov && cov.on && !cov.mixed);

  if (markKey === 'underline' || markKey === 'strike') {
    const combined = planCombinedTildeToggle(
      src,
      collectMarkRegions(state, 'underline'),
      collectMarkRegions(state, 'strike'),
      snapped.from,
      snapped.to,
      markKey,
      fullyOn
    );
    if (combined) {
      const applied = applyChanges(src, combined.changes);
      return {
        value: applied.value,
        selectionStart: combined.select.from,
        selectionEnd: combined.select.to,
      };
    }
  }

  const plan = fullyOn
    ? planSplitUnwrap(src, regions, snapped.from, snapped.to)
    : planFusedWrap(src, regions, snapped.from, snapped.to, delim);
  if (!plan) return null;

  const applied = applyChanges(src, plan.changes);
  return {
    value: applied.value,
    selectionStart: plan.select.from,
    selectionEnd: plan.select.to,
  };
}

/**
 * 待输入格式插入：延续相邻的同类样式段，而不是另包一层。
 *
 * 旧实现直接 `wrapWithAdds(text, marks)` 拼在光标处，在样式段头前/尾后输入会插出
 * `**测试****加粗**`。这里改走正文同一个 `buildPendingTypedInsert`，并补上清理段
 * （对应正文的 `dispatchTypedInsertWithCleanup`）。
 *
 * @param {string} text
 * @param {number} pos
 * @param {string} insert
 * @param {Record<string, boolean>} marks
 * @returns {{ value: string, cursor: number } | null}
 */
function planTypedInsertInText(text, pos, insert, marks) {
  if (!insert) return null;
  const src = String(text || '');
  const at = Math.max(0, Math.min(pos, src.length));
  const state = textState(src);
  const spec = buildPendingTypedInsert(state, at, at, insert, marks);
  if (!spec) return null;

  const before = collectAllMarkRegions(state);
  const applied = applyChanges(src, [
    { from: spec.from, to: spec.to, insert: spec.insert },
  ]);
  const cleanup = planRegionCleanup(mapRegions(before, applied.set));
  if (!cleanup.length) return { value: applied.value, cursor: spec.cursor };

  const cleaned = applyChanges(applied.value, cleanup);
  return { value: cleaned.value, cursor: cleaned.set.mapPos(spec.cursor, -1) };
}

/**
 * 区间上的标记覆盖状态（工具栏按钮高亮用），语义与正文 `getInlineToolbarStateAt` 一致：
 * `on` = 该区间被样式覆盖，`mixed` = 只覆盖了一部分。
 *
 * @param {string} text
 * @param {number} from
 * @param {number} to
 * @returns {{ bold: {on:boolean,mixed:boolean}, italic: {on:boolean,mixed:boolean}, underline: {on:boolean,mixed:boolean}, strike: {on:boolean,mixed:boolean}, code: {on:boolean,mixed:boolean} }}
 */
function inlineStateInText(text, from, to) {
  const src = String(text || '');
  const a = Math.max(0, Math.min(Math.min(from, to), src.length));
  const b = Math.max(0, Math.min(Math.max(from, to), src.length));
  return getInlineToolbarStateAt(textState(src), a, b);
}

module.exports = {
  DELIM: DELIM,
  markKeyForDelims: markKeyForDelims,
  textState: textState,
  toggleInlineMarkInText: toggleInlineMarkInText,
  planTypedInsertInText: planTypedInsertInText,
  inlineStateInText: inlineStateInText,
};

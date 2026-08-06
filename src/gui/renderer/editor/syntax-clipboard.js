/**
 * 预览模式剪贴板：定界符成对完整时保留 Markdown；仅一侧时复制/粘贴去掉定界符。
 */
'use strict';

const { syntaxTree } = require('@codemirror/language');
const { SYNTAX_RULES } = require('./model/syntax-rules');
const { findLeadingMark, findTrailingMark, adjustSelectionForHiddenMarks } = require('./caret-syntax-adjust');

/**
 * @param {import('@lezer/common').SyntaxNode} node
 */
function adaptSyntaxNode(node) {
  return { from: node.from, to: node.to, type: node.name };
}

/**
 * @param {{ from: number, to: number }[]} ranges
 */
function mergeRanges(ranges) {
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
      out.push(cur);
    }
  }
  return out;
}

/**
 * 选区与行内语法部分重叠且未成对包含定界符时，排除对应 hide-mark 区间。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 */
function collectDelimiterExclusions(state, from, to) {
  const tree = syntaxTree(state);
  if (!tree) return [];
  const doc = state.doc.toString();
  const f = Math.min(from, to);
  const t = Math.max(from, to);
  const exclude = [];

  tree.iterate({
    enter: function (node) {
      const rule = SYNTAX_RULES[node.name];
      if (!rule || rule.class !== 'R') return;
      if (t <= node.from || f >= node.to) return;

      const adapted = adaptSyntaxNode(node);
      const marks =
        typeof rule.markRanges === 'function' ? rule.markRanges(adapted, doc) || [] : [];
      if (!marks.length) return;
      const content =
        typeof rule.contentRange === 'function' ? rule.contentRange(adapted, doc) : null;
      if (!content) return;

      const leading = findLeadingMark(marks, content);
      const trailing = findTrailingMark(marks, content);
      if (!leading) return;

      const hasFullOpen = f <= leading.from && t >= leading.to;
      const hasFullClose = trailing && f <= trailing.from && t >= trailing.to;

      if (trailing) {
        if (hasFullOpen && hasFullClose) return;
        if (f < leading.to && t > leading.from) {
          exclude.push({ from: Math.max(f, leading.from), to: Math.min(t, leading.to) });
        }
        if (f < trailing.to && t > trailing.from) {
          exclude.push({ from: Math.max(f, trailing.from), to: Math.min(t, trailing.to) });
        }
        return;
      }

      // 标题仅前置 ATX（##）：预览态不可见，复制一律去掉，避免贴回标题行叠成 ## ##
      if (f < leading.to && t > leading.from) {
        exclude.push({ from: Math.max(f, leading.from), to: Math.min(t, leading.to) });
      }
    },
  });

  return mergeRanges(exclude);
}

/**
 * @param {string} doc
 * @param {number} from
 * @param {number} to
 * @param {{ from: number, to: number }[]} exclusions
 */
function sliceDocSkippingRanges(doc, from, to, exclusions) {
  if (!exclusions.length) return doc.slice(from, to);
  let out = '';
  let pos = from;
  for (let i = 0; i < exclusions.length; i++) {
    const ex = exclusions[i];
    if (ex.to <= from || ex.from >= to) continue;
    const clipFrom = Math.max(from, ex.from);
    const clipTo = Math.min(to, ex.to);
    if (clipFrom > pos) out += doc.slice(pos, clipFrom);
    pos = Math.max(pos, clipTo);
  }
  if (pos < to) out += doc.slice(pos, to);
  return out;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 */
function sliceDocForClipboard(state, from, to) {
  const f = Math.min(from, to);
  const t = Math.max(from, to);
  const doc = state.doc.toString();
  const exclusions = collectDelimiterExclusions(state, f, t);
  return {
    from: f,
    to: t,
    text: normalizeClipboardAtx(sliceDocSkippingRanges(doc, f, t, exclusions)),
  };
}

/**
 * 预览剪贴板兜底：去掉各行首部 ATX，以及紧贴正文末尾的孤儿 #（拖选落点偏移时偶发）。
 * @param {string} text
 */
function normalizeClipboardAtx(text) {
  if (text == null || text === '') return text;
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(function (ln) {
      return ln.replace(/^#{1,6}\s+/, '').replace(/(\S)#{1,6}$/, '$1');
    })
    .join('\n');
}

/**
 * @param {import('@codemirror/state').EditorState} state
 */
function sliceSelectionForClipboard(state) {
  const sel = state.selection.main;
  if (sel.empty) return null;
  const adjusted = adjustSelectionForHiddenMarks(state, sel.anchor, sel.head);
  const from = Math.min(adjusted.anchor, adjusted.head);
  const to = Math.max(adjusted.anchor, adjusted.head);
  return sliceDocForClipboard(state, from, to);
}

/**
 * @param {ClipboardEvent} event
 * @param {import('@codemirror/view').EditorView} view
 */
function handleMarkdownSyntaxCopy(event, view) {
  if (!event || !event.clipboardData) return false;
  const slice = sliceSelectionForClipboard(view.state);
  if (!slice) return false;
  event.clipboardData.setData('text/plain', slice.text);
  event.preventDefault();
  return true;
}

/**
 * @param {ClipboardEvent} event
 * @param {import('@codemirror/view').EditorView} view
 */
function handleMarkdownSyntaxCut(event, view) {
  if (!event || !event.clipboardData) return false;
  const slice = sliceSelectionForClipboard(view.state);
  if (!slice) return false;
  event.clipboardData.setData('text/plain', slice.text);
  event.preventDefault();
  view.dispatch({
    changes: { from: slice.from, to: slice.to, insert: '' },
    selection: { anchor: slice.from, head: slice.from },
  });
  return true;
}

/**
 * 贴入标题行时去掉剪贴板各行首部 ATX，避免与行内已有 ## 叠成 ## ##。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {string} text
 */
function normalizePasteForHeading(state, pos, text) {
  if (text == null || text === '') return text;
  const line = state.doc.lineAt(pos);
  if (!/^(#{1,6})\s/.test(line.text)) return text;
  return normalizeClipboardAtx(text);
}

/**
 * @param {ClipboardEvent} event
 * @param {import('@codemirror/view').EditorView} view
 */
function handleMarkdownSyntaxPaste(event, view) {
  if (!event || !event.clipboardData) return false;
  const plain = event.clipboardData.getData('text/plain');
  if (plain == null || plain === '') return false;
  const sel = view.state.selection.main;
  const pos = Math.min(sel.from, sel.to);
  const next = normalizePasteForHeading(view.state, pos, plain);
  if (next === plain) return false;
  event.preventDefault();
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: next },
    userEvent: 'input.paste',
  });
  return true;
}

module.exports = {
  collectDelimiterExclusions: collectDelimiterExclusions,
  sliceDocSkippingRanges: sliceDocSkippingRanges,
  sliceDocForClipboard: sliceDocForClipboard,
  normalizeClipboardAtx: normalizeClipboardAtx,
  sliceSelectionForClipboard: sliceSelectionForClipboard,
  normalizePasteForHeading: normalizePasteForHeading,
  handleMarkdownSyntaxCopy: handleMarkdownSyntaxCopy,
  handleMarkdownSyntaxCut: handleMarkdownSyntaxCut,
  handleMarkdownSyntaxPaste: handleMarkdownSyntaxPaste,
};

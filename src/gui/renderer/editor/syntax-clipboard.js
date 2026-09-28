/**
 * 预览模式剪贴板：定界符成对完整时保留 Markdown；仅一侧时复制/粘贴去掉定界符。
 * 选区盖住某样式段的全部「可见内容」时（即使没选中隐藏定界符），也要带上该样式定界符，
 * 否则预览里拖选加粗文字拷贝会丢 `**`。
 */
'use strict';

const { syntaxTree } = require('@codemirror/language');
const { SYNTAX_RULES } = require('./model/syntax-rules');
const { findLeadingMark, findTrailingMark, adjustSelectionForHiddenMarks } = require('./caret-syntax-adjust');
const { collectAllMarkRegions } = require('./state/inline-mark-context');

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

/** 与 pending-inline-format 一致：先包内层 */
const CLIP_WRAP_ORDER = ['code', 'underline', 'strike', 'italic', 'bold'];
const CLIP_DELIM = {
  bold: '**',
  italic: '*',
  underline: '~',
  strike: '~~',
  code: '`',
};

/**
 * 选区完全落在某样式段内容内，或（校准后）从开定界符起盖住全部内容时，补上定界符。
 * 预览拖选整段可见字时，左缘常被校准到开定界符外侧、右缘停在闭定界符内侧；
 * 若只按「选区 ⊆ content」判断会漏包。但选区若从样式段之前的正文开始，不得整段加壳。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 * @param {string} text
 */
function wrapClipboardWithCoveringMarks(state, from, to, text) {
  if (to <= from || text == null || text === '') return text;
  const regions = collectAllMarkRegions(state);
  /** @type {Record<string, string>} */
  const covering = {};
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (!r || !r.content || !r.open || !r.close || !r.key || !CLIP_DELIM[r.key]) continue;
    const c0 = r.content.from;
    const c1 = r.content.to;
    if (c1 <= c0) continue;
    const selInside = from >= c0 && to <= c1;
    // 从开定界符起盖住全部 content（校准后含开不含闭）
    const coversAllFromMark =
      from >= r.open.from &&
      to <= r.close.to &&
      Math.max(from, c0) === c0 &&
      Math.min(to, c1) === c1;
    // 校准后左缘在开定界符、右缘仍在内容内：部分可见选区也要保留样式
    const openPlusPartialContent =
      from >= r.open.from && from <= c0 && to > c0 && to <= c1;
    if (selInside || coversAllFromMark || openPlusPartialContent) {
      covering[r.key] = CLIP_DELIM[r.key];
    }
  }
  let out = String(text);
  for (let i = 0; i < CLIP_WRAP_ORDER.length; i++) {
    const key = CLIP_WRAP_ORDER[i];
    const d = covering[key];
    if (!d) continue;
    if (out.length >= d.length * 2 && out.slice(0, d.length) === d && out.slice(-d.length) === d) {
      continue;
    }
    out = d + out + d;
  }
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
  const raw = normalizeClipboardAtx(sliceDocSkippingRanges(doc, f, t, exclusions));
  return {
    from: f,
    to: t,
    text: wrapClipboardWithCoveringMarks(state, f, t, raw),
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
  require('./state/inline-delimiter-ops').replaceRangeWithCleanup(
    view,
    slice.from,
    slice.to,
    '',
    'delete.cut'
  );
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
  require('./state/inline-delimiter-ops').replaceRangeWithCleanup(
    view,
    sel.from,
    sel.to,
    next,
    'input.paste'
  );
  return true;
}

module.exports = {
  collectDelimiterExclusions: collectDelimiterExclusions,
  sliceDocSkippingRanges: sliceDocSkippingRanges,
  sliceDocForClipboard: sliceDocForClipboard,
  wrapClipboardWithCoveringMarks: wrapClipboardWithCoveringMarks,
  normalizeClipboardAtx: normalizeClipboardAtx,
  sliceSelectionForClipboard: sliceSelectionForClipboard,
  normalizePasteForHeading: normalizePasteForHeading,
  handleMarkdownSyntaxCopy: handleMarkdownSyntaxCopy,
  handleMarkdownSyntaxCut: handleMarkdownSyntaxCut,
  handleMarkdownSyntaxPaste: handleMarkdownSyntaxPaste,
};

/**
 * 当前块级格式与行内标记状态（工具栏 / 浮动条共享源）。
 */
'use strict';

const { syntaxTree } = require('@codemirror/language');
const { findUnderlineRanges } = require('../model/underline');
const { buildCodeFenceMask } = require('../model/parse-math');
const { getInlineFlagsAtPos, posInMarkRegion, collectMarkRegions } = require('./inline-mark-context');

/**
 * @param {string} text
 * @returns {'paragraph'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6'|'bullet'|'ordered'|'task'|'quote'}
 */
function blockFormatOfLine(text) {
  const atx = String(text || '').match(/^( {0,3})(#{1,6})(\s+)(.*)$/);
  if (atx) return /** @type {'h1'} */ ('h' + atx[2].length);
  const body = String(text || '').replace(/^( {0,3})/, '');
  if (/^[-*+]\s+\[[ xX]\]\s+/.test(body)) return 'task';
  if (/^[-*+]\s+/.test(body)) return 'bullet';
  if (/^\d+\.\s+/.test(body)) return 'ordered';
  if (/^>\s?/.test(body)) return 'quote';
  return 'paragraph';
}

// 无序/有序列表项内的 ATX 标题（`- ## 标题`）；任务项首块只能是段落，故不算标题。
const LIST_ITEM_HEADING_RE = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(#{1,6})\s+/;

/**
 * @param {string} text
 * @returns {number} 0 表示该行不是列表项内标题
 */
function listItemHeadingLevel(text) {
  const m = String(text || '').match(LIST_ITEM_HEADING_RE);
  return m ? m[1].length : 0;
}

/**
 * @param {string} text
 * @returns {'paragraph'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6'}
 */
function paragraphSelectOfLine(text) {
  const fmt = blockFormatOfLine(text);
  if (fmt.charAt(0) === 'h' && fmt.length === 2) return /** @type {'h1'} */ (fmt);
  const lv = listItemHeadingLevel(text);
  if (lv) return /** @type {'h1'} */ ('h' + lv);
  return 'paragraph';
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @returns {'paragraph'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6'|'bullet'|'ordered'|'task'|'quote'}
 */
function deriveBlockFormat(state) {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  return blockFormatOfLine(line.text);
}

/**
 * 段落下拉：选区覆盖多段且级别不同时 mixed。
 * @param {import('@codemirror/state').EditorState} state
 * @returns {{ value: string, mixed: boolean }}
 */
function deriveParagraphSelect(state) {
  const sel = state.selection.main;
  const fromN = state.doc.lineAt(sel.from).number;
  const toN = state.doc.lineAt(sel.to).number;
  let first = null;
  let mixed = false;
  for (let n = fromN; n <= toN; n++) {
    const text = state.doc.line(n).text;
    if (!String(text).trim()) continue;
    const para = paragraphSelectOfLine(text);
    if (first == null) first = para;
    else if (para !== first) mixed = true;
  }
  if (first == null) first = paragraphSelectOfLine(state.doc.lineAt(sel.head).text);
  return { value: first, mixed: mixed };
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @returns {{ ul: { on: boolean, mixed: boolean }, ol: { on: boolean, mixed: boolean }, task: { on: boolean, mixed: boolean } }}
 */
function deriveListToolbarState(state) {
  const sel = state.selection.main;
  const fromN = state.doc.lineAt(sel.from).number;
  const toN = state.doc.lineAt(sel.to).number;
  let total = 0;
  let bullet = 0;
  let ordered = 0;
  let task = 0;
  for (let n = fromN; n <= toN; n++) {
    const text = state.doc.line(n).text;
    if (!String(text).trim()) continue;
    total += 1;
    const fmt = blockFormatOfLine(text);
    if (fmt === 'bullet') bullet += 1;
    else if (fmt === 'ordered') ordered += 1;
    else if (fmt === 'task') task += 1;
  }
  function flag(count) {
    if (!total || count <= 0) return { on: false, mixed: false };
    if (count >= total) return { on: true, mixed: false };
    return { on: false, mixed: true };
  }
  return { ul: flag(bullet), ol: flag(ordered), task: flag(task) };
}

/**
 * @param {import('@codemirror/state').EditorState} state
 */
function selectionCanOutdent(state) {
  const sel = state.selection.main;
  const fromN = state.doc.lineAt(sel.from).number;
  const toN = state.doc.lineAt(sel.to).number;
  for (let n = fromN; n <= toN; n++) {
    const text = state.doc.line(n).text;
    if (!String(text).trim()) continue;
    if (/^ /.test(text)) return true;
    const fmt = blockFormatOfLine(text);
    if (fmt === 'bullet' || fmt === 'ordered' || fmt === 'task') return true;
  }
  return false;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {string} markName
 * @param {number} [from]
 * @param {number} [to]
 * @returns {{ on: boolean, mixed: boolean }}
 */
function markCoverage(state, markName, from, to) {
  if (from == null || to == null) {
    const sel = state.selection.main;
    from = sel.from;
    to = sel.to;
  }
  let tree;
  try {
    tree = syntaxTree(state);
  } catch (_) {
    return { on: false, mixed: false };
  }
  if (from === to) {
    const key =
      markName === 'StrongEmphasis'
        ? 'bold'
        : markName === 'Emphasis'
          ? 'italic'
          : markName === 'Strikethrough'
            ? 'strike'
            : markName === 'InlineCode'
              ? 'code'
              : '';
    if (key && posInMarkRegion(state, from, key)) return { on: true, mixed: false };
    let node = tree.resolveInner(from, 1);
    while (node) {
      if (node.name === markName) return { on: true, mixed: false };
      node = node.parent;
    }
    node = tree.resolveInner(from, -1);
    while (node) {
      if (node.name === markName) return { on: true, mixed: false };
      node = node.parent;
    }
    return { on: false, mixed: false };
  }
  let covered = 0;
  tree.iterate({
    from: from,
    to: to,
    enter: function (node) {
      if (node.name === markName) {
        const a = Math.max(from, node.from);
        const b = Math.min(to, node.to);
        if (b > a) covered += b - a;
        return false;
      }
    },
  });
  const len = to - from;
  if (covered <= 0) return { on: false, mixed: false };
  if (covered >= len) return { on: true, mixed: false };
  return { on: false, mixed: true };
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} [from]
 * @param {number} [to]
 * @returns {{ on: boolean, mixed: boolean }}
 */
function underlineCoverage(state, from, to) {
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
  const ranges = findUnderlineRanges(text, exclude);
  const sel = state.selection.main;
  if (from == null || to == null) {
    from = sel.from;
    to = sel.to;
  }
  if (from === to) {
    const pos = from;
    if (posInMarkRegion(state, pos, 'underline')) return { on: true, mixed: false };
    for (let i = 0; i < ranges.length; i++) {
      if (pos > ranges[i].from && pos < ranges[i].to) return { on: true, mixed: false };
    }
    return { on: false, mixed: false };
  }
  let covered = 0;
  for (let i = 0; i < ranges.length; i++) {
    const a = Math.max(from, ranges[i].from);
    const b = Math.min(to, ranges[i].to);
    if (b > a) covered += b - a;
  }
  const len = to - from;
  if (covered <= 0) return { on: false, mixed: false };
  if (covered >= len) return { on: true, mixed: false };
  return { on: false, mixed: true };
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @returns {{ bold: { on: boolean, mixed: boolean }, italic: { on: boolean, mixed: boolean }, underline: { on: boolean, mixed: boolean }, strike: { on: boolean, mixed: boolean }, code: { on: boolean, mixed: boolean } }}
 */
function getInlineToolbarState(state) {
  const sel = state.selection.main;
  return getInlineToolbarStateAt(state, sel.from, sel.to);
}

/**
 * 用 collectMarkRegions 的 content 算覆盖（叠套 `~~~` 也正确）。
 * @param {{ open: {from:number,to:number}, content: {from:number,to:number}, close: {from:number,to:number} }[]} regions
 * @param {number} from
 * @param {number} to
 */
function regionContentCoverage(regions, from, to) {
  if (from === to) {
    const pos = from;
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      if (pos >= r.open.from && pos <= r.close.to) return { on: true, mixed: false };
    }
    return { on: false, mixed: false };
  }
  let covered = 0;
  for (let i = 0; i < regions.length; i++) {
    const c = regions[i].content;
    const a = Math.max(from, c.from);
    const b = Math.min(to, c.to);
    if (b > a) covered += b - a;
  }
  const len = to - from;
  if (covered <= 0) return { on: false, mixed: false };
  if (covered >= len) return { on: true, mixed: false };
  return { on: false, mixed: true };
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 */
function getInlineToolbarStateAt(state, from, to) {
  return {
    bold: markCoverage(state, 'StrongEmphasis', from, to),
    italic: markCoverage(state, 'Emphasis', from, to),
    underline: regionContentCoverage(collectMarkRegions(state, 'underline'), from, to),
    strike: regionContentCoverage(collectMarkRegions(state, 'strike'), from, to),
    code: markCoverage(state, 'InlineCode', from, to),
  };
}

/**
 * 折叠光标处是否具备各字符格式（用于后续输入对照）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @returns {{ bold: boolean, italic: boolean, underline: boolean, strike: boolean, code: boolean }}
 */
function getInlineFlagsAt(state, pos) {
  return getInlineFlagsAtPos(state, pos);
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @returns {{ bold: boolean, italic: boolean, strike: boolean, code: boolean, link: boolean }}
 */
function getInlineActive(state) {
  const marks = getInlineToolbarState(state);
  const active = {
    bold: marks.bold.on,
    italic: marks.italic.on,
    underline: marks.underline.on,
    strike: marks.strike.on,
    code: marks.code.on,
    link: false,
  };
  const pos = state.selection.main.head;
  let tree;
  try {
    tree = syntaxTree(state);
  } catch (_) {
    return active;
  }
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (node.name === 'Link') active.link = true;
    node = node.parent;
  }
  return active;
}

module.exports = {
  blockFormatOfLine: blockFormatOfLine,
  paragraphSelectOfLine: paragraphSelectOfLine,
  deriveBlockFormat: deriveBlockFormat,
  deriveParagraphSelect: deriveParagraphSelect,
  deriveListToolbarState: deriveListToolbarState,
  selectionCanOutdent: selectionCanOutdent,
  getInlineActive: getInlineActive,
  getInlineToolbarState: getInlineToolbarState,
  getInlineToolbarStateAt: getInlineToolbarStateAt,
  getInlineFlagsAt: getInlineFlagsAt,
};

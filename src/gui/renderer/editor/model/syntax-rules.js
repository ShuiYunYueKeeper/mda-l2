/**
 * P2 §2 语法规则表（S1–S12）。
 * markRanges 只描述「需隐藏的语法标记」区间，不改文本。
 */
'use strict';

/**
 * @typedef {{ from: number, to: number, type: string, listKind?: string }} SyntaxNode
 * @typedef {{ from: number, to: number }} MarkRange
 * @typedef {{
 *   class: 'R'|'W'|'P',
 *   cls?: string,
 *   widget?: string,
 *   markRanges: (node: SyntaxNode, text: string) => MarkRange[],
 *   contentRange?: (node: SyntaxNode, text: string) => { from: number, to: number } | null,
 *   hrefOf?: (node: SyntaxNode, text: string) => string,
 * }} SyntaxRule
 */

function pairedMarks(node, text, markLen) {
  if (node.to - node.from < markLen * 2) return [];
  const open = text.slice(node.from, node.from + markLen);
  const close = text.slice(node.to - markLen, node.to);
  if (open !== close) return [];
  return [
    { from: node.from, to: node.from + markLen },
    { from: node.to - markLen, to: node.to },
  ];
}

function atxMarkRanges(node, text) {
  const level = Number(node.type.slice(-1));
  if (!(level >= 1 && level <= 6)) return [];
  let end = node.from + level;
  if (end < node.to && text.charAt(end) === ' ') end += 1;
  if (end > node.from) return [{ from: node.from, to: Math.min(end, node.to) }];
  return [];
}

function atxContentRange(node, text) {
  const marks = atxMarkRanges(node, text);
  if (!marks.length) return { from: node.from, to: node.to };
  return { from: marks[0].to, to: node.to };
}

function pairedContentRange(node, text, markLen) {
  const marks = pairedMarks(node, text, markLen);
  if (marks.length < 2) return null;
  return { from: marks[0].to, to: marks[1].from };
}

function linkMarkRanges(node, text) {
  const slice = text.slice(node.from, node.to);
  const m = /^\[([\s\S]*?)\]\(([\s\S]*?)\)$/.exec(slice);
  if (!m) return [];
  const textStart = node.from + 1;
  const textEnd = textStart + m[1].length;
  return [
    { from: node.from, to: textStart },
    { from: textEnd, to: node.to },
  ];
}

function linkContentRange(node, text) {
  const slice = text.slice(node.from, node.to);
  const m = /^\[([\s\S]*?)\]\(([\s\S]*?)\)$/.exec(slice);
  if (!m) return null;
  return { from: node.from + 1, to: node.from + 1 + m[1].length };
}

function linkHref(node, text) {
  const slice = text.slice(node.from, node.to);
  const m = /^\[([\s\S]*?)\]\(([\s\S]*?)\)$/.exec(slice);
  return m ? String(m[2] || '').trim() : '';
}

function autolinkMarkRanges(node, text) {
  if (node.to - node.from < 3) return [];
  if (text.charAt(node.from) !== '<' || text.charAt(node.to - 1) !== '>') return [];
  return [
    { from: node.from, to: node.from + 1 },
    { from: node.to - 1, to: node.to },
  ];
}

/** @type {Record<string, SyntaxRule>} */
const SYNTAX_RULES = {
  ATXHeading1: {
    class: 'R',
    cls: 'mda-cm-h1',
    markRanges: atxMarkRanges,
    contentRange: atxContentRange,
  },
  ATXHeading2: {
    class: 'R',
    cls: 'mda-cm-h2',
    markRanges: atxMarkRanges,
    contentRange: atxContentRange,
  },
  ATXHeading3: {
    class: 'R',
    cls: 'mda-cm-h3',
    markRanges: atxMarkRanges,
    contentRange: atxContentRange,
  },
  ATXHeading4: {
    class: 'R',
    cls: 'mda-cm-h4',
    markRanges: atxMarkRanges,
    contentRange: atxContentRange,
  },
  ATXHeading5: {
    class: 'R',
    cls: 'mda-cm-h5',
    markRanges: atxMarkRanges,
    contentRange: atxContentRange,
  },
  ATXHeading6: {
    class: 'R',
    cls: 'mda-cm-h6',
    markRanges: atxMarkRanges,
    contentRange: atxContentRange,
  },
  StrongEmphasis: {
    class: 'R',
    cls: 'mda-cm-strong',
    markRanges: function (node, text) {
      return pairedMarks(node, text, 2);
    },
    contentRange: function (node, text) {
      return pairedContentRange(node, text, 2);
    },
  },
  Emphasis: {
    class: 'R',
    cls: 'mda-cm-em',
    markRanges: function (node, text) {
      return pairedMarks(node, text, 1);
    },
    contentRange: function (node, text) {
      return pairedContentRange(node, text, 1);
    },
  },
  Strikethrough: {
    class: 'R',
    cls: 'mda-cm-strike',
    markRanges: function (node, text) {
      return pairedMarks(node, text, 2);
    },
    contentRange: function (node, text) {
      return pairedContentRange(node, text, 2);
    },
  },
  InlineCode: {
    class: 'R',
    cls: 'mda-cm-code',
    markRanges: function (node, text) {
      let i = node.from;
      while (i < node.to && text.charAt(i) === '`') i += 1;
      let j = node.to;
      while (j > i && text.charAt(j - 1) === '`') j -= 1;
      if (i <= node.from || j >= node.to) return [];
      return [
        { from: node.from, to: i },
        { from: j, to: node.to },
      ];
    },
    contentRange: function (node, text) {
      const marks = SYNTAX_RULES.InlineCode.markRanges(node, text);
      if (marks.length < 2) return null;
      return { from: marks[0].to, to: marks[1].from };
    },
  },
  // S6
  Link: {
    class: 'R',
    cls: 'mda-cm-link',
    markRanges: linkMarkRanges,
    contentRange: linkContentRange,
    hrefOf: linkHref,
  },
  // S7 <url>
  Autolink: {
    class: 'R',
    cls: 'mda-cm-link',
    markRanges: autolinkMarkRanges,
    contentRange: function (node, text) {
      const marks = autolinkMarkRanges(node, text);
      if (marks.length < 2) return { from: node.from, to: node.to };
      return { from: marks[0].to, to: marks[1].from };
    },
    hrefOf: function (node, text) {
      const marks = autolinkMarkRanges(node, text);
      if (marks.length < 2) return text.slice(node.from, node.to);
      return text.slice(marks[0].to, marks[1].from).trim();
    },
  },
  // S7 裸 URL（GFM）
  URL: {
    class: 'R',
    cls: 'mda-cm-link',
    markRanges: function () {
      return [];
    },
    contentRange: function (node) {
      return { from: node.from, to: node.to };
    },
    hrefOf: function (node, text) {
      return text.slice(node.from, node.to).trim();
    },
  },
  // S8/S9 — ListMark；无序隐藏，有序保留（build-specs 按 listKind 分流）
  ListMark: {
    class: 'R',
    cls: 'mda-cm-list-mark',
    markRanges: function (node) {
      // 有序列表原样显示
      if (node.listKind === 'ordered') return [];
      return [{ from: node.from, to: node.to }];
    },
    contentRange: function () {
      return null;
    },
  },
  // S10
  TaskMarker: {
    class: 'W',
    widget: 'task',
    markRanges: function (node) {
      return [{ from: node.from, to: node.to }];
    },
  },
  // S11
  QuoteMark: {
    class: 'R',
    cls: 'mda-cm-quote-mark',
    markRanges: function (node) {
      return [{ from: node.from, to: node.to }];
    },
  },
  // S12
  HorizontalRule: {
    class: 'W',
    widget: 'hr',
    markRanges: function (node) {
      return [{ from: node.from, to: node.to }];
    },
  },
  // S13
  FencedCode: {
    class: 'W',
    widget: 'code',
    markRanges: function (node) {
      return [{ from: node.from, to: node.to }];
    },
  },
  // S14
  Table: {
    class: 'W',
    widget: 'table',
    markRanges: function (node) {
      return [{ from: node.from, to: node.to }];
    },
  },
  // S22
  Image: {
    class: 'W',
    widget: 'image',
    markRanges: function (node) {
      return [{ from: node.from, to: node.to }];
    },
  },
};

module.exports = {
  SYNTAX_RULES: SYNTAX_RULES,
  pairedMarks: pairedMarks,
};

/**
 * 批注添加上下文：正文/标题支持选区批注；代码/图/表/流程图/分割线仅块级批注。
 */
'use strict';

const { expandGfmTableRange } = require('./parse-table');
const { buildCodeFenceMask } = require('./parse-math');
const { focusInWidgetInlineEditable } = require('../widget-editable-guard');
const { getSelectedCodeBlock } = require('../widgets/code-selection');
const { getSelectedMermaidBlock } = require('../widgets/mermaid-selection');
const { getSelectedImageBlock } = require('../widgets/image-selection');
const { getSelectedBlockOfKind } = require('../widgets/block-selection');
const { getSelectedMathBlock } = require('../widgets/math-selection');

const IMAGE_LINE_RE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
const HR_LINE_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

/** @type {Record<string, true>} */
const BLOCK_ONLY_KINDS = {
  code: true,
  mermaid: true,
  image: true,
  hr: true,
  table: true,
  math: true,
};

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * @param {string} text
 * @param {number} pos
 * @returns {number}
 */
function lineIndexAtPos(text, pos) {
  const t = normalizeText(text);
  let line = 0;
  const p = Math.max(0, Math.min(pos, t.length));
  for (let i = 0; i < p; i++) {
    if (t.charAt(i) === '\n') line++;
  }
  return line;
}

/**
 * @param {string[]} lines
 * @param {number} lineIdx
 * @returns {{ line: number, info: string } | null}
 */
function findFenceOpenLine(lines, lineIdx) {
  for (let i = lineIdx; i >= 0; i--) {
    const m = lines[i].match(/^ {0,3}(`{3,}|~{3,})([^\n`~]*)/);
    if (m) return { line: i, info: String(m[2] || '').trim() };
  }
  return null;
}

/**
 * @param {string} text
 * @param {number} pos
 * @returns {'code'|'mermaid'|'table'|'image'|'hr'|'heading'|'prose'}
 */
function blockKindAtPos(text, pos) {
  const t = normalizeText(text);
  const lines = t.split('\n');
  const lineIdx = lineIndexAtPos(t, pos);
  const line = lines[lineIdx] || '';
  const mask = buildCodeFenceMask(lines);

  if (mask[lineIdx]) {
    const open = findFenceOpenLine(lines, lineIdx);
    if (open && /^mermaid\b/i.test(open.info)) return 'mermaid';
    return 'code';
  }

  if (IMAGE_LINE_RE.test(line)) return 'image';
  if (HR_LINE_RE.test(line)) return 'hr';

  if (/^\s*\|/.test(line)) {
    try {
      const table = expandGfmTableRange(t, pos, pos + 1);
      if (table && pos >= table.from && pos < table.to) return 'table';
    } catch (_) {
      /* ignore */
    }
  }

  if (/^\s*#{1,6}(?:\s|$)/.test(line)) return 'heading';
  return 'prose';
}

/**
 * @param {string} kind
 * @returns {boolean}
 */
function isBlockOnlyKind(kind) {
  return !!BLOCK_ONLY_KINDS[kind];
}

/**
 * @param {string} text
 * @param {number} from
 * @param {number} to
 * @returns {boolean}
 */
function canUseSelectionAnnoForRange(text, from, to) {
  if (!(from < to)) return false;
  const t = normalizeText(text);
  const end = Math.max(from, to - 1);
  const kinds = [
    blockKindAtPos(t, from),
    blockKindAtPos(t, Math.floor((from + to) / 2)),
    blockKindAtPos(t, end),
  ];
  for (let i = 0; i < kinds.length; i++) {
    if (isBlockOnlyKind(kinds[i])) return false;
  }
  return true;
}

/**
 * @param {import('@codemirror/state').Text} doc
 * @param {number} pos
 * @returns {number}
 */
function line1AtPos(doc, pos) {
  return doc.lineAt(Math.max(0, Math.min(pos, doc.length))).number;
}

/**
 * @returns {{ kind: string, from: number, to: number } | null}
 */
function getSelectedBlockOnly() {
  const mermaid = getSelectedMermaidBlock();
  if (mermaid && mermaid.from != null) {
    return { kind: 'mermaid', from: mermaid.from, to: mermaid.to };
  }
  const code = getSelectedCodeBlock();
  if (code && code.from != null) {
    return { kind: 'code', from: code.from, to: code.to };
  }
  const image = getSelectedImageBlock();
  if (image && image.from != null) {
    return { kind: 'image', from: image.from, to: image.to };
  }
  const table = getSelectedBlockOfKind('table');
  if (table) return { kind: 'table', from: table.from, to: table.to };
  const hr = getSelectedBlockOfKind('hr');
  if (hr) return { kind: 'hr', from: hr.from, to: hr.to };
  const math = getSelectedMathBlock();
  if (math && math.from != null) {
    return { kind: 'math', from: math.from, to: math.to };
  }
  return null;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @returns {{
 *   canPanelAdd: boolean,
 *   blockOnly: boolean,
 *   line: number | null,
 *   kind: string | null,
 *   reason: string | null,
 * }}
 */
function resolveCm6AnnoPanelContext(view) {
  if (!view || !view.state) {
    return { canPanelAdd: false, blockOnly: false, line: null, kind: null, reason: 'no-view' };
  }
  if (focusInWidgetInlineEditable()) {
    return {
      canPanelAdd: false,
      blockOnly: false,
      line: null,
      kind: null,
      reason: 'widget-editable',
    };
  }
  const doc = view.state.doc;
  const text = doc.toString();
  const selBlock = getSelectedBlockOnly();
  if (selBlock) {
    return {
      canPanelAdd: true,
      blockOnly: true,
      line: line1AtPos(doc, selBlock.from),
      kind: selBlock.kind,
      reason: null,
    };
  }
  const pos = view.state.selection.main.head;
  const kind = blockKindAtPos(text, pos);
  return {
    canPanelAdd: true,
    blockOnly: isBlockOnlyKind(kind),
    line: line1AtPos(doc, pos),
    kind: kind,
    reason: null,
  };
}

/**
 * @param {{ from: number, to: number }} block
 * @returns {number | null}
 */
function blockAnnotationLine(view, block) {
  if (!view || !view.state || !block || block.from == null) return null;
  return line1AtPos(view.state.doc, block.from);
}

module.exports = {
  BLOCK_ONLY_KINDS: BLOCK_ONLY_KINDS,
  blockKindAtPos: blockKindAtPos,
  isBlockOnlyKind: isBlockOnlyKind,
  canUseSelectionAnnoForRange: canUseSelectionAnnoForRange,
  resolveCm6AnnoPanelContext: resolveCm6AnnoPanelContext,
  blockAnnotationLine: blockAnnotationLine,
};

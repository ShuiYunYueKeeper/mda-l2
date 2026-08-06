/**
 * 预览正文选区：原生 ::selection 透明 + 自绘层（只盖实际字符，叠在行内 code 之上）。
 *
 * 注意：layer({ class }) / classList.add 只能是单个 class token，不能含空格，
 * 否则插件直接崩溃（DOMException），选区回落成「整行发蓝 / 看不见」。
 */
'use strict';

const { Prec } = require('@codemirror/state');
const { EditorView, layer, RectangleMarker, Direction } = require('@codemirror/view');

/** 紧致选区层唯一 class（禁止空格） */
var TIGHT_LAYER_CLASS = 'mda-cm-tight-sel-layer';
/** 选区矩形唯一 class（RectangleMarker 虽可用 className 多类，统一单 token 更稳） */
var TIGHT_MARK_CLASS = 'mda-cm-tight-sel';

const { isWidgetInlineEditableTarget } = require('../widget-editable-guard');

function focusInWidgetInlineEditable() {
  if (typeof document === 'undefined') return false;
  const ae = document.activeElement;
  if (!ae || !ae.closest) return false;
  return isWidgetInlineEditableTarget(ae);
}

/**
 * widget 内 coordsAtPos 不可靠：采样全空或纵跳过大则跳过紧致层。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 */
function rangeHasUnreliableCoords(view, from, to) {
  if (from >= to) return true;
  const samples = [from, Math.floor((from + to) / 2), to - 1];
  let nullCount = 0;
  let lastTop = null;
  const maxJump = Math.max(120, (view.scrollDOM && view.scrollDOM.clientHeight) || 600);
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    if (p < from || p >= to) continue;
    const c = charCoordsAt(view, p);
    if (!c) {
      nullCount++;
      continue;
    }
    if (lastTop != null && Math.abs(c.top - lastTop) > maxJump) return true;
    lastTop = c.top;
  }
  return nullCount >= 2;
}

function getBase(view) {
  const rect = view.scrollDOM.getBoundingClientRect();
  const left =
    view.textDirection === Direction.LTR
      ? rect.left
      : rect.right - view.scrollDOM.clientWidth * view.scaleX;
  return {
    left: left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}

/**
 * 文档区间 [from, from+1) 对应字符的视口矩形（合并左右落点，避免末字缺右缘）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 */
function charCoordsAt(view, from) {
  const a = view.coordsAtPos(from, 1);
  const b = view.coordsAtPos(from + 1, -1);
  if (a && b) {
    return {
      left: Math.min(a.left, b.left),
      right: Math.max(a.right, b.right),
      top: Math.min(a.top, b.top),
      bottom: Math.max(a.bottom, b.bottom),
    };
  }
  return a || b || null;
}

/**
 * 按视觉行切段，水平/垂直均来自 coordsAtPos（视口坐标），勿混用 lineBlockAt 文档坐标。
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number }} range
 */
function tightMarkersForRange(view, range) {
  if (!range || range.from === range.to) return [];
  if (range.to <= view.viewport.from || range.from >= view.viewport.to) return [];
  let from = Math.max(range.from, view.viewport.from);
  let to = Math.min(range.to, view.viewport.to);
  if (from >= to) return [];
  if (rangeHasUnreliableCoords(view, from, to)) return [];

  const base = getBase(view);
  const markers = [];
  const maxW = Math.max(400, (view.scrollDOM && view.scrollDOM.clientWidth) || 800) * 2;
  const maxH = Math.max(300, (view.scrollDOM && view.scrollDOM.clientHeight) || 600) * 2;
  const len = to - from;
  const fromLine = view.state.doc.lineAt(from);
  const toLine = view.state.doc.lineAt(Math.max(from, to - 1));
  if (fromLine.number !== toLine.number && len > 400) {
    let pos = from;
    while (pos < to) {
      const line = view.state.doc.lineAt(pos);
      const a = Math.max(from, line.from);
      const b = Math.min(to, line.to);
      if (a < b) {
        const part = tightMarkersForRange(view, { from: a, to: b });
        for (let i = 0; i < part.length; i++) markers.push(part[i]);
      }
      if (line.to >= to) break;
      pos = line.to + 1;
    }
    return markers;
  }

  let rowFrom = -1;
  let rowTop = null;
  let rowBottom = null;
  let rowLeft = null;
  let rowRight = null;

  function resetRow() {
    rowFrom = -1;
    rowTop = rowBottom = rowLeft = rowRight = null;
  }

  function flush(endPos) {
    if (rowFrom < 0 || rowLeft == null || rowTop == null) {
      resetRow();
      return;
    }
    const lastChar = endPos - 1;
    if (lastChar >= rowFrom) {
      const cLast = charCoordsAt(view, lastChar);
      if (cLast) {
        rowRight = Math.max(rowRight, cLast.right);
        rowTop = Math.min(rowTop, cLast.top);
        rowBottom = Math.max(rowBottom, cLast.bottom);
        rowLeft = Math.min(rowLeft, cLast.left);
      }
    }
    const right = rowRight;
    const top = rowTop;
    const bottom = rowBottom;
    const left = rowLeft;
    if (right > left && bottom > top) {
      const w = right - left;
      const h = bottom - top;
      if (w <= maxW && h <= maxH) {
        markers.push(
          new RectangleMarker(TIGHT_MARK_CLASS, left - base.left, top - base.top, w, h)
        );
      }
    }
    resetRow();
  }

  for (let pos = from; pos < to; pos++) {
    const c = charCoordsAt(view, pos);
    if (!c) continue;
    if (rowTop == null) {
      rowFrom = pos;
      rowTop = c.top;
      rowBottom = c.bottom;
      rowLeft = c.left;
      rowRight = c.right;
      continue;
    }
    if (Math.abs(c.top - rowTop) > 3) {
      flush(pos);
      rowFrom = pos;
      rowTop = c.top;
      rowBottom = c.bottom;
      rowLeft = c.left;
      rowRight = c.right;
    } else {
      rowLeft = Math.min(rowLeft, c.left);
      rowRight = Math.max(rowRight, c.right);
      rowBottom = Math.max(rowBottom, c.bottom);
      rowTop = Math.min(rowTop, c.top);
    }
  }
  flush(to);
  return markers;
}

function createTightSelectionLayer() {
  return layer({
    // 叠在行内 code 灰底之上；须 pointer-events:none 避免挡点击/关窗
    above: true,
    class: TIGHT_LAYER_CLASS,
    markers: function (view) {
      if (focusInWidgetInlineEditable()) return [];
      const out = [];
      const ranges = view.state.selection.ranges;
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        if (r.empty) continue;
        const part = tightMarkersForRange(view, r);
        for (let j = 0; j < part.length; j++) out.push(part[j]);
      }
      return out;
    },
    update: function (update) {
      return update.docChanged || update.selectionSet || update.viewportChanged;
    },
  });
}

function createProseSelectionTheme() {
  return Prec.highest(
    EditorView.theme({
      '.cm-selectionLayer': {
        display: 'none !important',
      },
      ['.' + TIGHT_LAYER_CLASS]: {
        display: 'block !important',
        visibility: 'visible !important',
        pointerEvents: 'none',
      },
      ['.' + TIGHT_LAYER_CLASS + ' .' + TIGHT_MARK_CLASS]: {
        display: 'block !important',
        opacity: '1 !important',
        pointerEvents: 'none',
        background: 'var(--cm-preview-sel-overlay) !important',
        borderRadius: '3px',
      },
      '.cm-line': {
        caretColor: 'var(--text) !important',
        '&::selection': {
          backgroundColor: 'transparent !important',
          color: 'inherit !important',
        },
        '& *::selection': {
          backgroundColor: 'transparent !important',
          color: 'inherit !important',
        },
      },
      '.cm-content': {
        caretColor: 'var(--text) !important',
        '&::selection': {
          backgroundColor: 'transparent !important',
        },
        '& *::selection': {
          backgroundColor: 'transparent !important',
        },
      },
      '.mda-cm-code-input[contenteditable="true"]::selection, .mda-cm-code-input[contenteditable="true"] *::selection, .mda-cm-mermaid-source-input[contenteditable="true"]::selection, .mda-cm-mermaid-source-input[contenteditable="true"] *::selection, .mda-cm-math-source-input[contenteditable="true"]::selection, .mda-cm-math-source-input[contenteditable="true"] *::selection, .mda-cm-table [contenteditable="true"]::selection, .mda-cm-table [contenteditable="true"] *::selection': {
        backgroundColor: 'var(--table-text-sel) !important',
      },
    })
  );
}

function createProseSelectionExtension() {
  return [createTightSelectionLayer(), createProseSelectionTheme()];
}

/** 源码模式：CM6 默认选区层，不用紧致自绘层 */
function createSourceSelectionExtension() {
  return EditorView.theme({
    ['.' + TIGHT_LAYER_CLASS]: {
      display: 'none !important',
    },
    '.cm-selectionLayer': {
      display: 'block !important',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--table-text-sel) !important',
    },
  });
}

module.exports = {
  createProseSelectionExtension: createProseSelectionExtension,
  createSourceSelectionExtension: createSourceSelectionExtension,
  createTightSelectionExtension: createProseSelectionExtension,
  createTightSelectionLayer: createTightSelectionLayer,
  tightMarkersForRange: tightMarkersForRange,
  charCoordsAt: charCoordsAt,
  rangeHasUnreliableCoords: rangeHasUnreliableCoords,
  focusInWidgetInlineEditable: focusInWidgetInlineEditable,
  TIGHT_LAYER_CLASS: TIGHT_LAYER_CLASS,
  TIGHT_MARK_CLASS: TIGHT_MARK_CLASS,
  visualSegments: function () {
    return [];
  },
};

/**
 * 正文选区：原生 ::selection 透明 + 自绘紧致层（只盖实际字符）。
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
 * 按视觉行切段，用字符 coords 取左右，不铺到行宽。
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number }} range
 */
function tightMarkersForRange(view, range) {
  if (!range || range.from === range.to) return [];
  if (range.to <= view.viewport.from || range.from >= view.viewport.to) return [];
  let from = Math.max(range.from, view.viewport.from);
  let to = Math.min(range.to, view.viewport.to);
  if (from >= to) return [];

  const base = getBase(view);
  const markers = [];
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
    const last = Math.max(rowFrom, endPos - 1);
    const cLast = view.coordsAtPos(last, -1) || view.coordsAtPos(last, 1);
    let right = rowRight;
    let top = rowTop;
    let bottom = rowBottom;
    let left = rowLeft;
    if (cLast) {
      right = Math.max(right, cLast.right);
      top = Math.min(top, cLast.top);
      bottom = Math.max(bottom, cLast.bottom);
      left = Math.min(left, cLast.left);
    }
    if (right > left && bottom > top) {
      markers.push(
        new RectangleMarker(TIGHT_MARK_CLASS, left - base.left, top - base.top, right - left, bottom - top)
      );
    }
    resetRow();
  }

  for (let pos = from; pos < to; pos++) {
    const c = view.coordsAtPos(pos, 1) || view.coordsAtPos(pos, -1);
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
    above: false,
    // 单个 token，禁止空格（classList.add）
    class: TIGHT_LAYER_CLASS,
    markers: function (view) {
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
      // 隐藏 CM6 默认选区层
      '.cm-selectionLayer': {
        display: 'none !important',
      },
      // 紧致层（cm-layer 由 CM6 自动加）
      ['.' + TIGHT_LAYER_CLASS]: {
        display: 'block !important',
        visibility: 'visible !important',
        pointerEvents: 'none',
      },
      ['.' + TIGHT_LAYER_CLASS + ' .' + TIGHT_MARK_CLASS]: {
        display: 'block !important',
        opacity: '1 !important',
        background: 'var(--table-text-sel) !important',
      },
      // 原生选区透明
      '.cm-line': {
        caretColor: 'transparent !important',
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
        caretColor: 'transparent !important',
        '&::selection': {
          backgroundColor: 'transparent !important',
        },
        '& *::selection': {
          backgroundColor: 'transparent !important',
        },
      },
    })
  );
}

function createProseSelectionExtension() {
  return [createTightSelectionLayer(), createProseSelectionTheme()];
}

module.exports = {
  createProseSelectionExtension: createProseSelectionExtension,
  createTightSelectionExtension: createProseSelectionExtension,
  createTightSelectionLayer: createTightSelectionLayer,
  tightMarkersForRange: tightMarkersForRange,
  TIGHT_LAYER_CLASS: TIGHT_LAYER_CLASS,
  TIGHT_MARK_CLASS: TIGHT_MARK_CLASS,
  visualSegments: function () {
    return [];
  },
};

/**
 * 预览模式：单击定位光标（hide-mark atomic / 标题行高 / 块 widget 邻接偶发冲突）。
 * 不阻断 mousedown 默认行为，以保留鼠标拖选；仅在单击未拖选时于 mouseup 校准落点。
 *
 * 优先用 caretRangeFromPoint + posAtDOM（跟视觉 DOM 对齐），避免高度图/隐藏语法导致的横纵漂移。
 */
'use strict';

const { EditorView } = require('@codemirror/view');

const DRAG_PX = 4;
/** 点击与映射 caret 超过此距离则在邻行重校准（仅 fallback 路径） */
const REFINE_DIST_PX = 10;

/** @type {{ x: number, y: number, shiftKey: boolean, dragging: boolean } | null} */
let mouseDown = null;

/**
 * @param {EventTarget | null} target
 */
function isBlockWidgetTarget(target) {
  if (!target || !target.closest) return false;
  return !!target.closest(
    '.mda-cm-image-block, .mda-cm-table-block, .mda-cm-code-block, .mda-cm-mermaid-block, .mda-cm-math-block, .mda-cm-hr-block'
  );
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ node: Node, offset: number } | null}
 */
function caretNodeFromPoint(clientX, clientY) {
  if (typeof document === 'undefined') return null;
  if (typeof document.caretRangeFromPoint === 'function') {
    try {
      const range = document.caretRangeFromPoint(clientX, clientY);
      if (range && range.startContainer) {
        return { node: range.startContainer, offset: range.startOffset };
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (typeof document.caretPositionFromPoint === 'function') {
    try {
      const pos = document.caretPositionFromPoint(clientX, clientY);
      if (pos && pos.offsetNode) {
        return { node: pos.offsetNode, offset: pos.offset };
      }
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

/**
 * DOM 落点 → 文档 pos（绕过高度图误差）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @returns {number | null}
 */
function posAtClickFromDom(view, clientX, clientY) {
  const hit =
    typeof document !== 'undefined' && document.elementFromPoint
      ? document.elementFromPoint(clientX, clientY)
      : null;
  if (isBlockWidgetTarget(hit)) return null;
  if (hit && hit.closest && !hit.closest('.cm-content')) return null;

  const caret = caretNodeFromPoint(clientX, clientY);
  if (!caret) return null;
  if (isBlockWidgetTarget(caret.node.nodeType === 1 ? caret.node : caret.node.parentElement)) {
    return null;
  }
  try {
    const pos = view.posAtDOM(caret.node, caret.offset);
    if (pos == null || pos < 0) return null;
    if (pos > view.state.doc.length) return view.state.doc.length;
    return pos;
  } catch (_) {
    return null;
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {import('@codemirror/state').Line} line
 * @returns {{ top: number, bottom: number } | null}
 */
function lineVerticalBand(view, line) {
  let top = Infinity;
  let bottom = -Infinity;
  const positions = [line.from];
  if (line.to > line.from) {
    positions.push(line.from + Math.floor((line.to - line.from) / 2));
    positions.push(Math.max(line.from, line.to - 1));
  }
  for (let i = 0; i < positions.length; i++) {
    const c1 = view.coordsAtPos(positions[i], 1);
    const c2 = view.coordsAtPos(positions[i], -1);
    if (c1) {
      top = Math.min(top, c1.top);
      bottom = Math.max(bottom, c1.bottom);
    }
    if (c2) {
      top = Math.min(top, c2.top);
      bottom = Math.max(bottom, c2.bottom);
    }
  }
  if (!isFinite(top) || !isFinite(bottom) || bottom < top) return null;
  if (bottom - top < 12) bottom = top + 26;
  return { top: top, bottom: bottom };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {import('@codemirror/state').Line} line
 * @param {number} clientX
 */
function posOnLineAtX(view, line, clientX) {
  const band = lineVerticalBand(view, line);
  if (!band) return line.from;
  const midY = (band.top + band.bottom) / 2;
  let p = view.posAtCoords({ x: clientX, y: midY }, 1);
  if (p == null) p = view.posAtCoords({ x: clientX, y: midY }, -1);
  if (p == null) return line.from;
  if (p < line.from) return line.from;
  if (p > line.to) return line.to;
  return p;
}

/**
 * 仅在点击 Y 落在行带内的邻行中重选（fallback）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} hintPos
 */
function refinePosAtClick(view, clientX, clientY, hintPos) {
  const doc = view.state.doc;
  const hintLine = doc.lineAt(hintPos);
  let bestPos = hintPos;
  let bestScore = Infinity;
  let foundInY = false;

  const fromN = Math.max(1, hintLine.number - 2);
  const toN = Math.min(doc.lines, hintLine.number + 2);
  for (let n = fromN; n <= toN; n++) {
    const line = doc.line(n);
    const band = lineVerticalBand(view, line);
    if (!band) continue;
    const inY = clientY >= band.top - 2 && clientY <= band.bottom + 2;
    if (!inY) continue;
    foundInY = true;
    const p = posOnLineAtX(view, line, clientX);
    const caret = view.coordsAtPos(p, p <= line.from ? 1 : -1);
    if (!caret) continue;
    const dx = caret.left - clientX;
    const dy = (caret.top + caret.bottom) / 2 - clientY;
    const score = dx * dx * 0.2 + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      bestPos = p;
    }
  }
  return foundInY ? bestPos : hintPos;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function posAtClick(view, clientX, clientY) {
  const fromDom = posAtClickFromDom(view, clientX, clientY);
  if (fromDom != null) return fromDom;

  if (typeof document !== 'undefined' && document.elementFromPoint) {
    const el = document.elementFromPoint(clientX, clientY);
    if (isBlockWidgetTarget(el)) return null;
  }

  let pos = view.posAtCoords({ x: clientX, y: clientY }, 1);
  if (pos == null) pos = view.posAtCoords({ x: clientX, y: clientY }, -1);
  if (pos == null) return null;

  const caret = view.coordsAtPos(pos, 1) || view.coordsAtPos(pos, -1);
  if (caret) {
    const dx = caret.left - clientX;
    const dy = (caret.top + caret.bottom) / 2 - clientY;
    if (dx * dx + dy * dy > REFINE_DIST_PX * REFINE_DIST_PX) {
      pos = refinePosAtClick(view, clientX, clientY, pos);
    }
  } else {
    pos = refinePosAtClick(view, clientX, clientY, pos);
  }
  return pos;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function placeCaret(view, clientX, clientY) {
  if (!view || view.destroyed) return;
  if (typeof document !== 'undefined' && document.elementFromPoint) {
    const el = document.elementFromPoint(clientX, clientY);
    if (isBlockWidgetTarget(el)) return;
  }
  const pos = posAtClick(view, clientX, clientY);
  if (pos == null) return;
  const sel = view.state.selection.main;
  // 单击须强制坍缩为 caret；即使当前是 atomic 整段选中也要改掉
  if (sel.from === sel.to && sel.head === pos) return;
  view.dispatch({
    selection: { anchor: pos, head: pos },
    scrollIntoView: false,
  });
}

function createClickCollapseExtension() {
  return EditorView.domEventHandlers({
    mousedown: function (event) {
      if (event.button !== 0) return false;
      if (isBlockWidgetTarget(event.target)) return false;
      mouseDown = {
        x: event.clientX,
        y: event.clientY,
        shiftKey: !!event.shiftKey,
        dragging: false,
      };
      return false;
    },
    mousemove: function (event) {
      if (!mouseDown || mouseDown.dragging || mouseDown.shiftKey) return false;
      const dx = event.clientX - mouseDown.x;
      const dy = event.clientY - mouseDown.y;
      if (dx * dx + dy * dy > DRAG_PX * DRAG_PX) {
        mouseDown.dragging = true;
      }
      return false;
    },
    mouseup: function (event, view) {
      if (event.button !== 0 || !mouseDown) return false;
      const start = mouseDown;
      mouseDown = null;
      if (isBlockWidgetTarget(event.target)) return false;
      if (start.shiftKey || event.shiftKey) return false;
      if (event.detail >= 2) return false;
      // 仅跳过用户真实拖选；CM6 单击 atomic hide-mark 会整段选中（from≠to），
      // 若因此跳过校准，就会出现「校准落点对、head 飘走、横向 Δ 上百 px」。
      if (start.dragging) return false;
      const x = event.clientX;
      const y = event.clientY;
      // 延后一帧，盖过 CM6 同步阶段的选区写入
      requestAnimationFrame(function () {
        placeCaret(view, x, y);
      });
      return false;
    },
  });
}

module.exports = {
  createClickCollapseExtension: createClickCollapseExtension,
  posAtClick: posAtClick,
  posAtClickFromDom: posAtClickFromDom,
  placeCaret: placeCaret,
  refinePosAtClick: refinePosAtClick,
  isBlockWidgetTarget: isBlockWidgetTarget,
};

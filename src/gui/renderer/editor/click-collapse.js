/**
 * 预览模式：单击/拖选/双击/三击定位与选区（hide-mark / 块 widget 高度图失真校准）。
 */
'use strict';

const { EditorView } = require('@codemirror/view');
const { EditorSelection } = require('@codemirror/state');
const { adjustCaretForHiddenMarks, adjustSelectionForHiddenMarks } = require('./caret-syntax-adjust');

const DRAG_PX = 4;
/** 点击与映射 caret 超过此距离则在邻行重校准（仅 fallback 路径） */
const REFINE_DIST_PX = 10;

/** @type {{ x: number, y: number, shiftKey: boolean, dragging: boolean, handledMultiClick?: boolean, view: import('@codemirror/view').EditorView } | null} */
let mouseDown = null;
let docPointerEndBound = false;

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function takeMouseDownForView(view) {
  if (!mouseDown || mouseDown.view !== view) return null;
  const start = mouseDown;
  mouseDown = null;
  return start;
}

function takeAnyMouseDown() {
  if (!mouseDown) return null;
  const start = mouseDown;
  mouseDown = null;
  return start;
}

function ensureDocPointerEndListeners() {
  if (docPointerEndBound || typeof document === 'undefined') return;
  docPointerEndBound = true;
  document.addEventListener(
    'mouseup',
    function (event) {
      if (event.button !== 0) return;
      const start = takeAnyMouseDown();
      if (!start || start.view.destroyed) return;
      finalizePointerUp(start.view, start, event.clientX, event.clientY, event.detail);
    },
    true
  );
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ x: number, y: number, shiftKey: boolean, dragging: boolean, handledMultiClick?: boolean, view: import('@codemirror/view').EditorView }} start
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} detail
 * @param {{ skipClickCaret?: boolean }} [options]
 */
function finalizePointerUp(view, start, clientX, clientY, detail, options) {
  if (!view || view.destroyed || start.shiftKey) return;
  if (start.handledMultiClick || detail >= 2) return;
  const dx = clientX - start.x;
  const dy = clientY - start.y;
  const moved = start.dragging || dx * dx + dy * dy > DRAG_PX * DRAG_PX;
  if (moved) {
    const pointer = {
      startX: start.x,
      startY: start.y,
      endX: clientX,
      endY: clientY,
    };
    adjustDragSelection(view, pointer);
    requestAnimationFrame(function () {
      adjustDragSelection(view, pointer);
    });
    return;
  }
  if (options && options.skipClickCaret) return;
  placeCaret(view, clientX, clientY);
  requestAnimationFrame(function () {
    if (!view || view.destroyed) return;
    placeCaret(view, clientX, clientY);
  });
}

/**
 * @param {EventTarget | null} target
 */
function isBlockWidgetTarget(target) {
  if (!target || !target.closest) return false;
  return !!target.closest(
    '.mda-cm-image-block, .mda-cm-table-block, .mda-cm-code-block, .mda-cm-mermaid-block, .mda-cm-math-block, .mda-cm-hr-block, .mda-cm-math-inline'
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
 * @param {number} pos
 * @returns {HTMLElement | null}
 */
function lineElementAt(view, pos) {
  try {
    const at = view.domAtPos(pos, 1);
    let node = at && at.node;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentElement;
    return node && node.closest ? /** @type {HTMLElement} */ (node.closest('.cm-line')) : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @returns {HTMLElement | null}
 */
function cmLineElementAtPoint(view, clientX, clientY) {
  if (typeof document === 'undefined' || !view || !view.dom) return null;
  const caret = caretNodeFromPoint(clientX, clientY);
  if (caret) {
    const el = caret.node.nodeType === 3 ? caret.node.parentElement : caret.node;
    if (el && el.closest) {
      const hit = el.closest('.cm-line');
      if (hit && view.dom.contains(hit)) return /** @type {HTMLElement} */ (hit);
    }
  }
  const target = document.elementFromPoint(clientX, clientY);
  if (!target || !view.dom.contains(target)) return null;
  if (target.closest) {
    const hit = target.closest('.cm-line');
    if (hit) return /** @type {HTMLElement} */ (hit);
  }
  let best = null;
  let bestDy = Infinity;
  const lines = view.contentDOM.querySelectorAll('.cm-line');
  for (let i = 0; i < lines.length; i++) {
    const el = /** @type {HTMLElement} */ (lines[i]);
    const rect = el.getBoundingClientRect();
    if (
      clientY < rect.top - 2 ||
      clientY > rect.bottom + 2 ||
      clientX < rect.left - 12 ||
      clientX > rect.right + 12
    ) {
      continue;
    }
    const midY = (rect.top + rect.bottom) / 2;
    const dy = Math.abs(midY - clientY);
    if (dy < bestDy) {
      bestDy = dy;
      best = el;
    }
  }
  return best;
}

/**
 * 点击处对应的文档行（优先 .cm-line DOM，避免 widget 下方 posAtCoords 偏行）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @returns {import('@codemirror/state').Line | null}
 */
function docLineAtClick(view, clientX, clientY) {
  if (!view || view.destroyed) return null;
  const lineEl = cmLineElementAtPoint(view, clientX, clientY);
  if (lineEl) {
    try {
      const base = view.posAtDOM(lineEl, 0);
      return view.state.doc.lineAt(base);
    } catch (_) {
      /* fall through */
    }
  }
  const raw = posAtClick(view, clientX, clientY);
  if (raw == null) return null;
  return view.state.doc.lineAt(caretPosForClick(view, raw));
}

/**
 * 三击行选区间：仅当前行 [from, line.to]，不把 head 放到下一行行首。
 * @param {import('@codemirror/state').EditorState} state
 * @param {import('@codemirror/state').Line} line
 */
function lineSelectionRange(state, line) {
  let from = adjustCaretForHiddenMarks(state, line.from);
  const to = line.to;
  if (state.doc.lineAt(from).number < line.number) from = line.from;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

/**
 * 用 .cm-line 视觉行带定位（块 widget 下方 coordsAtPos 高度图失真时比 posAtCoords 邻行重选更准）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @returns {number | null}
 */
function posFromCmLineAtPoint(view, clientX, clientY) {
  const lineEl = cmLineElementAtPoint(view, clientX, clientY);
  if (!lineEl) return null;
  const caret = caretNodeFromPoint(clientX, clientY);
  if (caret) {
    try {
      const node = caret.node;
      const el = node.nodeType === 3 ? node.parentElement : node;
      if (el && lineEl.contains(el)) {
        const pos = view.posAtDOM(caret.node, caret.offset);
        if (pos != null && pos >= 0 && pos <= view.state.doc.length) return pos;
      }
    } catch (_) {
      /* ignore */
    }
  }
  try {
    const base = view.posAtDOM(lineEl, 0);
    const line = view.state.doc.lineAt(base);
    if (clientX <= lineEl.getBoundingClientRect().left + 4) return line.from;
    return line.to;
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
  const lineEl = lineElementAt(view, line.from);
  if (lineEl) {
    const rect = lineEl.getBoundingClientRect();
    if (rect.bottom >= rect.top) {
      return { top: rect.top, bottom: rect.bottom };
    }
  }
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
  const cmPos = posFromCmLineAtPoint(view, clientX, clientY);
  if (cmPos != null) return cmPos;

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
 * @param {number} pos
 * @param {number} clientX
 * @param {number} clientY
 */
function clickScoreAtPos(view, pos, clientX, clientY) {
  const caret = view.coordsAtPos(pos, 1) || view.coordsAtPos(pos, -1);
  if (!caret) return Infinity;
  const dx = caret.left - clientX;
  const dy = (caret.top + caret.bottom) / 2 - clientY;
  return dx * dx + dy * dy;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function posAtClick(view, clientX, clientY) {
  if (typeof document !== 'undefined' && document.elementFromPoint) {
    const el = document.elementFromPoint(clientX, clientY);
    if (isBlockWidgetTarget(el)) return null;
  }

  const cmPos = posFromCmLineAtPoint(view, clientX, clientY);
  const fromDom = posAtClickFromDom(view, clientX, clientY);

  let fromCoords = view.posAtCoords({ x: clientX, y: clientY }, 1);
  if (fromCoords == null) fromCoords = view.posAtCoords({ x: clientX, y: clientY }, -1);

  const doc = view.state.doc;

  // .cm-line 视觉行优先：块 widget 下方 posAtCoords 常落到下一行
  if (cmPos != null) {
    if (fromCoords != null) {
      const cmLn = doc.lineAt(cmPos);
      const coLn = doc.lineAt(fromCoords);
      if (cmLn.number < coLn.number) return cmPos;
    }
    return cmPos;
  }

  if (fromDom != null && fromCoords != null && fromDom !== fromCoords) {
    const domLine = doc.lineAt(fromDom);
    const coLine = doc.lineAt(fromCoords);
    if (coLine.number > domLine.number) return fromDom;
    if (domLine.number > coLine.number) return fromCoords;
    const sDom = clickScoreAtPos(view, fromDom, clientX, clientY);
    const sCo = clickScoreAtPos(view, fromCoords, clientX, clientY);
    if (sCo + 9 < sDom) {
      return refineIfFar(view, clientX, clientY, fromCoords);
    }
    return fromDom;
  }

  if (fromDom != null) return fromDom;
  if (fromCoords == null) return null;

  return refineIfFar(view, clientX, clientY, fromCoords);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} pos
 */
function refineIfFar(view, clientX, clientY, pos) {
  const caret = view.coordsAtPos(pos, 1) || view.coordsAtPos(pos, -1);
  if (caret) {
    const dx = caret.left - clientX;
    const dy = (caret.top + caret.bottom) / 2 - clientY;
    // 仅纵向偏差触发邻行重选；横向大偏差常见于行末空白，且 widget 下方行带用 coordsAtPos 会失真
    if (Math.abs(dy) > REFINE_DIST_PX) {
      return refinePosAtClick(view, clientX, clientY, pos);
    }
    return pos;
  }
  return refinePosAtClick(view, clientX, clientY, pos);
}

/**
 * hide-mark 校准；避免从上一行末 snap 进下一空行行首（widget 下方常见）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} raw
 */
function caretPosForClick(view, raw) {
  const pos = adjustCaretForHiddenMarks(view.state, raw);
  if (pos === raw) return pos;
  const doc = view.state.doc;
  const rawLine = doc.lineAt(raw);
  const posLine = doc.lineAt(pos);
  if (posLine.number > rawLine.number && posLine.text.trim() === '') {
    return raw;
  }
  return pos;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @returns {boolean}
 */
function setSelectionAtClick(view, clientX, clientY) {
  if (!view || view.destroyed) return false;
  if (typeof document !== 'undefined' && document.elementFromPoint) {
    const el = document.elementFromPoint(clientX, clientY);
    if (isBlockWidgetTarget(el)) return false;
  }
  const raw = posAtClick(view, clientX, clientY);
  if (raw == null) return false;
  const pos = caretPosForClick(view, raw);
  const sel = view.state.selection.main;
  if (sel.from === sel.to && sel.anchor === pos && sel.head === pos) return true;
  view.dispatch({
    selection: { anchor: pos, head: pos },
    scrollIntoView: false,
  });
  return true;
}
function placeCaret(view, clientX, clientY) {
  setSelectionAtClick(view, clientX, clientY);
}

/**
 * 双击选词：用校准落点 + state.wordAt，避免 CM6 posAtCoords 在 widget 下方错位。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function selectWordAtClick(view, clientX, clientY) {
  if (!view || view.destroyed) return false;
  if (typeof document !== 'undefined' && document.elementFromPoint) {
    const el = document.elementFromPoint(clientX, clientY);
    if (isBlockWidgetTarget(el)) return false;
  }
  const raw = posAtClick(view, clientX, clientY);
  if (raw == null) return false;
  const pos = caretPosForClick(view, raw);
  const word = view.state.wordAt(pos);
  const from = word ? word.from : pos;
  const to = word ? word.to : pos;
  const next = adjustSelectionForHiddenMarks(view.state, from, to);
  view.dispatch({
    selection: EditorSelection.range(next.anchor, next.head),
    scrollIntoView: false,
  });
  return true;
}

/**
 * 三击选行。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function selectLineAtClick(view, clientX, clientY) {
  if (!view || view.destroyed) return false;
  if (typeof document !== 'undefined' && document.elementFromPoint) {
    const el = document.elementFromPoint(clientX, clientY);
    if (isBlockWidgetTarget(el)) return false;
  }
  const line = docLineAtClick(view, clientX, clientY);
  if (!line) return false;
  const range = lineSelectionRange(view.state, line);
  view.dispatch({
    selection: EditorSelection.range(range.from, range.to),
    scrollIntoView: false,
  });
  return true;
}

/**
 * 拖选区间两端：先用 posAtClick 校准落点（块 widget 上方行 posAtCoords 易落到下一行），再 hide-mark 边缘校准。
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ startX?: number, startY?: number, endX?: number, endY?: number }} [pointer]
 */
function adjustDragSelection(view, pointer) {
  if (!view || view.destroyed) return;
  const sel = view.state.selection.main;
  if (sel.empty) return;

  let anchor = sel.anchor;
  let head = sel.head;
  const ptr = pointer || {};

  if (ptr.startX != null && ptr.startY != null) {
    const mapped = posAtClick(view, ptr.startX, ptr.startY);
    if (mapped != null) anchor = mapped;
  }
  if (ptr.endX != null && ptr.endY != null) {
    const mapped = posAtClick(view, ptr.endX, ptr.endY);
    if (mapped != null) head = mapped;
  }

  const next = adjustSelectionForHiddenMarks(view.state, anchor, head);
  if (next.anchor === sel.anchor && next.head === sel.head) return;
  view.dispatch({
    selection: { anchor: next.anchor, head: next.head },
    scrollIntoView: false,
  });
}

/**
 * 拖选过程中用校准落点更新选区；返回是否已 dispatch。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} anchorX
 * @param {number} anchorY
 * @param {number} headX
 * @param {number} headY
 */
function applyDragSelectionAt(view, anchorX, anchorY, headX, headY) {
  if (!view || view.destroyed) return false;
  const anchorPos = posAtClick(view, anchorX, anchorY);
  const headPos = posAtClick(view, headX, headY);
  if (anchorPos == null || headPos == null) return false;
  const next = adjustSelectionForHiddenMarks(view.state, anchorPos, headPos);
  const main = view.state.selection.main;
  if (main.anchor === next.anchor && main.head === next.head) return false;
  view.dispatch({
    selection: { anchor: next.anchor, head: next.head },
    scrollIntoView: false,
  });
  return true;
}

function createClickCollapseExtension() {
  ensureDocPointerEndListeners();
  return EditorView.domEventHandlers({
    mousedown: function (event, view) {
      if (event.button !== 0) return false;
      if (isBlockWidgetTarget(event.target)) return false;
      mouseDown = {
        x: event.clientX,
        y: event.clientY,
        shiftKey: !!event.shiftKey,
        dragging: false,
        handledMultiClick: false,
        view: view,
      };
      if (event.shiftKey) return false;
      if (event.detail >= 3) {
        mouseDown.handledMultiClick = selectLineAtClick(view, event.clientX, event.clientY);
        try {
          view.focus();
        } catch (_) {
          /* ignore */
        }
        return mouseDown.handledMultiClick;
      }
      if (event.detail === 2) {
        mouseDown.handledMultiClick = selectWordAtClick(view, event.clientX, event.clientY);
        try {
          view.focus();
        } catch (_) {
          /* ignore */
        }
        return mouseDown.handledMultiClick;
      }
      // 块 widget 下方 posAtCoords 在 mousedown 即错位到下一行；抢先写入校准落点并阻断 CM6
      setSelectionAtClick(view, event.clientX, event.clientY);
      try {
        view.focus();
      } catch (_) {
        /* ignore */
      }
      return true;
    },
    mousemove: function (event, view) {
      if (!mouseDown || mouseDown.shiftKey || mouseDown.view !== view) return false;
      // 释放在编辑区外时 mouseup 可能未送达；buttons 已松则结束拖选
      if ((event.buttons & 1) === 0) {
        const start = takeMouseDownForView(view);
        if (start) {
          finalizePointerUp(view, start, event.clientX, event.clientY, 1);
        }
        return false;
      }
      const dx = event.clientX - mouseDown.x;
      const dy = event.clientY - mouseDown.y;
      if (!mouseDown.dragging) {
        if (dx * dx + dy * dy > DRAG_PX * DRAG_PX) {
          mouseDown.dragging = true;
        } else {
          return false;
        }
      }
      if (isBlockWidgetTarget(event.target)) return false;
      applyDragSelectionAt(view, mouseDown.x, mouseDown.y, event.clientX, event.clientY);
      // 阻止 CM6 用失真的 posAtCoords 继续扩展选区（块 widget 上方行易落到下一行）
      return true;
    },
    mouseup: function (event, view) {
      if (event.button !== 0) return false;
      const start = takeMouseDownForView(view);
      if (!start) return false;
      if (start.shiftKey || event.shiftKey) return false;
      if (start.handledMultiClick || event.detail >= 2) return true;
      const blockAtUp = isBlockWidgetTarget(event.target);
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const moved = start.dragging || dx * dx + dy * dy > DRAG_PX * DRAG_PX;
      if (blockAtUp && !moved) return false;
      finalizePointerUp(view, start, event.clientX, event.clientY, event.detail, {
        skipClickCaret: blockAtUp,
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
  setSelectionAtClick: setSelectionAtClick,
  selectWordAtClick: selectWordAtClick,
  selectLineAtClick: selectLineAtClick,
  docLineAtClick: docLineAtClick,
  lineSelectionRange: lineSelectionRange,
  caretPosForClick: caretPosForClick,
  adjustDragSelection: adjustDragSelection,
  applyDragSelectionAt: applyDragSelectionAt,
  refinePosAtClick: refinePosAtClick,
  posFromCmLineAtPoint: posFromCmLineAtPoint,
  refineIfFar: refineIfFar,
  isBlockWidgetTarget: isBlockWidgetTarget,
};

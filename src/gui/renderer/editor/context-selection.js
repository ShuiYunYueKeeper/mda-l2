/**
 * 右键菜单 / 表格：CM6 与 contenteditable 选区命中、保留与折叠。
 */
'use strict';

const { Transaction } = require('@codemirror/state');

/**
 * @param {HTMLElement} root
 * @returns {string}
 */
function getDomSelectionText(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return '';
  return sel.toString();
}

/**
 * @param {HTMLElement} root
 * @param {Node} container
 * @param {number} offset
 */
function logicalOffsetInRoot(root, container, offset) {
  const probe = document.createRange();
  probe.setStart(container, offset);
  probe.collapse(true);
  if (!root.contains(probe.startContainer)) return 0;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(probe.startContainer, probe.startOffset);
  return pre.toString().replace(/\u200b/g, '').replace(/\u00a0/g, ' ').length;
}

/**
 * @param {HTMLElement} root
 * @returns {{ dom: { root: HTMLElement, text: string, range: Range, start?: number, end?: number } } | null}
 */
function snapshotDomSelection(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const text = sel.toString();
  if (!text) return null;
  let start;
  let end;
  if (typeof root._mdaLogicalOffsetFromPoint === 'function') {
    start = root._mdaLogicalOffsetFromPoint(range.startContainer, range.startOffset);
    end = root._mdaLogicalOffsetFromPoint(range.endContainer, range.endOffset);
  } else {
    start = logicalOffsetInRoot(root, range.startContainer, range.startOffset);
    end = logicalOffsetInRoot(root, range.endContainer, range.endOffset);
  }
  return {
    dom: {
      root: root,
      text: text,
      range: range.cloneRange(),
      start: Math.min(start, end),
      end: Math.max(start, end),
    },
  };
}

/**
 * @param {Range} range
 * @returns {{ left: number, right: number, top: number, bottom: number } | null}
 */
function domRangeClientBounds(range) {
  const rects = range.getClientRects();
  if (rects.length) {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    }
    if (isFinite(left) && isFinite(right)) {
      return { left: left, right: right, top: top, bottom: bottom };
    }
  }
  const box = range.getBoundingClientRect();
  if (box.width || box.height) {
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }
  return null;
}

/**
 * @param {Range} range
 * @param {number} clientX
 * @param {number} clientY
 */
function domPointInRangeBounds(range, clientX, clientY) {
  const pad = 2;
  const rects = range.getClientRects();
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (
      clientX >= r.left - pad &&
      clientX <= r.right + pad &&
      clientY >= r.top - pad &&
      clientY <= r.bottom + pad
    ) {
      return true;
    }
  }
  const bounds = domRangeClientBounds(range);
  if (!bounds) return false;
  return (
    clientX >= bounds.left - pad &&
    clientX <= bounds.right + pad &&
    clientY >= bounds.top - pad &&
    clientY <= bounds.bottom + pad
  );
}

/**
 * @param {HTMLElement} root
 * @param {number} clientX
 * @param {number} clientY
 */
function domClickInSelection(root, clientX, clientY) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;
  if (!sel.toString()) return false;
  if (domPointInRangeBounds(range, clientX, clientY)) return true;

  // 复杂排版（hljs 多 span / 表格内图片旁文字）下 union 边界可能漏判，用命中节点兜底。
  let hit = document.elementFromPoint(clientX, clientY);
  while (hit && hit !== root) {
    if (hit.nodeType === Node.TEXT_NODE) {
      try {
        const probe = document.createRange();
        probe.setStart(hit, 0);
        probe.collapse(true);
        if (
          range.compareBoundaryPoints(Range.END_TO_START, probe) < 0 &&
          range.compareBoundaryPoints(Range.START_TO_END, probe) > 0
        ) {
          return true;
        }
      } catch (_) {
        /* ignore */
      }
    } else {
      try {
        if (range.intersectsNode(hit) && !hit.querySelector('*')) {
          return true;
        }
      } catch (_) {
        /* ignore */
      }
    }
    hit = hit.parentElement;
  }
  return false;
}

/**
 * @param {HTMLElement} root
 * @param {number} clientX
 * @param {number} clientY
 */
function shouldPreserveDomSelection(root, clientX, clientY) {
  if (!snapshotDomSelection(root)) return false;
  return domClickInSelection(root, clientX, clientY);
}

/**
 * 选区在点击行上的起止文档位置。
 * @param {import('@codemirror/state').Text} doc
 * @param {number} from
 * @param {number} to
 * @param {import('@codemirror/state').Line} clickLine
 */
function selectionSegmentOnLine(doc, from, to, clickLine) {
  const selStartLine = doc.lineAt(from);
  const selEndLine = doc.lineAt(to);
  if (clickLine.number < selStartLine.number || clickLine.number > selEndLine.number) {
    return null;
  }
  let segFrom = clickLine.from;
  let segTo = clickLine.to;
  if (clickLine.number === selStartLine.number) segFrom = from;
  if (clickLine.number === selEndLine.number) segTo = to;
  return { from: segFrom, to: segTo };
}

/**
 * 选区片段在视口中的字符边界（不含行尾空白）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} segFrom
 * @param {number} segTo
 */
function selectionSegmentBounds(view, segFrom, segTo) {
  const startCoords = view.coordsAtPos(segFrom, 1);
  const endCoords = view.coordsAtPos(segTo, -1);
  if (!startCoords || !endCoords) return null;
  return {
    left: Math.min(startCoords.left, endCoords.left),
    right: Math.max(startCoords.right, endCoords.right),
    top: Math.min(startCoords.top, endCoords.top),
    bottom: Math.max(startCoords.bottom, endCoords.bottom),
  };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function cmClickInSelection(view, clientX, clientY) {
  const sel = view.state.selection.main;
  if (sel.empty) return false;
  const from = Math.min(sel.from, sel.to);
  const to = Math.max(sel.from, sel.to);

  const clickPos = view.posAtCoords({ x: clientX, y: clientY, exact: false });
  if (clickPos == null) return false;

  const doc = view.state.doc;
  const clickLine = doc.lineAt(clickPos);
  const seg = selectionSegmentOnLine(doc, from, to, clickLine);
  if (!seg) return false;

  const bounds = selectionSegmentBounds(view, seg.from, seg.to);
  if (!bounds) return false;

  if (clientY < bounds.top - 2 || clientY > bounds.bottom + 2) return false;
  if (clientX < bounds.left - 2 || clientX > bounds.right + 2) return false;

  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function snapshotCmSelection(view) {
  const sel = view.state.selection.main;
  if (sel.empty) return null;
  return {
    cm: {
      anchor: sel.anchor,
      head: sel.head,
      from: sel.from,
      to: sel.to,
    },
  };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ anchor: number, head: number }} snap
 */
function restoreCmSelection(view, snap) {
  if (!view || view.destroyed || !snap) return;
  const cur = view.state.selection.main;
  if (cur.from === snap.from && cur.to === snap.to) return;
  view.dispatch({
    selection: { anchor: snap.anchor, head: snap.head },
    annotations: Transaction.addToHistory.of(false),
  });
}

/**
 * @param {{ root: HTMLElement, range?: Range, start?: number, end?: number }} snap
 */
function restoreDomSelection(snap) {
  if (!snap || !snap.root) return;
  const sel = window.getSelection();
  if (!sel) return;
  let restored = false;
  if (snap.range) {
    try {
      if (snap.root.isConnected && snap.root.contains(snap.range.startContainer)) {
        sel.removeAllRanges();
        sel.addRange(snap.range.cloneRange());
        restored = true;
      }
    } catch (_) {
      restored = false;
    }
  }
  if (
    !restored &&
    typeof snap.start === 'number' &&
    typeof snap.end === 'number' &&
    snap.end > snap.start
  ) {
    const restoreRoot =
      typeof snap.root._mdaRestoreLogicalSelection === 'function'
        ? snap.root
        : snap.root.closest
          ? snap.root.closest('.mda-cm-code-block')
          : null;
    if (restoreRoot && typeof restoreRoot._mdaRestoreLogicalSelection === 'function') {
      try {
        restoreRoot._mdaRestoreLogicalSelection(snap.start, snap.end);
        restored = true;
      } catch (_) {
        restored = false;
      }
    }
  }
  if (!restored) return;
  try {
    snap.root.focus({ preventScroll: true });
  } catch (_) {
    try {
      snap.root.focus();
    } catch (_2) {
      /* ignore */
    }
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function collapseCmAtClick(view, clientX, clientY) {
  let pos = view.posAtCoords({ x: clientX, y: clientY, exact: true });
  if (pos == null) {
    const loose = view.posAtCoords({ x: clientX, y: clientY, exact: false });
    if (loose == null) return;
    const line = view.state.doc.lineAt(loose);
    const endCoords = view.coordsAtPos(line.to, -1);
    if (endCoords && clientX > endCoords.right + 2) {
      pos = line.to;
    } else {
      pos = loose;
    }
  }
  view.dispatch({
    selection: { anchor: pos, head: pos },
    annotations: Transaction.addToHistory.of(false),
  });
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function clearCmSelectionIfAny(view) {
  if (!view || view.destroyed) return;
  const sel = view.state.selection.main;
  if (sel.empty) return;
  view.dispatch({
    selection: { anchor: sel.head, head: sel.head },
    annotations: Transaction.addToHistory.of(false),
  });
}

/**
 * @param {HTMLElement} root
 * @param {number} clientX
 * @param {number} clientY
 * @returns {Range | null}
 */
function caretRangeAtPointInRoot(root, clientX, clientY) {
  if (!root) return null;
  let range = null;
  if (typeof document.caretRangeFromPoint === 'function') {
    range = document.caretRangeFromPoint(clientX, clientY);
  } else if (typeof document.caretPositionFromPoint === 'function') {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (!range || !root.contains(range.startContainer)) return null;
  return range;
}

/**
 * 清除 DOM 选区并在点击处恢复折叠光标；无坐标则落到内容末尾。
 * @param {HTMLElement} root
 * @param {number} [clientX]
 * @param {number} [clientY]
 * @returns {Range | null} 实际落点，供 focus / 菜单打开后恢复
 */
function collapseWidgetDomAt(root, clientX, clientY) {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel) return null;

  let range = null;
  if (typeof clientX === 'number' && typeof clientY === 'number') {
    range = caretRangeAtPointInRoot(root, clientX, clientY);
  }

  if (!range) {
    range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
  }

  const applied = range.cloneRange();
  sel.removeAllRanges();
  try {
    sel.addRange(range);
  } catch (_) {
    /* ignore */
  }
  try {
    root.focus({ preventScroll: true });
  } catch (_) {
    try {
      root.focus();
    } catch (_2) {
      /* ignore */
    }
  }
  return applied;
}

/**
 * 恢复先前折叠光标（避免 focus / 菜单遮挡导致 caretRangeFromPoint 落到末尾）。
 * @param {HTMLElement} root
 * @param {Range | null | undefined} range
 */
function restoreWidgetDomCaret(root, range) {
  if (!root || !range) return;
  const sel = window.getSelection();
  if (!sel) return;
  try {
    if (!root.contains(range.startContainer)) return;
    sel.removeAllRanges();
    sel.addRange(range.cloneRange());
  } catch (_) {
    return;
  }
  try {
    root.focus({ preventScroll: true });
  } catch (_) {
    try {
      root.focus();
    } catch (_2) {
      /* ignore */
    }
  }
}

/**
 * @param {HTMLElement} root
 */
function clearWidgetDomSelection(root) {
  collapseWidgetDomAt(root);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function shouldPreserveCmSelection(view, clientX, clientY) {
  if (!view || view.state.selection.main.empty) return false;
  return cmClickInSelection(view, clientX, clientY);
}

module.exports = {
  getDomSelectionText: getDomSelectionText,
  snapshotDomSelection: snapshotDomSelection,
  domClickInSelection: domClickInSelection,
  domPointInRangeBounds: domPointInRangeBounds,
  shouldPreserveDomSelection: shouldPreserveDomSelection,
  cmClickInSelection: cmClickInSelection,
  snapshotCmSelection: snapshotCmSelection,
  restoreCmSelection: restoreCmSelection,
  restoreDomSelection: restoreDomSelection,
  collapseCmAtClick: collapseCmAtClick,
  clearCmSelectionIfAny: clearCmSelectionIfAny,
  clearWidgetDomSelection: clearWidgetDomSelection,
  collapseWidgetDomAt: collapseWidgetDomAt,
  restoreWidgetDomCaret: restoreWidgetDomCaret,
  shouldPreserveCmSelection: shouldPreserveCmSelection,
};

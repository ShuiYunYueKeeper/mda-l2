'use strict';

const { Transaction } = require('@codemirror/state');
const { planBlockTrailingBlank } = require('./block-insert-snippets');

const IMAGE_LINE_RE = /^\s*!\[[^\]]*\]\([^)]*\)/;

/**
 * @param {{ toString?: Function, sliceString: Function, length: number }} doc
 */
function docText(doc) {
  if (typeof doc.toString === 'function') return doc.toString();
  return doc.sliceString(0, doc.length);
}

/**
 * @param {string} text
 * @param {number} from
 * @param {number} to
 */
function expandBlockRange(text, from, to) {
  const len = text.length;
  let start = Math.max(0, Math.min(from, len));
  let end = Math.max(start, Math.min(to, len));
  while (start > 0 && text.charAt(start - 1) !== '\n') start -= 1;
  if (end < len) {
    if (end > 0 && text.charAt(end - 1) !== '\n') {
      while (end < len && text.charAt(end) !== '\n') end += 1;
      if (end < len) end += 1;
    }
  }
  return { from: start, to: end };
}

/**
 * @param {string} s
 */
function trimLineEnd(s) {
  return String(s || '').replace(/\n$/, '');
}

/**
 * @param {string} text
 * @param {string} src
 * @param {number | null | undefined} nearFrom
 * @returns {{ from: number, to: number } | null}
 */
function findNearestSourceRange(text, src, nearFrom) {
  const norm = trimLineEnd(String(src || '').trim());
  if (!norm) return null;
  let best = null;
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(norm, i);
    if (idx < 0) break;
    const expanded = expandBlockRange(text, idx, idx + norm.length);
    const anchor = nearFrom != null ? nearFrom : idx;
    const dist = Math.abs(expanded.from - anchor);
    if (!best || dist < best.dist) best = { expanded: expanded, dist: dist };
    i = idx + 1;
  }
  return best ? best.expanded : null;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {HTMLElement | null | undefined} excludeRoot
 * @param {number} clientX
 * @param {number} clientY
 * @param {string} blockSelector
 * @returns {{ el: HTMLElement, from: number, to: number } | null}
 */
function findBlockAtPoint(view, excludeRoot, clientX, clientY, blockSelector) {
  if (!view || !view.dom) return null;
  const sel = blockSelector || '.mda-cm-image-block';
  const nodes = view.dom.querySelectorAll(sel + '[data-mda-block-from][data-mda-block-to]');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (excludeRoot && (el === excludeRoot || excludeRoot.contains(el))) continue;
    const r = el.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      const from = parseInt(el.getAttribute('data-mda-block-from') || '', 10);
      const to = parseInt(el.getAttribute('data-mda-block-to') || '', 10);
      if (from >= 0 && to > from) return { el: el, from: from, to: to };
    }
  }
  return null;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {HTMLElement | null | undefined} excludeRoot
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ el: HTMLElement, from: number, to: number } | null}
 */
function findImageBlockAtPoint(view, excludeRoot, clientX, clientY) {
  return findBlockAtPoint(view, excludeRoot, clientX, clientY, '.mda-cm-image-block');
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} dragFrom
 * @param {number} dragTo
 * @param {number} clientX
 * @param {number} clientY
 * @param {HTMLElement | null | undefined} dragRoot
 * @param {{ blockSelector?: string, replaceOnHover?: boolean }} [options]
 * @returns {{ mode: 'replace' | 'insert', pos: number | null, hoverEl: HTMLElement | null, targetBlock: { from: number, to: number, source?: string } | null }}
 */
function resolveBlockDropTargetFromCoords(
  view,
  dragFrom,
  dragTo,
  clientX,
  clientY,
  dragRoot,
  options
) {
  options = options || {};
  const blockSelector = options.blockSelector || '.mda-cm-image-block';
  const replaceOnHover = options.replaceOnHover !== false;
  if (replaceOnHover) {
    const hit = findBlockAtPoint(view, dragRoot || null, clientX, clientY, blockSelector);
    if (hit && !(hit.from === dragFrom && hit.to === dragTo)) {
      const source = hit.el.getAttribute('data-mda-block-source') || '';
      return {
        mode: 'replace',
        pos: null,
        hoverEl: hit.el,
        targetBlock: {
          from: hit.from,
          to: hit.to,
          source: source,
        },
      };
    }
  }
  const raw = view.posAtCoords({ x: clientX, y: clientY }, false);
  if (raw == null) {
    return { mode: 'insert', pos: null, hoverEl: null, targetBlock: null };
  }
  return {
    mode: 'insert',
    pos: resolveDropTargetPos(view, dragFrom, dragTo, raw),
    hoverEl: null,
    targetBlock: null,
  };
}

/**
 * 根据鼠标位置解析落点：悬停其他图片块 → 替换模式；否则插入到行首。
 * @returns {{ mode: 'replace' | 'insert', pos: number | null, hoverEl: HTMLElement | null, targetBlock: { from: number, to: number, source?: string } | null }}
 */
function resolveDropTargetFromCoords(view, dragFrom, dragTo, clientX, clientY, dragRoot) {
  return resolveBlockDropTargetFromCoords(view, dragFrom, dragTo, clientX, clientY, dragRoot, {
    blockSelector: '.mda-cm-image-block',
    replaceOnHover: true,
  });
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 * @param {number} targetPos
 * @returns {number | null}
 */
function resolveDropTargetPos(view, from, to, targetPos) {
  if (!view) return null;
  const doc = view.state.doc;
  const len = doc.length;
  let pos = Math.max(0, Math.min(targetPos, len));
  if (typeof doc.lineAt !== 'function') return pos;
  const line = doc.lineAt(pos);
  let target = line.from;
  if (target > from && target < to) {
    const endLine = doc.lineAt(Math.max(from, Math.min(to - 1, len - 1)));
    if (typeof doc.line === 'function' && endLine.number < doc.lines) {
      target = doc.line(endLine.number + 1).from;
    } else {
      target = len;
    }
  }
  return target;
}

/**
 * 拖放指示线水平范围：对齐 scroller 内容区，不穿过滚动条。
 * @param {import('@codemirror/view').EditorView} view
 */
function getEditorDropLineBounds(view) {
  const scroller = view && view.scrollDOM;
  if (scroller) {
    const rect = scroller.getBoundingClientRect();
    return {
      left: rect.left,
      width: Math.max(0, scroller.clientWidth),
    };
  }
  const host = view && view.dom ? view.dom.closest('.cm-editor') : null;
  const rect = host ? host.getBoundingClientRect() : { left: 0, width: window.innerWidth };
  return {
    left: rect.left,
    width: host ? host.clientWidth : rect.width,
  };
}

/**
 * 拖放指示线纵坐标：落在目标块/行视觉顶边，而非字符中间（图2）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} dropPos
 * @returns {number | null}
 */
function getDropIndicatorTop(view, dropPos) {
  if (!view) return null;
  const len = view.state.doc.length;
  const pos = Math.max(0, Math.min(dropPos, len));
  try {
    const domAt = view.domAtPos(pos > 0 && pos === len ? pos - 1 : pos);
    let node = domAt.node;
    if (node.nodeType === 3) node = node.parentElement;
    if (node && node.closest) {
      const blockEl = node.closest('[data-mda-block-from], .mda-cm-quote-handle-anchor');
      if (blockEl) return blockEl.getBoundingClientRect().top;
      const cmLine = node.closest('.cm-line');
      if (cmLine) return cmLine.getBoundingClientRect().top;
    }
  } catch (_) {
    /* fall through */
  }
  const coords = view.coordsAtPos(pos, -1) || view.coordsAtPos(pos, 1);
  return coords ? coords.top : null;
}

/**
 * @param {string} src
 * @param {string} [fallbackDoc]
 * @returns {string}
 */
function normalizeImageBlockLine(src, fallbackDoc) {
  let line = trimLineEnd(String(src || '').trim());
  if (!IMAGE_LINE_RE.test(line) && fallbackDoc) {
    const m = IMAGE_LINE_RE.exec(String(fallbackDoc).trim());
    if (m) line = m[0];
  }
  if (!IMAGE_LINE_RE.test(line)) return '';
  return line.endsWith('\n') ? line : line + '\n';
}

/**
 * 仅定位图片 Markdown 行（不含上方批注行）。
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from?: number, to?: number, source?: string }} block
 * @returns {{ from: number, to: number } | null}
 */
function resolveImageLineRange(view, block) {
  if (!view || !block) return null;
  const text = docText(view.state.doc);
  const src = trimLineEnd(String(block.source || '').trim());
  const near = block.from != null ? block.from : 0;

  if (src && IMAGE_LINE_RE.test(src)) {
    let best = null;
    let i = 0;
    while (i < text.length) {
      const at = text.indexOf(src, i);
      if (at < 0) break;
      let to = at + src.length;
      if (text.charAt(to) === '\n') to += 1;
      const dist = Math.abs(at - near);
      if (!best || dist < best.dist) best = { from: at, to: to, dist: dist };
      i = at + 1;
    }
    if (best) return { from: best.from, to: best.to };
  }

  const expanded = resolveBlockRange(view, block);
  if (!expanded) return null;
  const chunk = text.slice(expanded.from, expanded.to);
  const m = IMAGE_LINE_RE.exec(chunk);
  if (!m) return expanded;
  const from = expanded.from + chunk.indexOf(m[0]);
  let to = from + m[0].length;
  if (text.charAt(to) === '\n') to += 1;
  return { from: from, to: to };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from?: number, to?: number, source?: string }} block
 * @returns {{ from: number, to: number } | null}
 */
function resolveBlockRange(view, block) {
  if (!view || !block) return null;
  const text = docText(view.state.doc);
  const src = block.source == null ? '' : String(block.source);

  if (block.from != null && block.to != null) {
    const from = Math.max(0, Math.min(block.from, text.length));
    const to = Math.max(from, Math.min(block.to, text.length));
    if (to > from) {
      const expanded = expandBlockRange(text, from, to);
      const chunk = text.slice(expanded.from, expanded.to).trimEnd();
      const normSrc = trimLineEnd(src.trim());
      if (!normSrc || chunk === normSrc || IMAGE_LINE_RE.test(chunk)) {
        return expanded;
      }
    }
  }

  if (src) {
    const found = findNearestSourceRange(text, src, block.from);
    if (found) return found;
  }

  if (block.from != null && block.to != null) {
    return expandBlockRange(text, block.from, block.to);
  }
  return null;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 */
function deleteBlockRange(view, from, to) {
  if (!view || from >= to) return;
  const doc = view.state.doc;
  let delFrom = from;
  let delTo = to;
  if (
    delTo < doc.length &&
    delTo > 0 &&
    doc.sliceString(delTo - 1, delTo) !== '\n' &&
    doc.sliceString(delTo, delTo + 1) === '\n'
  ) {
    delTo += 1;
  }
  // 选图/块时 CM6 选区常仍在文档头；若不先钉到块首，history 会把撤销后的光标还原到 0。
  // 钉选区不入历史，避免多占一步 undo。
  const sel = view.state.selection.main;
  if (sel.from !== delFrom || sel.to !== delFrom) {
    view.dispatch({
      selection: { anchor: delFrom, head: delFrom },
      annotations: Transaction.addToHistory.of(false),
    });
  }
  const caret = Math.min(delFrom, view.state.doc.length - (delTo - delFrom));
  view.dispatch({
    changes: { from: delFrom, to: delTo, insert: '' },
    selection: { anchor: caret, head: caret },
    userEvent: 'delete',
  });
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from?: number, to?: number, source?: string }} block
 */
function deleteImageBlock(view, block) {
  const range = resolveBlockRange(view, block);
  if (!range) return;
  deleteBlockRange(view, range.from, range.to);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 * @param {string} insert
 */
function replaceBlockRange(view, from, to, insert) {
  if (!view || from >= to) return;
  const old = view.state.doc.sliceString(from, to);
  let text = insert == null ? '' : String(insert);
  if (old.endsWith('\n') && text && !text.endsWith('\n')) text += '\n';
  view.dispatch({
    changes: { from: from, to: to, insert: text },
    userEvent: 'input',
  });
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 * @param {number} targetPos
 */
function moveBlockRange(view, from, to, targetPos) {
  if (!view || from >= to) return;
  const doc = docText(view.state.doc);
  const expanded = expandBlockRange(doc, from, to);
  from = expanded.from;
  to = expanded.to;
  const block = doc.slice(from, to);
  if (!block.trim()) return;
  const len = to - from;
  const target = resolveDropTargetPos(view, from, to, targetPos);
  if (target == null) return;
  if (target >= from && target <= to) return;
  if (target > to && target - len === from) return;

  if (target < from) {
    view.dispatch({
      changes: { from: target, to: to, insert: block + doc.slice(target, from) },
      userEvent: 'move.drop',
    });
    return;
  }

  view.dispatch({
    changes: { from: from, to: target, insert: doc.slice(to, target) + block },
    userEvent: 'move.drop',
  });
}

/**
 * 拖到其他图片上松手：用源图 Markdown 替换目标图，并删除源位置。
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from?: number, to?: number, source?: string }} dragBlock
 * @param {{ from?: number, to?: number, source?: string }} targetBlock
 */
function dropReplaceImageBlock(view, dragBlock, targetBlock) {
  if (!view || !dragBlock || !targetBlock) return;
  const dragRange = resolveImageLineRange(view, dragBlock);
  const targetRange = resolveImageLineRange(view, targetBlock);
  if (!dragRange || !targetRange) return;
  if (dragRange.from === targetRange.from && dragRange.to === targetRange.to) return;

  const doc = docText(view.state.doc);
  const sourceMd = normalizeImageBlockLine(
    dragBlock.source,
    doc.slice(dragRange.from, dragRange.to)
  );
  if (!sourceMd) return;

  if (dragRange.from < targetRange.from) {
    view.dispatch({
      changes: {
        from: dragRange.from,
        to: targetRange.to,
        insert: doc.slice(dragRange.to, targetRange.from) + sourceMd,
      },
      userEvent: 'move.drop',
    });
    return;
  }

  view.dispatch({
    changes: {
      from: targetRange.from,
      to: dragRange.to,
      insert: sourceMd + doc.slice(targetRange.to, dragRange.from),
    },
    userEvent: 'move.drop',
  });
}

function insertImageAt(view, pos, markdownLine) {
  if (!view || !markdownLine) return;
  const doc = view.state.doc;
  const snippet = String(markdownLine);
  let insert = snippet;
  if (pos > 0 && doc.sliceString(pos - 1, pos) !== '\n') insert = '\n' + insert;
  if (pos < doc.length && doc.sliceString(pos, pos + 1) !== '\n') insert += '\n';
  const planned = planBlockTrailingBlank(pos, insert, snippet, 'image');
  view.dispatch({
    changes: { from: pos, to: pos, insert: planned.insert },
    selection: { anchor: planned.caret, head: planned.caret },
    userEvent: 'input.paste',
  });
}

module.exports = {
  expandBlockRange: expandBlockRange,
  resolveBlockRange: resolveBlockRange,
  resolveDropTargetPos: resolveDropTargetPos,
  resolveDropTargetFromCoords: resolveDropTargetFromCoords,
  resolveBlockDropTargetFromCoords: resolveBlockDropTargetFromCoords,
  getEditorDropLineBounds: getEditorDropLineBounds,
  getDropIndicatorTop: getDropIndicatorTop,
  findBlockAtPoint: findBlockAtPoint,
  findImageBlockAtPoint: findImageBlockAtPoint,
  resolveImageLineRange: resolveImageLineRange,
  normalizeImageBlockLine: normalizeImageBlockLine,
  findNearestSourceRange: findNearestSourceRange,
  deleteBlockRange: deleteBlockRange,
  deleteImageBlock: deleteImageBlock,
  replaceBlockRange: replaceBlockRange,
  moveBlockRange: moveBlockRange,
  dropReplaceImageBlock: dropReplaceImageBlock,
  insertImageAt: insertImageAt,
};

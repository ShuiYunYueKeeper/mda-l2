/**
 * 块级 widget 左上角拖动手柄（类型图标 + 六点；单击菜单 / 长按拖动）。
 */
'use strict';

const { resolveBlockDropTargetFromCoords, getEditorDropLineBounds, getDropIndicatorTop } = require('./image-block-ops');
const { showBlockHandleMenu, isBlockHandleMenuOpenFor } = require('./block-handle-menu');
const { blockTypeIconHtml } = require('./block-menu-icons');
const { HOVER_LEAVE_MS } = require('./widget-common');

const LONG_PRESS_MS = 200;
const CANCEL_DRAG_PX = 10;
/** 手柄在块外，移出块到手柄会短暂离开 hover；延迟隐藏避免闪没 */
const HANDLE_HIDE_MS = HOVER_LEAVE_MS;

/**
 * @param {HTMLElement} el
 * @param {{ from: number, to: number, source?: string }} fallback
 */
function readBlockRange(el, fallback) {
  const fromRaw = el.getAttribute('data-mda-block-from');
  const toRaw = el.getAttribute('data-mda-block-to');
  const source = el.getAttribute('data-mda-block-source') || fallback.source || '';
  const from =
    fromRaw != null && fromRaw !== '' ? parseInt(fromRaw, 10) : fallback.from;
  const to = toRaw != null && toRaw !== '' ? parseInt(toRaw, 10) : fallback.to;
  return { from: from, to: to, source: source };
}

/**
 * @param {string} [blockKind]
 */
function buildHandleInnerHtml(blockKind) {
  const typeIcon = blockTypeIconHtml(blockKind);
  return (
    typeIcon +
    '<span class="mda-cm-block-drag-grip" aria-hidden="true">' +
    '<i></i><i></i><i></i><i></i><i></i><i></i>' +
    '</span>' +
    '<span class="mda-cm-block-drag-tip"></span>'
  );
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {HTMLElement} blockRoot
 * @param {{ from: number, to: number }} range
 * @param {string} [blockKind]
 * @returns {HTMLElement[]}
 */
function resolveBlockHighlightTargets(view, blockRoot, range, blockKind) {
  if (
    blockKind === 'image' ||
    blockKind === 'mermaid' ||
    blockKind === 'code' ||
    blockRoot.classList.contains('mda-cm-image-block') ||
    blockRoot.classList.contains('mda-cm-mermaid-block') ||
    blockRoot.classList.contains('mda-cm-code-block')
  ) {
    return [];
  }
  if (
    blockRoot.classList.contains('mda-cm-quote-handle-anchor') ||
    blockRoot.classList.contains('mda-cm-heading-handle-anchor')
  ) {
    return collectCmLinesInRange(view, range.from, range.to);
  }
  return blockRoot && blockRoot.isConnected ? [blockRoot] : [];
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 * @returns {HTMLElement[]}
 */
function collectCmLinesInRange(view, from, to) {
  /** @type {HTMLElement[]} */
  const lines = [];
  if (!view || from == null || to == null) return lines;
  const doc = view.state.doc;
  const len = doc.length;
  if (len <= 0) return lines;
  let pos = Math.max(0, Math.min(from, len - 1));
  const end = Math.max(pos, Math.min(to, len));
  let guard = 0;
  while (pos < end || (pos === from && from === to)) {
    if (++guard > 500) break;
    let lineEl = null;
    try {
      const at = view.domAtPos(pos);
      const node = at && at.node;
      if (node) {
        lineEl =
          node.nodeType === 1
            ? /** @type {HTMLElement} */ (node).closest('.cm-line')
            : node.parentElement && node.parentElement.closest('.cm-line');
      }
    } catch (_) {
      lineEl = null;
    }
    if (lineEl && lines.indexOf(lineEl) < 0) lines.push(lineEl);
    let next = pos + 1;
    try {
      const lb = view.lineBlockAt(pos);
      next = lb.to > pos ? lb.to : pos + 1;
    } catch (_) {
      next = pos + 1;
    }
    if (next <= pos) break;
    pos = next;
    if (pos >= end) break;
  }
  return lines;
}

/**
 * @param {HTMLElement} anchorEl 手柄挂载点（通常为 frame，便于左上角定位）
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, source?: string }} range
 * @param {{
 *   blockRoot?: HTMLElement,
 *   blockSelector: string,
 *   replaceOnHover?: boolean,
 *   onMoveBlock?: Function,
 *   onDropReplaceBlock?: Function,
 *   blockKind?: string,
 *   blockMenuHandlers?: object,
 *   t?: Function,
 *   onHandleClick?: Function,
 * }} opts
 */
function attachBlockDragHandle(anchorEl, view, range, opts) {
  const blockRoot = opts.blockRoot || anchorEl;
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'mda-cm-block-drag-handle';
  if (opts.blockKind) handle.setAttribute('data-block-kind', opts.blockKind);
  handle.setAttribute('data-i18n-title', 'widgetBlockDragHandle');
  handle.setAttribute('data-i18n-aria', 'widgetBlockDragHandle');
  handle.innerHTML = buildHandleInnerHtml(opts.blockKind);
  if (opts.t) {
    const { uiT } = require('./widget-common');
    const label = uiT('widgetBlockDragHandle', opts.t);
    handle.removeAttribute('title');
    handle.setAttribute('aria-label', label);
    const tipEl = handle.querySelector('.mda-cm-block-drag-tip');
    if (tipEl) tipEl.textContent = label;
  }
  anchorEl.insertBefore(handle, anchorEl.firstChild);

  let pressTimer = 0;
  let dragging = false;
  let dropLine = null;
  let lastResolved = null;
  let hideTimer = 0;
  let handleHover = false;
  /** @type {HTMLElement[]} */
  let highlightEls = [];

  function setBlockHighlight(on) {
    if (!on) {
      for (let i = 0; i < highlightEls.length; i++) {
        highlightEls[i].classList.remove('mda-cm-block-handle-highlight');
      }
      highlightEls = [];
      return;
    }
    highlightEls = resolveBlockHighlightTargets(view, blockRoot, range, opts.blockKind);
    for (let i = 0; i < highlightEls.length; i++) {
      highlightEls[i].classList.add('mda-cm-block-handle-highlight');
    }
  }

  function showHandle() {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
    blockRoot.classList.add('mda-cm-block-handle-show');
  }

  function scheduleHideHandle() {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(function () {
      hideTimer = 0;
      if (handleHover) return;
      if (dragging || handle.classList.contains('mda-cm-block-drag-handle-active')) return;
      if (typeof document !== 'undefined' && document.body.classList.contains('mda-cm-block-drag-active')) {
        return;
      }
      if (isBlockHandleMenuOpenFor(blockRoot)) return;
      setBlockHighlight(false);
      blockRoot.classList.remove('mda-cm-block-handle-show');
    }, HANDLE_HIDE_MS);
  }

  function onHandleMouseEnter() {
    handleHover = true;
    handle.classList.add('mda-cm-block-drag-handle-hover');
    setBlockHighlight(true);
    showHandle();
  }

  function onHandleMouseLeave() {
    handleHover = false;
    handle.classList.remove('mda-cm-block-drag-handle-hover');
    setBlockHighlight(false);
    scheduleHideHandle();
  }

  /** @type {HTMLElement[]} */
  const hoverTargets = [blockRoot];
  /** @type {{ el: HTMLElement, enter: Function, leave: Function }[]} */
  const boundHover = [];

  function bindHoverTarget(el) {
    if (!el || hoverTargets.indexOf(el) >= 0) return;
    hoverTargets.push(el);
    el.addEventListener('mouseenter', showHandle);
    el.addEventListener('mouseleave', scheduleHideHandle);
    boundHover.push({ el: el, enter: showHandle, leave: scheduleHideHandle });
  }

  for (let hi = 0; hi < hoverTargets.length; hi++) {
    hoverTargets[hi].addEventListener('mouseenter', showHandle);
    hoverTargets[hi].addEventListener('mouseleave', scheduleHideHandle);
  }
  handle.addEventListener('mouseenter', onHandleMouseEnter);
  handle.addEventListener('mouseleave', onHandleMouseLeave);

  // toDOM 时 widget 尚未挂到 .cm-line，须延后绑定；引用/标题还须覆盖块内所有行
  if (
    blockRoot.classList.contains('mda-cm-quote-handle-anchor') ||
    blockRoot.classList.contains('mda-cm-heading-handle-anchor')
  ) {
    const bindSideLines = function () {
      if (!blockRoot.isConnected) return;
      const line = blockRoot.closest('.cm-line');
      if (line) bindHoverTarget(line);
      const lines = collectCmLinesInRange(view, range.from, range.to);
      for (let i = 0; i < lines.length; i++) bindHoverTarget(lines[i]);
    };
    requestAnimationFrame(bindSideLines);
  }

  function ensureDropLine() {
    if (dropLine && dropLine.parentNode) return dropLine;
    dropLine = document.createElement('div');
    dropLine.className = 'mda-cm-block-drop-indicator';
    dropLine.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dropLine);
    return dropLine;
  }

  /** 拖放指示线对齐编辑区内容宽，不穿过滚动条 */
  function getDropLineBounds() {
    return getEditorDropLineBounds(view);
  }

  function removeDropLine() {
    if (dropLine && dropLine.parentNode) dropLine.parentNode.removeChild(dropLine);
    dropLine = null;
  }

  function clearHoverMarks() {
    const prev = document.querySelectorAll('.mda-cm-block-drop-replace');
    for (let i = 0; i < prev.length; i++) prev[i].classList.remove('mda-cm-block-drop-replace');
  }

  function updateDropIndicator(clientX, clientY) {
    const block = readBlockRange(blockRoot, range);
    const resolved = resolveBlockDropTargetFromCoords(
      view,
      block.from,
      block.to,
      clientX,
      clientY,
      blockRoot,
      {
        blockSelector: opts.blockSelector,
        replaceOnHover: !!opts.replaceOnHover,
      }
    );
    lastResolved = resolved;
    clearHoverMarks();
    if (resolved.mode === 'replace' && resolved.hoverEl) {
      resolved.hoverEl.classList.add('mda-cm-block-drop-replace');
      if (dropLine) dropLine.style.display = 'none';
      return resolved;
    }

    const dropPos = resolved.pos;
    if (dropPos == null) {
      if (dropLine) dropLine.style.display = 'none';
      return resolved;
    }
    const top = getDropIndicatorTop(view, dropPos);
    if (top == null) return resolved;
    const line = ensureDropLine();
    const bounds = getDropLineBounds();
    line.style.display = 'block';
    line.style.top = top + 'px';
    line.style.left = bounds.left + 'px';
    line.style.width = bounds.width + 'px';
    return resolved;
  }

  handle.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;

    pressTimer = window.setTimeout(function () {
      dragging = true;
      blockRoot.classList.add('mda-cm-block-dragging');
      document.body.classList.add('mda-cm-block-drag-active');
      handle.classList.add('mda-cm-block-drag-handle-active');
      lastResolved = updateDropIndicator(e.clientX, e.clientY);
    }, LONG_PRESS_MS);

    function onMove(ev) {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (dx * dx + dy * dy > CANCEL_DRAG_PX * CANCEL_DRAG_PX) {
        moved = true;
        if (!dragging) {
          window.clearTimeout(pressTimer);
          pressTimer = 0;
        }
      }
      if (!dragging) return;
      ev.preventDefault();
      lastResolved = updateDropIndicator(ev.clientX, ev.clientY);
    }

    function onUp(ev) {
      window.clearTimeout(pressTimer);
      pressTimer = 0;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      if (!dragging && !moved) {
        const block = readBlockRange(blockRoot, range);
        if (opts.blockMenuHandlers || typeof opts.onHandleClick === 'function') {
          if (typeof opts.onHandleClick === 'function') {
            opts.onHandleClick(handle, block);
          } else {
            showBlockHandleMenu({
              anchorEl: handle,
              blockRoot: blockRoot,
              view: view,
              block: block,
              blockKind: opts.blockKind,
              t: opts.t,
              handlers: opts.blockMenuHandlers,
            });
          }
          return;
        }
      }

      if (!dragging) return;
      dragging = false;
      blockRoot.classList.remove('mda-cm-block-dragging');
      document.body.classList.remove('mda-cm-block-drag-active');
      handle.classList.remove('mda-cm-block-drag-handle-active');
      removeDropLine();

      const block = readBlockRange(blockRoot, range);
      let resolved = lastResolved;
      if (!resolved) {
        resolved = resolveBlockDropTargetFromCoords(
          view,
          block.from,
          block.to,
          ev.clientX,
          ev.clientY,
          blockRoot,
          {
            blockSelector: opts.blockSelector,
            replaceOnHover: !!opts.replaceOnHover,
          }
        );
      }
      clearHoverMarks();

      if (
        resolved.mode === 'replace' &&
        resolved.targetBlock &&
        typeof opts.onDropReplaceBlock === 'function'
      ) {
        opts.onDropReplaceBlock({
          from: block.from,
          to: block.to,
          source: block.source,
          target: resolved.targetBlock,
        });
        return;
      }

      const pos = resolved.pos;
      if (pos != null && typeof opts.onMoveBlock === 'function') {
        opts.onMoveBlock({
          from: block.from,
          to: block.to,
          source: block.source,
          targetPos: pos,
        });
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

module.exports = {
  attachBlockDragHandle: attachBlockDragHandle,
  buildHandleInnerHtml: buildHandleInnerHtml,
  collectCmLinesInRange: collectCmLinesInRange,
  resolveBlockHighlightTargets: resolveBlockHighlightTargets,
  LONG_PRESS_MS: LONG_PRESS_MS,
  HANDLE_HIDE_MS: HANDLE_HIDE_MS,
};

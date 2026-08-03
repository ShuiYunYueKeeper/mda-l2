/**
 * 块级 widget 左上角拖动手柄（类型图标 + 六点；单击菜单 / 长按拖动）。
 */
'use strict';

const { resolveBlockDropTargetFromCoords } = require('./image-block-ops');
const { showBlockHandleMenu } = require('./block-handle-menu');
const { blockTypeIconHtml } = require('./block-menu-icons');

const LONG_PRESS_MS = 200;
const CANCEL_DRAG_PX = 10;

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
    '</span>'
  );
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
  if (opts.t) {
    const { uiT } = require('./widget-common');
    handle.title = uiT('widgetBlockDragHandle', opts.t);
    handle.setAttribute('aria-label', uiT('widgetBlockDragHandle', opts.t));
  }
  handle.innerHTML = buildHandleInnerHtml(opts.blockKind);
  anchorEl.insertBefore(handle, anchorEl.firstChild);

  let pressTimer = 0;
  let dragging = false;
  let dropLine = null;
  let lastResolved = null;

  function ensureDropLine() {
    if (dropLine && dropLine.parentNode) return dropLine;
    dropLine = document.createElement('div');
    dropLine.className = 'mda-cm-block-drop-indicator';
    dropLine.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dropLine);
    return dropLine;
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
    const coords = view.coordsAtPos(dropPos);
    if (!coords) return resolved;
    const line = ensureDropLine();
    const host = blockRoot.closest('.cm-editor');
    const hostRect = host ? host.getBoundingClientRect() : { left: 0, width: window.innerWidth };
    line.style.display = 'block';
    line.style.top = coords.top + 'px';
    line.style.left = hostRect.left + 'px';
    line.style.width = hostRect.width + 'px';
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
  LONG_PRESS_MS: LONG_PRESS_MS,
};

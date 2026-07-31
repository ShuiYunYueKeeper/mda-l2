'use strict';

const { isNearFrameResizeCorner } = require('./image-edge-resize');
const { resolveDropTargetFromCoords } = require('./image-block-ops');

const LONG_PRESS_MS = 200;
const CANCEL_DRAG_PX = 10;

/**
 * @param {HTMLElement} root
 * @param {{ from: number, to: number, source?: string }} fallback
 */
function readBlockRange(root, fallback) {
  const fromRaw = root.getAttribute('data-mda-block-from');
  const toRaw = root.getAttribute('data-mda-block-to');
  const source = root.getAttribute('data-mda-block-source') || fallback.source || '';
  const from =
    fromRaw != null && fromRaw !== '' ? parseInt(fromRaw, 10) : fallback.from;
  const to = toRaw != null && toRaw !== '' ? parseInt(toRaw, 10) : fallback.to;
  return { from: from, to: to, source: source };
}

/** @type {{ el: HTMLElement | null, mode: string } | null} */
let dropHoverState = null;

/**
 * @param {{ mode: string, hoverEl: HTMLElement | null }} resolved
 */
function markDropTarget(resolved) {
  const prev = document.querySelectorAll(
    '.mda-cm-image-drop-replace, .mda-cm-image-drop-insert'
  );
  for (let i = 0; i < prev.length; i++) {
    prev[i].classList.remove('mda-cm-image-drop-replace');
    prev[i].classList.remove('mda-cm-image-drop-insert');
  }
  dropHoverState = null;
  if (!resolved.hoverEl) return;
  if (resolved.mode === 'replace') {
    resolved.hoverEl.classList.add('mda-cm-image-drop-replace');
    dropHoverState = { el: resolved.hoverEl, mode: 'replace' };
  }
}

/**
 * @param {HTMLElement} root
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, source?: string }} range
 * @param {{ onMoveImageBlock?: Function, onDropReplaceImageBlock?: Function }} opts
 */
function attachImageDrag(root, view, range, opts) {
  let pressTimer = 0;
  let dragging = false;
  let dropLine = null;
  let lastResolved = null;

  function ensureDropLine() {
    if (dropLine && dropLine.parentNode) return dropLine;
    dropLine = document.createElement('div');
    dropLine.className = 'mda-cm-image-drop-indicator';
    dropLine.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dropLine);
    return dropLine;
  }

  function removeDropLine() {
    if (dropLine && dropLine.parentNode) dropLine.parentNode.removeChild(dropLine);
    dropLine = null;
  }

  function updateDropIndicator(clientX, clientY) {
    const block = readBlockRange(root, range);
    const resolved = resolveDropTargetFromCoords(
      view,
      block.from,
      block.to,
      clientX,
      clientY,
      root
    );
    lastResolved = resolved;
    markDropTarget(resolved);

    if (resolved.mode === 'replace') {
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
    const host = root.closest('.cm-editor');
    const hostRect = host ? host.getBoundingClientRect() : { left: 0, width: window.innerWidth };
    line.style.display = 'block';
    line.style.top = coords.top + 'px';
    line.style.left = hostRect.left + 'px';
    line.style.width = hostRect.width + 'px';
    return resolved;
  }

  root.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('.mda-cm-image-toolbar')) return;
    const frame = root.querySelector('.mda-cm-image-frame');
    if (e.target && e.target.closest && e.target.closest('.mda-cm-image-handle-br')) return;
    if (frame && isNearFrameResizeCorner(frame, e.clientX, e.clientY)) return;

    const sx = e.clientX;
    const sy = e.clientY;

    pressTimer = window.setTimeout(function () {
      dragging = true;
      root.classList.add('mda-cm-image-dragging');
      document.body.classList.add('mda-cm-image-drag-active');
      lastResolved = updateDropIndicator(e.clientX, e.clientY);
    }, LONG_PRESS_MS);

    function onMove(ev) {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!dragging && dx * dx + dy * dy > CANCEL_DRAG_PX * CANCEL_DRAG_PX) {
        window.clearTimeout(pressTimer);
        pressTimer = 0;
        return;
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
      if (!dragging) return;
      dragging = false;
      root.classList.remove('mda-cm-image-dragging');
      document.body.classList.remove('mda-cm-image-drag-active');
      removeDropLine();

      const block = readBlockRange(root, range);
      let resolved = lastResolved;
      if (!resolved) {
        resolved = resolveDropTargetFromCoords(
          view,
          block.from,
          block.to,
          ev.clientX,
          ev.clientY,
          root
        );
      }
      markDropTarget({ mode: 'insert', hoverEl: null });

      if (
        resolved.mode === 'replace' &&
        resolved.targetBlock &&
        typeof opts.onDropReplaceImageBlock === 'function'
      ) {
        opts.onDropReplaceImageBlock({
          from: block.from,
          to: block.to,
          source: block.source,
          target: resolved.targetBlock,
        });
        return;
      }

      const pos = resolved.pos;
      if (pos != null && typeof opts.onMoveImageBlock === 'function') {
        opts.onMoveImageBlock({
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
  attachImageDrag: attachImageDrag,
  LONG_PRESS_MS: LONG_PRESS_MS,
  CANCEL_DRAG_PX: CANCEL_DRAG_PX,
};

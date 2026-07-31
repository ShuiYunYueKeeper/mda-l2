/**
 * CM6 图片：选中后右下角拖曳缩放（竞品式蓝框 + 右下角手柄）。
 */
'use strict';

const { applyLiveImageWidth } = require('./image-layout');

const CORNER_PX = 16;

/**
 * @param {HTMLElement} frame
 * @param {number} clientX
 * @param {number} clientY
 */
function isNearFrameResizeCorner(frame, clientX, clientY) {
  if (!frame) return false;
  const r = frame.getBoundingClientRect();
  return (
    clientX >= r.right - CORNER_PX &&
    clientX <= r.right + 1 &&
    clientY >= r.bottom - CORNER_PX &&
    clientY <= r.bottom + 1
  );
}

/** @deprecated 兼容旧调用 */
function isNearFrameResizeEdge(frame, clientX) {
  if (!frame) return false;
  const r = frame.getBoundingClientRect();
  const midY = (r.top + r.bottom) / 2;
  return isNearFrameResizeCorner(frame, clientX, midY);
}

/**
 * @param {HTMLElement} frame
 * @param {HTMLImageElement} img
 * @param {{ onImageResize?: Function, onImageResizeEnd?: Function, getResizeMaxWidth?: Function }} opts
 * @param {() => void} selectFrame
 */
function attachImageCornerResize(frame, img, opts, selectFrame) {
  if (!frame || !img) return;
  let resizing = false;

  function updateCursor(e) {
    if (resizing) {
      frame.style.cursor = 'nwse-resize';
      return;
    }
    if (!frame.classList.contains('mda-cm-media-selected')) {
      frame.style.cursor = '';
      return;
    }
    frame.style.cursor = isNearFrameResizeCorner(frame, e.clientX, e.clientY)
      ? 'nwse-resize'
      : '';
  }

  frame.addEventListener('pointermove', updateCursor);
  frame.addEventListener('pointerleave', function () {
    if (!resizing) frame.style.cursor = '';
  });

  frame.addEventListener(
    'pointerdown',
    function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-image-toolbar')) return;
      if (!frame.classList.contains('mda-cm-media-selected')) return;
      const onHandle =
        e.target && e.target.closest && e.target.closest('.mda-cm-image-handle-br');
      if (!onHandle && !isNearFrameResizeCorner(frame, e.clientX, e.clientY)) return;

      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startW = img.getBoundingClientRect().width || img.clientWidth || 200;
      resizing = true;
      document.body.classList.add('mda-img-resizing');
      frame.classList.add('mda-cm-img-resize-active');
      frame.style.cursor = 'nwse-resize';

      try {
        frame.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }

      function onMove(ev) {
        ev.preventDefault();
        const dx = ev.clientX - startX;
        const maxW =
          typeof opts.getResizeMaxWidth === 'function' ? opts.getResizeMaxWidth() : 1200;
        const minW = 48;
        const next = Math.max(minW, Math.min(maxW, Math.round(startW + dx)));
        applyLiveImageWidth(img, next);
      }

      function onUp(ev) {
        resizing = false;
        document.body.classList.remove('mda-img-resizing');
        frame.classList.remove('mda-cm-img-resize-active');
        try {
          frame.releasePointerCapture(ev.pointerId);
        } catch (_) {
          /* ignore */
        }
        frame.removeEventListener('pointermove', onMove);
        frame.removeEventListener('pointerup', onUp);
        frame.removeEventListener('pointercancel', onUp);
        const finalW = Math.round(img.getBoundingClientRect().width || img.clientWidth || 0);
        if (typeof opts.onImageResize === 'function' && finalW > 16) {
          opts.onImageResize(img, finalW);
        }
        if (typeof opts.onImageResizeEnd === 'function') {
          opts.onImageResizeEnd(img);
        }
        updateCursor(ev);
      }

      frame.addEventListener('pointermove', onMove);
      frame.addEventListener('pointerup', onUp);
      frame.addEventListener('pointercancel', onUp);
    },
    true
  );
}

module.exports = {
  CORNER_PX: CORNER_PX,
  isNearFrameResizeCorner: isNearFrameResizeCorner,
  isNearFrameResizeEdge: isNearFrameResizeEdge,
  attachImageCornerResize: attachImageCornerResize,
  attachImageEdgeResize: attachImageCornerResize,
};

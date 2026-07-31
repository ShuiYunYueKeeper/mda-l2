/**
 * CM6 Mermaid：选中后右下角拖曳缩放。
 */
'use strict';

const { isNearFrameResizeCorner } = require('./image-edge-resize');
const { applyLiveMermaidWidth } = require('./mermaid-layout');

/**
 * @param {HTMLElement} frame
 * @param {HTMLElement} stage
 * @param {{ onMermaidResize?: Function, onMermaidResizeEnd?: Function, onMermaidResizeReset?: Function, getResizeMaxWidth?: Function }} opts
 * @param {() => void} selectFrame
 */
function attachMermaidCornerResize(frame, stage, opts, selectFrame) {
  if (!frame || !stage) return;
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

  const handles = frame.querySelector('.mda-cm-mermaid-handles');
  if (handles) {
    handles.addEventListener('dblclick', function (e) {
      const onBr = e.target && e.target.closest && e.target.closest('.mda-cm-mermaid-handle-br');
      if (!onBr) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof opts.onMermaidResizeReset === 'function') {
        opts.onMermaidResizeReset(stage);
      }
      try {
        if (selectFrame) selectFrame();
      } catch (_) {
        /* ignore */
      }
    });
  }

  frame.addEventListener(
    'pointerdown',
    function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-toolbar')) return;
      if (!frame.classList.contains('mda-cm-media-selected')) return;
      const onHandle =
        e.target && e.target.closest && e.target.closest('.mda-cm-mermaid-handle-br');
      if (!onHandle && !isNearFrameResizeCorner(frame, e.clientX, e.clientY)) return;

      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startW = stage.getBoundingClientRect().width || stage.clientWidth || 200;
      resizing = true;
      document.body.classList.add('mda-img-resizing');
      frame.classList.add('mda-cm-mermaid-resize-active');
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
        const minW = 80;
        const next = Math.max(minW, Math.min(maxW, Math.round(startW + dx)));
        applyLiveMermaidWidth(stage, next);
      }

      function onUp(ev) {
        resizing = false;
        document.body.classList.remove('mda-img-resizing');
        frame.classList.remove('mda-cm-mermaid-resize-active');
        try {
          frame.releasePointerCapture(ev.pointerId);
        } catch (_) {
          /* ignore */
        }
        frame.removeEventListener('pointermove', onMove);
        frame.removeEventListener('pointerup', onUp);
        frame.removeEventListener('pointercancel', onUp);
        const finalW = Math.round(stage.getBoundingClientRect().width || stage.clientWidth || 0);
        if (typeof opts.onMermaidResize === 'function' && finalW > 16) {
          opts.onMermaidResize(stage, finalW);
        }
        if (typeof opts.onMermaidResizeEnd === 'function') {
          opts.onMermaidResizeEnd(stage);
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
  attachMermaidCornerResize: attachMermaidCornerResize,
};

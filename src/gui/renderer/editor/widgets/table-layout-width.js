/**
 * CM6 表格块：与围栏代码块一致，根节点使用正文栏显式像素宽（由 app onScaleTableBlock 注入）。
 */
'use strict';

/**
 * @param {HTMLElement} root
 * @param {number} widthPx
 */
function applyTableBlockDisplayWidth(root, widthPx) {
  if (!root || !(widthPx > 16)) return 0;
  const w = Math.round(widthPx);
  root.style.display = 'block';
  root.style.width = w + 'px';
  root.style.maxWidth = w + 'px';
  root.style.boxSizing = 'border-box';
  root.classList.add('mda-cm-table-sized');

  const stage = root.querySelector('.mda-cm-table-stage');
  if (stage) {
    stage.style.width = '100%';
    stage.style.maxWidth = '100%';
    stage.style.boxSizing = 'border-box';
  }
  const wrap = root.querySelector('.mda-cm-table-wrap');
  if (wrap && !wrap.hasAttribute('data-mda-snap')) {
    wrap.style.width = '100%';
    wrap.style.maxWidth = '100%';
  }
  const table = root.querySelector('table.mda-cm-table');
  if (table && table.getAttribute('data-mda-layout') !== 'fixed') {
    table.style.width = '100%';
    table.style.tableLayout = 'fixed';
  }
  return w;
}

/**
 * @param {HTMLElement} root
 * @param {{ onScaleTableBlock?: Function }} opts
 * @param {import('@codemirror/view').EditorView} view
 */
function attachTableBlockLayout(root, opts, view) {
  function sync() {
    if (typeof opts.onScaleTableBlock === 'function') {
      opts.onScaleTableBlock({ root: root });
    }
  }
  sync();
  requestAnimationFrame(sync);
  let content = root.isConnected ? root.closest('.cm-content') : null;
  if (!content && view && view.dom) content = view.dom.querySelector('.cm-content');
  if (content && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(sync);
    ro.observe(content);
    root._mdaTableWidthRo = ro;
  }
}

/**
 * @param {HTMLElement | null | undefined} dom
 */
function detachTableBlockLayout(dom) {
  if (!dom || !dom._mdaTableWidthRo) return;
  dom._mdaTableWidthRo.disconnect();
  dom._mdaTableWidthRo = null;
}

module.exports = {
  applyTableBlockDisplayWidth: applyTableBlockDisplayWidth,
  attachTableBlockLayout: attachTableBlockLayout,
  detachTableBlockLayout: detachTableBlockLayout,
};

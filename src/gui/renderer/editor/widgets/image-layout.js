/**
 * CM6 图片块：frame 与 img 尺寸同步（蓝框贴图，缩放时不重建 widget）。
 */
'use strict';

/**
 * @param {HTMLImageElement} img
 */
function syncFrameToImage(img) {
  if (!img) return;
  const frame = img.closest('.mda-cm-image-frame');
  if (!frame) return;
  const inner = frame.querySelector('.mda-cm-image-inner');
  const attrW = parseInt(img.getAttribute('data-mda-display-width') || '', 10);
  const w = attrW > 0 ? attrW : Math.round(img.getBoundingClientRect().width || img.clientWidth || 0);
  if (!(w > 0)) return;

  frame.style.width = w + 'px';
  if (inner) inner.style.width = w + 'px';

  if (attrW > 0) {
    frame.classList.add('mda-cm-image-sized');
    if (inner) inner.classList.add('mda-cm-image-sized');
    frame.style.maxWidth = 'none';
    if (inner) inner.style.maxWidth = 'none';
    img.style.maxWidth = 'none';
  } else {
    frame.classList.remove('mda-cm-image-sized');
    if (inner) inner.classList.remove('mda-cm-image-sized');
    frame.style.width = '';
    frame.style.maxWidth = '';
    if (inner) {
      inner.style.width = '';
      inner.style.maxWidth = '';
    }
    img.style.maxWidth = '100%';
  }
}

/**
 * 拖动缩放中：只改 DOM，不触发 CM6 requestMeasure。
 * @param {HTMLImageElement} img
 * @param {number} widthPx
 */
function applyLiveImageWidth(img, widthPx) {
  if (!img) return 0;
  const w = Math.round(widthPx);
  if (!(w > 16)) return 0;
  img.style.width = w + 'px';
  img.style.maxWidth = 'none';
  img.style.height = 'auto';
  img.setAttribute('data-mda-display-width', String(w));
  syncFrameToImage(img);
  return w;
}

/**
 * @param {HTMLImageElement} img
 */
function clearLiveImageWidth(img) {
  if (!img) return;
  img.style.width = '';
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
  img.removeAttribute('data-mda-display-width');
  syncFrameToImage(img);
}

module.exports = {
  syncFrameToImage: syncFrameToImage,
  applyLiveImageWidth: applyLiveImageWidth,
  clearLiveImageWidth: clearLiveImageWidth,
};

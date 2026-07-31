/**
 * CM6 围栏代码块：与图片/流程图一致，frame 使用显式像素宽（由 app onScaleCodeBlock 注入）。
 */
'use strict';

/**
 * @param {HTMLElement} root
 * @param {number} widthPx
 */
function applyCodeBlockDisplayWidth(root, widthPx) {
  if (!root || !(widthPx > 16)) return 0;
  const w = Math.round(widthPx);
  root.style.width = w + 'px';
  root.style.maxWidth = w + 'px';
  root.style.boxSizing = 'border-box';
  const frame = root.querySelector('.mda-cm-code-frame');
  if (frame) {
    frame.style.width = '100%';
    frame.classList.add('mda-cm-code-sized');
  }
  return w;
}

module.exports = {
  applyCodeBlockDisplayWidth: applyCodeBlockDisplayWidth,
};

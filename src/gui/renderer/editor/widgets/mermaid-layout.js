/**
 * CM6 Mermaid 块：frame 与 stage 尺寸同步。
 */
'use strict';

/**
 * @param {HTMLElement} stage
 */
function syncMermaidFrameToStage(stage) {
  if (!stage) return;
  const frame = stage.closest('.mda-cm-mermaid-frame');
  if (!frame) return;
  const attrW = parseInt(stage.getAttribute('data-mda-display-width') || '', 10);
  const w = attrW > 0 ? attrW : Math.round(stage.getBoundingClientRect().width || stage.clientWidth || 0);
  if (!(w > 0)) return;

  frame.style.width = w + 'px';
  if (attrW > 0) {
    frame.classList.add('mda-cm-mermaid-sized');
    stage.classList.add('mda-cm-mermaid-sized');
    frame.style.maxWidth = 'none';
    stage.style.maxWidth = 'none';
  } else {
    frame.classList.remove('mda-cm-mermaid-sized');
    stage.classList.remove('mda-cm-mermaid-sized');
    frame.style.width = '';
    frame.style.maxWidth = '';
    stage.style.maxWidth = '100%';
  }
}

/**
 * @param {HTMLElement} stage
 * @param {number} widthPx
 */
function applyLiveMermaidWidth(stage, widthPx) {
  if (!stage) return 0;
  const w = Math.round(widthPx);
  if (!(w > 16)) return 0;
  stage.style.width = w + 'px';
  stage.style.maxWidth = 'none';
  stage.style.marginLeft = 'auto';
  stage.style.marginRight = 'auto';
  stage.setAttribute('data-mda-display-width', String(w));
  const svg = stage.querySelector('svg');
  if (svg) {
    svg.style.width = '100%';
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
  }
  syncMermaidFrameToStage(stage);
  return w;
}

/**
 * @param {HTMLElement} stage
 */
function clearLiveMermaidWidth(stage) {
  if (!stage) return;
  stage.style.width = '';
  stage.style.maxWidth = '100%';
  stage.removeAttribute('data-mda-display-width');
  const svg = stage.querySelector('svg');
  if (svg) {
    svg.style.width = '';
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
  }
  syncMermaidFrameToStage(stage);
}

module.exports = {
  syncMermaidFrameToStage: syncMermaidFrameToStage,
  applyLiveMermaidWidth: applyLiveMermaidWidth,
  clearLiveMermaidWidth: clearLiveMermaidWidth,
};

/**
 * CM6 Mermaid 块：边框通栏，SVG 固有尺寸（不随栏宽拉伸）。
 */
'use strict';

/**
 * 清掉拖拽/比例留下的固定宽，让 CSS width:100% 接管边框。
 * @param {HTMLElement} stage
 */
function syncMermaidFrameToStage(stage) {
  if (!stage) return;
  const frame = stage.closest('.mda-cm-mermaid-frame');
  if (!frame) return;
  frame.classList.remove('mda-cm-mermaid-sized');
  stage.classList.remove('mda-cm-mermaid-sized');
  frame.style.width = '';
  frame.style.maxWidth = '';
  stage.style.width = '';
  stage.style.maxWidth = '100%';
  stage.removeAttribute('data-mda-display-width');
}

/**
 * @deprecated 流程图不再支持拖拽调宽；保留空实现以免旧调用报错。
 * @param {HTMLElement} stage
 * @param {number} _widthPx
 */
function applyLiveMermaidWidth(stage, _widthPx) {
  syncMermaidFrameToStage(stage);
  return 0;
}

/**
 * @param {HTMLElement} stage
 */
function clearLiveMermaidWidth(stage) {
  syncMermaidFrameToStage(stage);
}

module.exports = {
  syncMermaidFrameToStage: syncMermaidFrameToStage,
  applyLiveMermaidWidth: applyLiveMermaidWidth,
  clearLiveMermaidWidth: clearLiveMermaidWidth,
};

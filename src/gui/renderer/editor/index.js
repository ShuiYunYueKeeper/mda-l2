/**
 * MDA 3.0 编辑面入口（M8）。
 * 启用：`localStorage mda-cm6=1` 后重启 GUI。
 */
'use strict';

const { createEditor, refreshDecorations, refreshWidgetI18n } = require('./mount');
const imageBlockOps = require('./widgets/image-block-ops');
const { insertMarkdownAtBlankLine, insertMarkdownNearBlock } = require('./widgets/block-handle-ops');
const { serializeImageMarkdown } = require('./model/parse-image');
const { clearSelectedImageBlock } = require('./widgets/image-selection');
const { clearSelectedMermaidBlock } = require('./widgets/mermaid-selection');
const { clearSelectedCodeBlock } = require('./widgets/code-selection');
const { clearSelectedMathBlock } = require('./widgets/math-selection');
const { serializeFencedCode } = require('./model/parse-fence');
const { serializeMathBlock, serializeMathInline } = require('./model/parse-math');
const { MODE_PREVIEW, MODE_SOURCE } = require('./mode');
const { SearchSession } = require('./state/search-session');
const editorConfig = require('./config');

function isEnabledByPref() {
  try {
    var v = localStorage.getItem('mda-cm6');
    if (v === null || v === undefined || v === '') return false;
    return v === '1' || v === 'true';
  } catch (_) {
    return false;
  }
}

function setEnabledPref(on) {
  try {
    localStorage.setItem('mda-cm6', on ? '1' : '0');
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  createEditor: createEditor,
  refreshDecorations: refreshDecorations,
  refreshWidgetI18n: refreshWidgetI18n,
  deleteBlockRange: imageBlockOps.deleteBlockRange,
  deleteImageBlock: imageBlockOps.deleteImageBlock,
  resolveBlockRange: imageBlockOps.resolveBlockRange,
  replaceBlockRange: imageBlockOps.replaceBlockRange,
  moveBlockRange: imageBlockOps.moveBlockRange,
  dropReplaceImageBlock: imageBlockOps.dropReplaceImageBlock,
  insertImageAt: imageBlockOps.insertImageAt,
  insertMarkdownAtBlankLine: insertMarkdownAtBlankLine,
  insertMarkdownNearBlock: insertMarkdownNearBlock,
  serializeImageMarkdown: serializeImageMarkdown,
  clearSelectedImageBlock: clearSelectedImageBlock,
  clearSelectedMermaidBlock: clearSelectedMermaidBlock,
  clearSelectedCodeBlock: clearSelectedCodeBlock,
  clearSelectedMathBlock: clearSelectedMathBlock,
  serializeFencedCode: serializeFencedCode,
  serializeMathBlock: serializeMathBlock,
  serializeMathInline: serializeMathInline,
  MODE_PREVIEW: MODE_PREVIEW,
  MODE_SOURCE: MODE_SOURCE,
  SearchSession: SearchSession,
  isEnabledByPref: isEnabledByPref,
  setEnabledPref: setEnabledPref,
  config: editorConfig,
};

if (typeof window !== 'undefined') {
  window.MDAEditor = module.exports;
}

/**
 * MDA 3.0 编辑面入口（M8）。
 * 默认启用预览编辑；`localStorage mda-cm6=0` 后重启 GUI 可回退 2.0 源码编辑面。
 */
'use strict';

const { EditorView } = require('@codemirror/view');
const { createEditor, refreshDecorations, refreshWidgetI18n, notifyAnnoFilterChanged } = require('./mount');
const annoAddContext = require('./model/anno-add-context');
const { anchorFromSelection } = require('./model/anchor-from-sel');
const imageBlockOps = require('./widgets/image-block-ops');
const { insertMarkdownAtBlankLine, insertMarkdownNearBlock } = require('./widgets/block-handle-ops');
const { serializeImageMarkdown } = require('./model/parse-image');
const { clearSelectedImageBlock } = require('./widgets/image-selection');
const { clearSelectedMermaidBlock } = require('./widgets/mermaid-selection');
const { clearSelectedCodeBlock } = require('./widgets/code-selection');
const { clearSelectedMathBlock } = require('./widgets/math-selection');
const { serializeFencedCode } = require('./model/parse-fence');
const { tryCodeBlockUndo, tryCodeBlockRedo } = require('./widgets/code');
const { serializeMathBlock, serializeMathInline } = require('./model/parse-math');
const { flushAllTableWidgets } = require('./widgets/table');
const { MODE_PREVIEW, MODE_SOURCE } = require('./mode');
const { SearchSession } = require('./state/search-session');
const editorConfig = require('./config');
const { isEnabledByPref, setEnabledPref } = require('./pref');
const { describeAiFailure } = require('./ai/errors');
const { sliceSelectionForClipboard } = require('./syntax-clipboard');

module.exports = {
  createEditor: createEditor,
  findEditorView: function (dom) {
    return EditorView.findFromDOM(dom || document.querySelector('.cm-content') || document.body);
  },
  sliceSelectionForClipboard: sliceSelectionForClipboard,
  refreshDecorations: refreshDecorations,
  notifyAnnoFilterChanged: notifyAnnoFilterChanged,
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
  tryCodeBlockUndo: tryCodeBlockUndo,
  tryCodeBlockRedo: tryCodeBlockRedo,
  serializeMathBlock: serializeMathBlock,
  serializeMathInline: serializeMathInline,
  flushAllTableWidgets: flushAllTableWidgets,
  MODE_PREVIEW: MODE_PREVIEW,
  MODE_SOURCE: MODE_SOURCE,
  SearchSession: SearchSession,
  isEnabledByPref: isEnabledByPref,
  setEnabledPref: setEnabledPref,
  resolveAnnoPanelContext: annoAddContext.resolveCm6AnnoPanelContext,
  canUseSelectionAnnoForRange: annoAddContext.canUseSelectionAnnoForRange,
  describeAiFailure: describeAiFailure,
  blockKindAtPos: annoAddContext.blockKindAtPos,
  isBlockOnlyKind: annoAddContext.isBlockOnlyKind,
  blockAnnotationLine: annoAddContext.blockAnnotationLine,
  anchorFromSelection: anchorFromSelection,
  config: editorConfig,
};

if (typeof window !== 'undefined') {
  window.MDAEditor = module.exports;
}

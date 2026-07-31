/**
 * 双模式 compartment：preview（装饰开）/ source（装饰关，行号开）。
 */
'use strict';

const { Compartment } = require('@codemirror/state');
const { lineNumbers, EditorView } = require('@codemirror/view');
const { syntaxHighlighting, defaultHighlightStyle } = require('@codemirror/language');
const { livePreview } = require('./live-preview');
const { saveModeSwitchState, restoreModeSwitchState } = require('./state/mode-switch');
const { flushAllTableWidgets } = require('./widgets/table');

const MODE_PREVIEW = 'preview';
const MODE_SOURCE = 'source';

function createModeCompartments() {
  return {
    livePreviewComp: new Compartment(),
    lineNumbersComp: new Compartment(),
    syntaxHighlightComp: new Compartment(),
    lineWrappingComp: new Compartment(),
  };
}

/**
 * @param {'preview'|'source'} mode
 * @param {{ livePreviewComp: import('@codemirror/state').Compartment, lineNumbersComp: import('@codemirror/state').Compartment }} comps
 * @param {object} [liveOpts]
 */
function extensionsForMode(mode, comps, liveOpts) {
  if (mode === MODE_SOURCE) {
    return [
      comps.livePreviewComp.of([]),
      comps.lineNumbersComp.of(lineNumbers()),
      comps.syntaxHighlightComp.of(syntaxHighlighting(defaultHighlightStyle)),
      comps.lineWrappingComp.of([]),
    ];
  }
  return [
    comps.livePreviewComp.of(livePreview(liveOpts || {})),
    comps.lineNumbersComp.of([]),
    comps.syntaxHighlightComp.of([]),
    comps.lineWrappingComp.of(EditorView.lineWrapping),
  ];
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {'preview'|'source'} mode
 * @param {{ livePreviewComp: import('@codemirror/state').Compartment, lineNumbersComp: import('@codemirror/state').Compartment }} comps
 * @param {object} [liveOpts]
 */
function reconfigureMode(view, mode, comps, liveOpts) {
  flushAllTableWidgets(view);
  const snap = saveModeSwitchState(view);
  view.dispatch({
    effects: [
      comps.livePreviewComp.reconfigure(
        mode === MODE_SOURCE ? [] : livePreview(liveOpts || {})
      ),
      comps.lineNumbersComp.reconfigure(mode === MODE_SOURCE ? lineNumbers() : []),
      comps.syntaxHighlightComp.reconfigure(
        mode === MODE_SOURCE ? syntaxHighlighting(defaultHighlightStyle) : []
      ),
      comps.lineWrappingComp.reconfigure(mode === MODE_SOURCE ? [] : EditorView.lineWrapping),
    ],
  });
  restoreModeSwitchState(view, snap);
}

module.exports = {
  MODE_PREVIEW: MODE_PREVIEW,
  MODE_SOURCE: MODE_SOURCE,
  createModeCompartments: createModeCompartments,
  extensionsForMode: extensionsForMode,
  reconfigureMode: reconfigureMode,
};

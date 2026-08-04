/**
 * 大纲跳转：目标行短暂高亮（Decoration.line）。
 */
'use strict';

const { StateEffect, StateField } = require('@codemirror/state');
const { Decoration, EditorView } = require('@codemirror/view');

/** @type {import('@codemirror/state').StateEffectType<number|null>} 1-based 行号；null 清除 */
const setFlashLine = StateEffect.define();

const flashField = StateField.define({
  create: function () {
    return Decoration.none;
  },
  update: function (deco, tr) {
    deco = deco.map(tr.changes);
    for (var i = 0; i < tr.effects.length; i++) {
      var e = tr.effects[i];
      if (!e.is(setFlashLine)) continue;
      if (e.value == null) {
        deco = Decoration.none;
      } else {
        var n = e.value | 0;
        if (n < 1 || n > tr.state.doc.lines) {
          deco = Decoration.none;
        } else {
          var line = tr.state.doc.line(n);
          deco = Decoration.set([
            Decoration.line({ class: 'mda-cm-outline-flash' }).range(line.from),
          ]);
        }
      }
    }
    return deco;
  },
  provide: function (f) {
    return EditorView.decorations.from(f);
  },
});

/**
 * @returns {import('@codemirror/state').Extension}
 */
function outlineFlashExtension() {
  return flashField;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} line1Based
 * @param {number} [ms]
 * @param {{ clearTimer?: function, setTimer?: function(any): void }} [hooks]
 */
function flashOutlineLine(view, line1Based, ms, hooks) {
  var duration = ms == null ? 200 : ms;
  if (hooks && typeof hooks.clearTimer === 'function') hooks.clearTimer();
  view.dispatch({ effects: setFlashLine.of(line1Based) });
  var tid = setTimeout(function () {
    try {
      view.dispatch({ effects: setFlashLine.of(null) });
    } catch (_) {
      /* view 已销毁 */
    }
    if (hooks && typeof hooks.setTimer === 'function') hooks.setTimer(null);
  }, duration);
  if (hooks && typeof hooks.setTimer === 'function') hooks.setTimer(tid);
}

module.exports = {
  outlineFlashExtension: outlineFlashExtension,
  flashOutlineLine: flashOutlineLine,
  setFlashLine: setFlashLine,
};

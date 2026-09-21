/**
 * 查找匹配高亮（Decoration.mark）。
 */
'use strict';

const { StateEffect, StateField } = require('@codemirror/state');
const { Decoration, EditorView } = require('@codemirror/view');

/** @type {import('@codemirror/state').StateEffectType<{ matches: {start:number,end:number}[], activeIndex: number } | null>} */
const setFindHighlights = StateEffect.define();

const findHighlightField = StateField.define({
  create: function () {
    return Decoration.none;
  },
  update: function (deco, tr) {
    deco = deco.map(tr.changes);
    for (var i = 0; i < tr.effects.length; i++) {
      var e = tr.effects[i];
      if (!e.is(setFindHighlights)) continue;
      var payload = e.value;
      if (!payload || !payload.matches || !payload.matches.length) {
        deco = Decoration.none;
      } else {
        var marks = [];
        for (var j = 0; j < payload.matches.length; j++) {
          var m = payload.matches[j];
          if (m.end <= m.start) continue;
          var cls = j === payload.activeIndex ? 'mda-cm-find-active' : 'mda-cm-find-mark';
          marks.push(Decoration.mark({ class: cls }).range(m.start, m.end));
        }
        deco = marks.length ? Decoration.set(marks, true) : Decoration.none;
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
function findHighlightExtension() {
  return findHighlightField;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ start: number, end: number }[]} matches
 * @param {number} activeIndex
 * @param {{ from: number, to: number }[]} [tableRanges]
 */
function applyFindHighlights(view, matches, activeIndex, tableRanges) {
  var payload = null;
  if (matches && matches.length) {
    var docMatches = matches;
    var docActive = activeIndex == null ? -1 : activeIndex;
    if (tableRanges && tableRanges.length) {
      docMatches = [];
      docActive = -1;
      for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var inTable = false;
        for (var t = 0; t < tableRanges.length; t++) {
          var r = tableRanges[t];
          if (m.end > r.from && m.start < r.to) {
            inTable = true;
            break;
          }
        }
        if (inTable) continue;
        if (i === activeIndex) docActive = docMatches.length;
        docMatches.push(m);
      }
    }
    if (docMatches.length) {
      payload = { matches: docMatches, activeIndex: docActive };
    }
  }
  view.dispatch({ effects: setFindHighlights.of(payload) });
}

module.exports = {
  findHighlightExtension: findHighlightExtension,
  applyFindHighlights: applyFindHighlights,
  setFindHighlights: setFindHighlights,
};

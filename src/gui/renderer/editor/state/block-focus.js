/**
 * M8-C1 表格 v1：聚焦块时显露源码（D14 第一轮）。
 */
'use strict';

const { StateField, StateEffect } = require('@codemirror/state');

/** @typedef {{ from: number, to: number, kind?: string } | null} BlockFocus */

const setBlockFocusEffect = StateEffect.define();

function createBlockFocusField() {
  return StateField.define({
    create: function () {
      return null;
    },
    update: function (value, tr) {
      for (let i = 0; i < tr.effects.length; i++) {
        const e = tr.effects[i];
        if (e.is(setBlockFocusEffect)) return e.value;
      }
      if (!value || !tr.docChanged) return value;
      const from = tr.changes.mapPos(value.from, 1);
      const to = tr.changes.mapPos(value.to, -1);
      if (from >= to) return null;
      return { from: from, to: to, kind: value.kind };
    },
  });
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {BlockFocus} block
 */
function setBlockFocus(view, block) {
  view.dispatch({ effects: setBlockFocusEffect.of(block) });
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {import('@codemirror/state').StateField<BlockFocus>} field
 * @returns {BlockFocus}
 */
function readBlockFocus(state, field) {
  try {
    return state.field(field);
  } catch (_) {
    return null;
  }
}

module.exports = {
  setBlockFocusEffect: setBlockFocusEffect,
  createBlockFocusField: createBlockFocusField,
  setBlockFocus: setBlockFocus,
  readBlockFocus: readBlockFocus,
};

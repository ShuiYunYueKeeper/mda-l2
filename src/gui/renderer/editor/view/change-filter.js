/**
 * S18–S21：只读区间 changeFilter。
 */
'use strict';

const { EditorState } = require('@codemirror/state');

/**
 * @param {(state: import('@codemirror/state').EditorState) => { from: number, to: number }[]} getRanges
 * @param {() => void} [onBlocked]
 */
function createReadonlyChangeFilter(getRanges, onBlocked) {
  return EditorState.changeFilter.of(function (tr) {
    if (!tr.docChanged) return true;
    const ranges = typeof getRanges === 'function' ? getRanges(tr.startState) : [];
    if (!ranges.length) return true;
    let blocked = false;
    tr.changes.iterChanges(function (fromA, toA) {
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        if (fromA < r.to && toA > r.from) blocked = true;
      }
    });
    if (blocked && typeof onBlocked === 'function') {
      try {
        onBlocked();
      } catch (_) {
        /* ignore */
      }
    }
    return !blocked;
  });
}

module.exports = {
  createReadonlyChangeFilter: createReadonlyChangeFilter,
};

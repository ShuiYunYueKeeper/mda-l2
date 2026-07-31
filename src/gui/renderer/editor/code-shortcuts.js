/**
 * M8-C4：围栏代码块快捷键（Delete / Backspace 删除选中块）。
 */
'use strict';

const { keymap, EditorView } = require('@codemirror/view');
const { Prec } = require('@codemirror/state');
const { getSelectedCodeBlock } = require('./widgets/code-selection');

let globalKeysInstalled = false;

/**
 * @param {KeyboardEvent} event
 * @param {{ onDeleteCodeBlock?: Function }} opts
 * @returns {boolean}
 */
function tryDeleteSelectedCodeBlock(event, opts) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
  const block = getSelectedCodeBlock();
  if (!block || typeof opts.onDeleteCodeBlock !== 'function') return false;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return false;
  if (ae && ae.closest && ae.closest('.mda-cm-code-input')) return false;
  if (ae && ae.closest && ae.closest('#settings-dialog, #find-replace-bar')) return false;
  event.preventDefault();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();
  opts.onDeleteCodeBlock(block);
  return true;
}

/**
 * @param {{ onDeleteCodeBlock?: Function }} opts
 */
function installCodeGlobalKeys(opts) {
  if (globalKeysInstalled || typeof window === 'undefined') return;
  globalKeysInstalled = true;
  window.addEventListener(
    'keydown',
    function (e) {
      tryDeleteSelectedCodeBlock(e, opts);
    },
    true
  );
}

/**
 * @param {{ onDeleteCodeBlock?: Function }} opts
 */
function createCodeShortcutKeymap(opts) {
  installCodeGlobalKeys(opts);
  return Prec.high(
    keymap.of([
      {
        key: 'Delete',
        run: function () {
          const block = getSelectedCodeBlock();
          if (!block || typeof opts.onDeleteCodeBlock !== 'function') return false;
          opts.onDeleteCodeBlock(block);
          return true;
        },
      },
      {
        key: 'Backspace',
        run: function () {
          const block = getSelectedCodeBlock();
          if (!block || typeof opts.onDeleteCodeBlock !== 'function') return false;
          opts.onDeleteCodeBlock(block);
          return true;
        },
      },
    ])
  );
}

/**
 * @param {{ onDeleteCodeBlock?: Function }} opts
 */
function createCodeKeydownHandler(opts) {
  return EditorView.domEventHandlers({
    keydown: function (event) {
      return tryDeleteSelectedCodeBlock(event, opts);
    },
  });
}

module.exports = {
  tryDeleteSelectedCodeBlock: tryDeleteSelectedCodeBlock,
  createCodeShortcutKeymap: createCodeShortcutKeymap,
  createCodeKeydownHandler: createCodeKeydownHandler,
};

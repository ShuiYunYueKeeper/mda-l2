/**
 * M8-C2：Mermaid 块快捷键（Delete / Backspace 删除选中块）。
 */
'use strict';

const { keymap, EditorView } = require('@codemirror/view');
const { Prec } = require('@codemirror/state');
const { getSelectedMermaidBlock } = require('./widgets/mermaid-selection');

let globalKeysInstalled = false;

/**
 * @param {KeyboardEvent} event
 * @param {{ onDeleteMermaidBlock?: Function }} opts
 * @returns {boolean}
 */
function tryDeleteSelectedMermaidBlock(event, opts) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
  const block = getSelectedMermaidBlock();
  if (!block || typeof opts.onDeleteMermaidBlock !== 'function') return false;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return false;
  if (ae && ae.closest && ae.closest('.mda-cm-mermaid-source-input')) return false;
  if (ae && ae.closest && ae.closest('#settings-dialog, #find-replace-bar')) return false;
  event.preventDefault();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();
  opts.onDeleteMermaidBlock(block);
  return true;
}

/**
 * @param {{ onDeleteMermaidBlock?: Function }} opts
 */
function installMermaidGlobalKeys(opts) {
  if (globalKeysInstalled || typeof window === 'undefined') return;
  globalKeysInstalled = true;
  window.addEventListener(
    'keydown',
    function (e) {
      tryDeleteSelectedMermaidBlock(e, opts);
    },
    true
  );
}

/**
 * @param {{ onDeleteMermaidBlock?: Function }} opts
 */
function createMermaidShortcutKeymap(opts) {
  installMermaidGlobalKeys(opts);
  return Prec.high(
    keymap.of([
      {
        key: 'Delete',
        run: function () {
          const block = getSelectedMermaidBlock();
          if (!block || typeof opts.onDeleteMermaidBlock !== 'function') return false;
          opts.onDeleteMermaidBlock(block);
          return true;
        },
      },
      {
        key: 'Backspace',
        run: function () {
          const block = getSelectedMermaidBlock();
          if (!block || typeof opts.onDeleteMermaidBlock !== 'function') return false;
          opts.onDeleteMermaidBlock(block);
          return true;
        },
      },
    ])
  );
}

/**
 * @param {{ onDeleteMermaidBlock?: Function }} opts
 */
function createMermaidKeydownHandler(opts) {
  return EditorView.domEventHandlers({
    keydown: function (event) {
      return tryDeleteSelectedMermaidBlock(event, opts);
    },
  });
}

module.exports = {
  tryDeleteSelectedMermaidBlock: tryDeleteSelectedMermaidBlock,
  createMermaidShortcutKeymap: createMermaidShortcutKeymap,
  createMermaidKeydownHandler: createMermaidKeydownHandler,
};

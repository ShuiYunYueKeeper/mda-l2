/**
 * M8-C4：围栏代码块快捷键（Delete / Backspace 删除；Mod-c 复制源码）。
 */
'use strict';

const { keymap, EditorView } = require('@codemirror/view');
const { Prec } = require('@codemirror/state');
const { getSelectedCodeBlock } = require('./widgets/code-selection');
const { copyText } = require('./widgets/widget-common');

let globalKeysInstalled = false;

/**
 * @returns {boolean}
 */
function focusInCodeInput() {
  const ae = typeof document !== 'undefined' ? document.activeElement : null;
  return !!(ae && ae.closest && ae.closest('.mda-cm-code-input'));
}

/**
 * @returns {boolean}
 */
function hasDomTextSelection() {
  const sel = typeof window !== 'undefined' && window.getSelection && window.getSelection();
  return !!(sel && !sel.isCollapsed && String(sel.toString() || '').length > 0);
}

/**
 * @param {{ from?: number, to?: number, source?: string }} block
 * @param {{ copyText?: Function }} opts
 * @returns {boolean}
 */
function copySelectedCodeSource(block, opts) {
  if (!block) return false;
  const text = block.source != null ? String(block.source) : '';
  if (!text) return false;
  copyText(text, opts && opts.copyText);
  return true;
}

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
  if (focusInCodeInput()) return false;
  if (ae && ae.closest && ae.closest('#settings-dialog, #find-replace-bar')) return false;
  event.preventDefault();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();
  opts.onDeleteCodeBlock(block);
  return true;
}

/**
 * 选中代码块时 Ctrl/Cmd+C 复制围栏源码（避免空选区沿用剪贴板旧内容）。
 * @param {KeyboardEvent} event
 * @param {{ copyText?: Function, onCopyCodeBlock?: Function }} opts
 * @returns {boolean}
 */
function tryCopySelectedCodeBlock(event, opts) {
  const key = (event.key || '').toLowerCase();
  if (key !== 'c' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    return false;
  }
  if (focusInCodeInput() && hasDomTextSelection()) return false;
  const block = getSelectedCodeBlock();
  if (!block) return false;
  const ae = document.activeElement;
  if (ae && ae.closest && ae.closest('#settings-dialog, #find-replace-bar')) return false;

  if (typeof opts.onCopyCodeBlock === 'function') {
    event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    opts.onCopyCodeBlock(block);
    return true;
  }
  if (!copySelectedCodeSource(block, opts)) return false;
  event.preventDefault();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();
  return true;
}

/**
 * @param {{ onDeleteCodeBlock?: Function, copyText?: Function, onCopyCodeBlock?: Function }} opts
 */
function installCodeGlobalKeys(opts) {
  if (globalKeysInstalled || typeof window === 'undefined') return;
  globalKeysInstalled = true;
  window.addEventListener(
    'keydown',
    function (e) {
      if (tryDeleteSelectedCodeBlock(e, opts)) return;
      tryCopySelectedCodeBlock(e, opts);
    },
    true
  );
}

/**
 * @param {{ onDeleteCodeBlock?: Function, copyText?: Function, onCopyCodeBlock?: Function }} opts
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
      {
        key: 'Mod-c',
        run: function () {
          if (focusInCodeInput() && hasDomTextSelection()) return false;
          const block = getSelectedCodeBlock();
          if (!block) return false;
          if (typeof opts.onCopyCodeBlock === 'function') {
            opts.onCopyCodeBlock(block);
            return true;
          }
          return copySelectedCodeSource(block, opts);
        },
      },
    ])
  );
}

/**
 * @param {{ onDeleteCodeBlock?: Function, copyText?: Function, onCopyCodeBlock?: Function }} opts
 */
function createCodeKeydownHandler(opts) {
  return EditorView.domEventHandlers({
    keydown: function (event) {
      if (tryDeleteSelectedCodeBlock(event, opts)) return true;
      return tryCopySelectedCodeBlock(event, opts);
    },
  });
}

module.exports = {
  tryDeleteSelectedCodeBlock: tryDeleteSelectedCodeBlock,
  tryCopySelectedCodeBlock: tryCopySelectedCodeBlock,
  copySelectedCodeSource: copySelectedCodeSource,
  createCodeShortcutKeymap: createCodeShortcutKeymap,
  createCodeKeydownHandler: createCodeKeydownHandler,
};

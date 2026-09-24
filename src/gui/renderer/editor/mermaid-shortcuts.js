/**
 * M8-C2：Mermaid 块快捷键（Delete / Backspace 删除；Mod-c 复制源码）。
 */
'use strict';

const { keymap, EditorView } = require('@codemirror/view');
const { Prec } = require('@codemirror/state');
const { getSelectedMermaidBlock } = require('./widgets/mermaid-selection');
const { copyText } = require('./widgets/widget-common');

let globalKeysInstalled = false;

/**
 * @returns {boolean}
 */
function focusInMermaidSource() {
  const ae = typeof document !== 'undefined' ? document.activeElement : null;
  return !!(ae && ae.closest && ae.closest('.mda-cm-mermaid-source-input'));
}

/**
 * @returns {boolean}
 */
function hasDomTextSelection() {
  const sel = typeof window !== 'undefined' && window.getSelection && window.getSelection();
  return !!(sel && !sel.isCollapsed && String(sel.toString() || '').length > 0);
}

/**
 * @param {{ from?: number, to?: number, source?: string, code?: string }} block
 * @param {{ copyText?: Function }} opts
 * @returns {boolean}
 */
function copySelectedMermaidSource(block, opts) {
  if (!block) return false;
  const text = block.source != null ? String(block.source) : '';
  if (!text) return false;
  copyText(text, opts && opts.copyText);
  return true;
}

/**
 * @param {KeyboardEvent} event
 * @param {{ onDeleteMermaidBlock?: Function, copyText?: Function, onCopyMermaidBlock?: Function }} opts
 * @returns {boolean}
 */
function tryDeleteSelectedMermaidBlock(event, opts) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
  const block = getSelectedMermaidBlock();
  if (!block || typeof opts.onDeleteMermaidBlock !== 'function') return false;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return false;
  if (focusInMermaidSource()) return false;
  if (ae && ae.closest && ae.closest('#settings-dialog, #find-replace-bar')) return false;
  event.preventDefault();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();
  opts.onDeleteMermaidBlock(block);
  return true;
}

/**
 * 选中流程图块时 Ctrl/Cmd+C 复制围栏源码（避免空选区时剪贴板仍是旧内容）。
 * @param {KeyboardEvent} event
 * @param {{ copyText?: Function, onCopyMermaidBlock?: Function }} opts
 * @returns {boolean}
 */
function tryCopySelectedMermaidBlock(event, opts) {
  const key = (event.key || '').toLowerCase();
  if (key !== 'c' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    return false;
  }
  // 源码框内有拖选时交给原生复制
  if (focusInMermaidSource() && hasDomTextSelection()) return false;
  const block = getSelectedMermaidBlock();
  if (!block) return false;
  const ae = document.activeElement;
  if (ae && ae.closest && ae.closest('#settings-dialog, #find-replace-bar')) return false;

  if (typeof opts.onCopyMermaidBlock === 'function') {
    event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    opts.onCopyMermaidBlock(block);
    return true;
  }
  if (!copySelectedMermaidSource(block, opts)) return false;
  event.preventDefault();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();
  return true;
}

/**
 * @param {{ onDeleteMermaidBlock?: Function, copyText?: Function, onCopyMermaidBlock?: Function }} opts
 */
function installMermaidGlobalKeys(opts) {
  if (globalKeysInstalled || typeof window === 'undefined') return;
  globalKeysInstalled = true;
  window.addEventListener(
    'keydown',
    function (e) {
      if (tryDeleteSelectedMermaidBlock(e, opts)) return;
      tryCopySelectedMermaidBlock(e, opts);
    },
    true
  );
}

/**
 * @param {{ onDeleteMermaidBlock?: Function, copyText?: Function, onCopyMermaidBlock?: Function }} opts
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
      {
        key: 'Mod-c',
        run: function () {
          if (focusInMermaidSource() && hasDomTextSelection()) return false;
          const block = getSelectedMermaidBlock();
          if (!block) return false;
          if (typeof opts.onCopyMermaidBlock === 'function') {
            opts.onCopyMermaidBlock(block);
            return true;
          }
          return copySelectedMermaidSource(block, opts);
        },
      },
    ])
  );
}

/**
 * @param {{ onDeleteMermaidBlock?: Function, copyText?: Function, onCopyMermaidBlock?: Function }} opts
 */
function createMermaidKeydownHandler(opts) {
  return EditorView.domEventHandlers({
    keydown: function (event) {
      if (tryDeleteSelectedMermaidBlock(event, opts)) return true;
      return tryCopySelectedMermaidBlock(event, opts);
    },
  });
}

module.exports = {
  tryDeleteSelectedMermaidBlock: tryDeleteSelectedMermaidBlock,
  tryCopySelectedMermaidBlock: tryCopySelectedMermaidBlock,
  copySelectedMermaidSource: copySelectedMermaidSource,
  createMermaidShortcutKeymap: createMermaidShortcutKeymap,
  createMermaidKeydownHandler: createMermaidKeydownHandler,
};

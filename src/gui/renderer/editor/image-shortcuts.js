/**
 * M8-C1：图片块快捷键（Delete / Ctrl+V 粘贴截图）。
 */
'use strict';

const { keymap, EditorView } = require('@codemirror/view');
const { Prec } = require('@codemirror/state');
const { getSelectedImageBlock } = require('./widgets/image-selection');

let globalKeysInstalled = false;

/**
 * @param {{ onDeleteImageBlock?: Function, onPasteImageBlock?: Function }} opts
 */
function installImageGlobalKeys(opts) {
  if (globalKeysInstalled || typeof window === 'undefined') return;
  globalKeysInstalled = true;
  window.addEventListener(
    'keydown',
    function (e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const block = getSelectedImageBlock();
      if (!block || typeof opts.onDeleteImageBlock !== 'function') return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (ae && ae.closest && ae.closest('#settings-dialog, #find-replace-bar')) return;
      e.preventDefault();
      e.stopPropagation();
      opts.onDeleteImageBlock(block);
    },
    true
  );
}

/**
 * @param {{ onDeleteImageBlock?: Function, onPasteImageBlock?: Function }} opts
 */
function createImageShortcutKeymap(opts) {
  installImageGlobalKeys(opts);
  return Prec.high(
    keymap.of([
      {
        key: 'Delete',
        run: function () {
          const block = getSelectedImageBlock();
          if (!block || typeof opts.onDeleteImageBlock !== 'function') return false;
          opts.onDeleteImageBlock(block);
          return true;
        },
      },
      {
        key: 'Backspace',
        run: function () {
          const block = getSelectedImageBlock();
          if (!block || typeof opts.onDeleteImageBlock !== 'function') return false;
          opts.onDeleteImageBlock(block);
          return true;
        },
      },
      {
        key: 'Mod-v',
        run: function () {
          if (typeof opts.onPasteImageBlock !== 'function') return false;
          const block = getSelectedImageBlock();
          if (!block) return false;
          opts.onPasteImageBlock(block);
          return true;
        },
      },
    ])
  );
}

/**
 * @param {ClipboardEvent} event
 */
function clipboardHasImage(event) {
  const items = event && event.clipboardData && event.clipboardData.items;
  if (!items) return false;
  for (let i = 0; i < items.length; i++) {
    const type = items[i].type || '';
    if (type.indexOf('image/') === 0) return true;
  }
  return false;
}

/**
 * @param {{ onPasteImageBlock?: Function, onInsertImageAt?: Function }} opts
 */
function createImagePasteHandler(opts) {
  return function (event, view) {
    if (!event || !view) return false;
    const block = getSelectedImageBlock();
    if (block) {
      if (typeof opts.onPasteImageBlock !== 'function') return false;
      event.preventDefault();
      opts.onPasteImageBlock(block);
      return true;
    }
    if (!clipboardHasImage(event)) return false;
    const data = event.clipboardData;
    const plain = data && data.getData ? data.getData('text/plain') : '';
    if (plain && String(plain).length > 0) return false;
    if (typeof opts.onInsertImageAt !== 'function') return false;
    event.preventDefault();
    opts.onInsertImageAt(view.state.selection.main.head);
    return true;
  };
}

/**
 * @param {{ onDeleteImageBlock?: Function }} opts
 */
function createImageKeydownHandler(opts) {
  return EditorView.domEventHandlers({
    keydown: function (event) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
      const block = getSelectedImageBlock();
      if (!block || typeof opts.onDeleteImageBlock !== 'function') return false;
      event.preventDefault();
      opts.onDeleteImageBlock(block);
      return true;
    },
  });
}

module.exports = {
  installImageGlobalKeys: installImageGlobalKeys,
  createImageShortcutKeymap: createImageShortcutKeymap,
  createImagePasteHandler: createImagePasteHandler,
  createImageKeydownHandler: createImageKeydownHandler,
};

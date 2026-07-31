/**
 * M8-C1：块 widget 共用工具（顶栏、复制、i18n）。
 */
'use strict';

/**
 * @param {string} key
 * @param {(k: string, vars?: object) => string} [t]
 */
function uiT(key, t, vars) {
  if (typeof t === 'function') return t(key, vars);
  return key;
}

/**
 * @param {string} text
 * @param {(text: string) => void} [copyFn]
 */
function copyText(text, copyFn) {
  const s = text == null ? '' : String(text);
  if (typeof copyFn === 'function') {
    copyFn(s);
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(s).catch(function () { /* ignore */ });
  }
}

/**
 * @param {HTMLElement} root
 * @param {{ label?: string, buttons?: { id: string, label: string, title?: string }[] }} spec
 */
function createBlockToolbar(root, spec) {
  const bar = document.createElement('div');
  bar.className = 'mda-cm-block-toolbar';
  if (spec.label) {
    const lab = document.createElement('span');
    lab.className = 'mda-cm-block-toolbar-label';
    lab.textContent = spec.label;
    bar.appendChild(lab);
  }
  const actions = document.createElement('div');
  actions.className = 'mda-cm-block-toolbar-actions';
  const buttons = spec.buttons || [];
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mda-cm-block-toolbar-btn';
    btn.dataset.action = b.id;
    btn.textContent = b.label;
    if (b.title) btn.title = b.title;
    actions.appendChild(btn);
  }
  bar.appendChild(actions);
  root.appendChild(bar);
  return bar;
}

/**
 * @param {HTMLElement} container
 * @param {string} selectedClass
 */
function clearMediaSelection(container, selectedClass) {
  if (!container) return;
  const sel = selectedClass || 'mda-cm-media-selected';
  const nodes = container.querySelectorAll('.' + sel);
  for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove(sel);
}

module.exports = {
  uiT: uiT,
  copyText: copyText,
  createBlockToolbar: createBlockToolbar,
  clearMediaSelection: clearMediaSelection,
};

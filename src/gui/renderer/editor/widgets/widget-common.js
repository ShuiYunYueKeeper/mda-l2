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
 * @param {{ label?: string, labelKey?: string, t?: Function, buttons?: { id: string, label?: string, title?: string, i18nKey?: string, i18nToggle?: string }[] }} spec
 */
function createBlockToolbar(root, spec) {
  const t = spec.t;
  const bar = document.createElement('div');
  bar.className = 'mda-cm-block-toolbar';
  if (spec.labelKey) {
    const lab = document.createElement('span');
    lab.className = 'mda-cm-block-toolbar-label';
    lab.dataset.i18nKey = spec.labelKey;
    lab.textContent = uiT(spec.labelKey, t);
    bar.appendChild(lab);
  } else if (spec.label) {
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
    if (b.i18nKey) {
      btn.dataset.i18nKey = b.i18nKey;
      if (b.i18nToggle) btn.dataset.i18nToggle = b.i18nToggle;
      const label = uiT(b.i18nKey, t);
      btn.textContent = label;
      btn.title = label;
    } else {
      btn.textContent = b.label || '';
      if (b.title) btn.title = b.title;
    }
    actions.appendChild(btn);
  }
  bar.appendChild(actions);
  root.appendChild(bar);
  return bar;
}

/**
 * 界面语言切换后刷新块 widget 顶栏与 title（不重建 widget）。
 * @param {HTMLElement | Document} root
 * @param {(key: string, vars?: object) => string} t
 */
function refreshBlockToolbars(root, t) {
  if (!root || typeof t !== 'function') return;
  const host = root.querySelectorAll ? root : document.body;

  host.querySelectorAll('.mda-cm-block-toolbar-label[data-i18n-key]').forEach(function (el) {
    const key = el.getAttribute('data-i18n-key');
    if (key) el.textContent = t(key);
  });

  host.querySelectorAll('.mda-cm-block-toolbar-btn[data-i18n-key]').forEach(function (btn) {
    let key = btn.getAttribute('data-i18n-key');
    if (btn.getAttribute('data-i18n-toggle') === 'mermaid-source') {
      const frame = btn.closest('.mda-cm-mermaid-frame');
      key =
        frame && frame.classList.contains('mda-cm-mermaid-source-mode')
          ? 'widgetMermaidPreview'
          : 'widgetCodeSource';
    }
    if (!key) return;
    const label = t(key);
    btn.textContent = label;
    btn.title = label;
  });

  host.querySelectorAll('[data-i18n-title]').forEach(function (el) {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });

  host.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });

  host.querySelectorAll('.mda-cm-table-add-btn[data-i18n-title]').forEach(function (btn) {
    const key = btn.getAttribute('data-i18n-title');
    if (key) btn.title = t(key);
  });

  host.querySelectorAll('.mda-cm-table-menu-item[data-i18n-key]').forEach(function (btn) {
    const key = btn.getAttribute('data-i18n-key');
    if (key) btn.textContent = t(key);
  });
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

/**
 * @param {HTMLElement | Document} container
 */
function clearBlockWidgetSelection(container) {
  if (!container || !container.querySelectorAll) return;
  const nodes = container.querySelectorAll('.mda-cm-block-selected');
  for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove('mda-cm-block-selected');
}

module.exports = {
  uiT: uiT,
  copyText: copyText,
  createBlockToolbar: createBlockToolbar,
  refreshBlockToolbars: refreshBlockToolbars,
  clearMediaSelection: clearMediaSelection,
  clearBlockWidgetSelection: clearBlockWidgetSelection,
};

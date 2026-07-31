/**
 * M8-C4：围栏代码块语言切换（可搜索下拉，参照竞品）。
 */
'use strict';

const { uiT } = require('./widget-common');
const {
  CODE_BLOCK_LANGUAGES,
  normalizeCodeBlockLang,
  getCodeLangLabel,
  filterCodeLanguages,
} = require('./code-languages');

let openPickerClose = null;

/**
 * @param {{ lang?: string, t?: Function, onChange?: (lang: string) => void }} opts
 */
function createCodeLangPicker(opts) {
  const t = opts.t;
  let currentLang = normalizeCodeBlockLang(opts.lang);
  const root = document.createElement('div');
  root.className = 'mda-cm-code-lang-picker';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'mda-cm-code-lang-trigger';
  trigger.setAttribute('data-i18n-title', 'widgetCodeLangSwitch');
  trigger.title = uiT('widgetCodeLangSwitch', t);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'mda-cm-code-lang-trigger-label';
  const triggerChevron = document.createElement('span');
  triggerChevron.className = 'mda-cm-code-lang-trigger-chevron';
  triggerChevron.setAttribute('aria-hidden', 'true');
  triggerChevron.textContent = '▾';
  trigger.appendChild(triggerLabel);
  trigger.appendChild(triggerChevron);

  const panel = document.createElement('div');
  panel.className = 'mda-cm-code-lang-panel';
  panel.hidden = true;

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'mda-cm-code-lang-search';
  search.setAttribute('data-i18n-placeholder', 'widgetCodeLangSearch');
  search.placeholder = uiT('widgetCodeLangSearch', t);
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('spellcheck', 'false');

  const list = document.createElement('div');
  list.className = 'mda-cm-code-lang-list';
  list.setAttribute('role', 'listbox');

  panel.appendChild(search);
  panel.appendChild(list);
  root.appendChild(trigger);
  root.appendChild(panel);

  function setTriggerLabel() {
    triggerLabel.textContent = getCodeLangLabel(currentLang, t);
  }

  function renderList() {
    const items = filterCodeLanguages(search.value);
    list.textContent = '';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mda-cm-code-lang-option';
      btn.setAttribute('role', 'option');
      btn.dataset.lang = item.id;
      const lab = document.createElement('span');
      lab.className = 'mda-cm-code-lang-option-label';
      lab.textContent = item.id ? item.label : uiT('widgetCodeLangPlain', t);
      btn.appendChild(lab);
      if (item.id === currentLang) {
        btn.classList.add('mda-cm-code-lang-option-active');
        const mark = document.createElement('span');
        mark.className = 'mda-cm-code-lang-option-check';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '✓';
        btn.appendChild(mark);
      }
      list.appendChild(btn);
    }
  }

  function closePanel() {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    root.classList.remove('mda-cm-code-lang-open');
    search.value = '';
    if (openPickerClose === closePanel) openPickerClose = null;
    document.removeEventListener('mousedown', onDocPointer, true);
  }

  function openPanel() {
    if (typeof openPickerClose === 'function' && openPickerClose !== closePanel) {
      openPickerClose();
    }
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    root.classList.add('mda-cm-code-lang-open');
    renderList();
    openPickerClose = closePanel;
    document.addEventListener('mousedown', onDocPointer, true);
    requestAnimationFrame(function () {
      search.focus();
      search.select();
    });
  }

  function onDocPointer(e) {
    if (!root.contains(/** @type {Node} */ (e.target))) closePanel();
  }

  function pickLang(next) {
    const normalized = normalizeCodeBlockLang(next);
    if (normalized === currentLang) {
      closePanel();
      return;
    }
    currentLang = normalized;
    setTriggerLabel();
    closePanel();
    if (typeof opts.onChange === 'function') opts.onChange(currentLang);
  }

  setTriggerLabel();
  renderList();

  trigger.addEventListener('mousedown', function (e) {
    e.stopPropagation();
  });
  trigger.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (panel.hidden) openPanel();
    else closePanel();
  });

  search.addEventListener('mousedown', function (e) {
    e.stopPropagation();
  });
  search.addEventListener('input', function () {
    renderList();
  });
  search.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
      trigger.focus();
    }
  });

  list.addEventListener('mousedown', function (e) {
    e.stopPropagation();
  });
  list.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest ? e.target.closest('.mda-cm-code-lang-option') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    pickLang(btn.getAttribute('data-lang') || '');
  });

  root.refreshLang = function (lang) {
    currentLang = normalizeCodeBlockLang(lang);
    setTriggerLabel();
    renderList();
  };

  root.closePanel = closePanel;

  return root;
}

module.exports = {
  createCodeLangPicker: createCodeLangPicker,
  CODE_BLOCK_LANGUAGES: CODE_BLOCK_LANGUAGES,
};

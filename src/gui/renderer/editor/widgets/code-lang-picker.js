/**
 * M8-C4：围栏代码块语言切换（对齐竞品三态）。
 * - 未打开：仅「语言名 + ▾」，中灰，间距 8px，无编辑框
 * - hover：浅底圆角（竞品 hover）
 * - 打开：蓝框输入框，底层 placeholder 显示当前语言（浅灰）；输入过滤列表
 * - 列表面板挂 document.body（fixed），避免工具栏 overflow 裁切
 */
'use strict';

const { uiT } = require('./widget-common');
const {
  normalizeCodeBlockLang,
  getCodeLangLabel,
  filterCodeLanguages,
} = require('./code-languages');

/** @type {(() => void) | null} */
let openPickerClose = null;

/**
 * @param {{ lang?: string, t?: Function, onChange?: (lang: string) => void }} opts
 */
function createCodeLangPicker(opts) {
  const t = opts.t;
  let currentLang = normalizeCodeBlockLang(opts.lang);
  const root = document.createElement('div');
  root.className = 'mda-cm-code-lang-picker';

  // —— 未打开：语言名 + 箭头（紧凑）——
  const idle = document.createElement('button');
  idle.type = 'button';
  idle.className = 'mda-cm-code-lang-idle';
  idle.setAttribute('data-i18n-title', 'widgetCodeLangSwitch');
  idle.title = uiT('widgetCodeLangSwitch', t);
  idle.setAttribute('aria-haspopup', 'listbox');
  idle.setAttribute('aria-expanded', 'false');

  const idleLabel = document.createElement('span');
  idleLabel.className = 'mda-cm-code-lang-idle-label';

  const idleChevron = document.createElement('span');
  idleChevron.className = 'mda-cm-code-lang-idle-chevron';
  idleChevron.setAttribute('aria-hidden', 'true');
  idleChevron.textContent = '▾';

  idle.appendChild(idleLabel);
  idle.appendChild(idleChevron);

  // —— 打开：编辑框 + 箭头 ——
  const editor = document.createElement('div');
  editor.className = 'mda-cm-code-lang-editor';
  editor.hidden = true;

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'mda-cm-code-lang-search';
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('spellcheck', 'false');
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-haspopup', 'listbox');
  search.setAttribute('data-i18n-title', 'widgetCodeLangSwitch');
  search.title = uiT('widgetCodeLangSwitch', t);

  const editorChevron = document.createElement('button');
  editorChevron.type = 'button';
  editorChevron.className = 'mda-cm-code-lang-editor-chevron';
  editorChevron.setAttribute('aria-hidden', 'true');
  editorChevron.tabIndex = -1;
  editorChevron.textContent = '▾';

  editor.appendChild(search);
  editor.appendChild(editorChevron);

  root.appendChild(idle);
  root.appendChild(editor);

  const panel = document.createElement('div');
  panel.className = 'mda-cm-code-lang-panel';
  panel.hidden = true;
  const list = document.createElement('div');
  list.className = 'mda-cm-code-lang-list';
  list.setAttribute('role', 'listbox');
  panel.appendChild(list);

  let panelOpen = false;

  function currentLabel() {
    return getCodeLangLabel(currentLang, t);
  }

  function syncIdle() {
    idleLabel.textContent = currentLabel();
  }

  function renderList() {
    const items = filterCodeLanguages(search.value);
    list.textContent = '';
    let activeEl = null;
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
        btn.setAttribute('aria-selected', 'true');
        const mark = document.createElement('span');
        mark.className = 'mda-cm-code-lang-option-check';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '✓';
        btn.appendChild(mark);
        activeEl = btn;
      } else {
        btn.setAttribute('aria-selected', 'false');
      }
      list.appendChild(btn);
    }
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function placePanel() {
    if (!panel.parentNode) document.body.appendChild(panel);
    const anchor = editor.hidden ? idle : editor;
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    const width = Math.max(rect.width, 180);
    let left = rect.left;
    let top = rect.bottom + 4;
    panel.style.width = width + 'px';
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.hidden = false;
    if (left + width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - width - pad);
      panel.style.left = left + 'px';
    }
    if (top + panel.offsetHeight > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - panel.offsetHeight - 4);
      panel.style.top = top + 'px';
    }
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panel.hidden = true;
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    root.classList.remove('mda-cm-code-lang-open');
    idle.hidden = false;
    idle.setAttribute('aria-expanded', 'false');
    editor.hidden = true;
    search.value = '';
    syncIdle();
    if (openPickerClose === closePanel) openPickerClose = null;
    document.removeEventListener('mousedown', onDocPointer, true);
    window.removeEventListener('resize', placePanel);
    window.removeEventListener('scroll', placePanel, true);
  }

  function openPanel() {
    if (typeof openPickerClose === 'function' && openPickerClose !== closePanel) {
      openPickerClose();
    }
    panelOpen = true;
    root.classList.add('mda-cm-code-lang-open');
    idle.hidden = true;
    idle.setAttribute('aria-expanded', 'true');
    editor.hidden = false;
    // 底层浅灰显示当前语言；输入值清空以便过滤
    search.value = '';
    search.placeholder = currentLabel();
    renderList();
    placePanel();
    openPickerClose = closePanel;
    document.addEventListener('mousedown', onDocPointer, true);
    window.addEventListener('resize', placePanel);
    window.addEventListener('scroll', placePanel, true);
    requestAnimationFrame(function () {
      search.focus();
      try {
        search.setSelectionRange(0, 0);
      } catch (_) {
        /* ignore */
      }
    });
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
  }

  function onDocPointer(e) {
    const target = /** @type {Node} */ (e.target);
    if (root.contains(target)) return;
    if (panel.contains(target)) return;
    closePanel();
  }

  function pickLang(next) {
    const normalized = normalizeCodeBlockLang(next);
    if (normalized === currentLang) {
      closePanel();
      return;
    }
    currentLang = normalized;
    closePanel();
    if (typeof opts.onChange === 'function') opts.onChange(currentLang);
  }

  syncIdle();

  idle.addEventListener('mousedown', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });
  idle.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    openPanel();
  });

  editorChevron.addEventListener('mousedown', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });
  editorChevron.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    togglePanel();
  });

  search.addEventListener('mousedown', function (e) {
    e.stopPropagation();
  });
  search.addEventListener('input', function () {
    renderList();
    placePanel();
  });
  search.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = list.querySelector('.mda-cm-code-lang-option');
      if (first) pickLang(first.getAttribute('data-lang') || '');
    }
  });

  panel.addEventListener('mousedown', function (e) {
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
    if (!panelOpen) syncIdle();
    else {
      search.placeholder = currentLabel();
      renderList();
      placePanel();
    }
  };

  root.closePanel = closePanel;

  return root;
}

module.exports = {
  createCodeLangPicker: createCodeLangPicker,
};

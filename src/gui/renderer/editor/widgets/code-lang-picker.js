/**
 * M8-C4：围栏代码块语言切换。
 * - 点语言名 → 可搜索面板
 * - 点 ▾ → 语言子菜单（无搜索）
 */
'use strict';

const { uiT, HOVER_LEAVE_MS } = require('./widget-common');
const {
  CODE_BLOCK_LANGUAGES,
  normalizeCodeBlockLang,
  getCodeLangLabel,
  filterCodeLanguages,
} = require('./code-languages');

/** @type {(() => void) | null} */
let openPickerClose = null;
/** @type {(() => void) | null} */
let openSubmenuClose = null;

/**
 * @param {{ lang?: string, t?: Function, onChange?: (lang: string) => void }} opts
 */
function createCodeLangPicker(opts) {
  const t = opts.t;
  let currentLang = normalizeCodeBlockLang(opts.lang);
  const root = document.createElement('div');
  root.className = 'mda-cm-code-lang-picker';

  const group = document.createElement('div');
  group.className = 'mda-cm-code-lang-trigger-group';

  const labelBtn = document.createElement('button');
  labelBtn.type = 'button';
  labelBtn.className = 'mda-cm-code-lang-trigger-label-btn';
  labelBtn.setAttribute('data-i18n-title', 'widgetCodeLangSwitch');
  labelBtn.title = uiT('widgetCodeLangSwitch', t);

  const chevronBtn = document.createElement('button');
  chevronBtn.type = 'button';
  chevronBtn.className = 'mda-cm-code-lang-trigger-chevron-btn';
  chevronBtn.setAttribute('data-i18n-title', 'widgetCodeLangMenu');
  chevronBtn.setAttribute('data-i18n-aria', 'widgetCodeLangMenu');
  chevronBtn.title = uiT('widgetCodeLangMenu', t);
  chevronBtn.setAttribute('aria-label', uiT('widgetCodeLangMenu', t));
  chevronBtn.setAttribute('aria-haspopup', 'menu');
  chevronBtn.setAttribute('aria-expanded', 'false');
  const chevronMark = document.createElement('span');
  chevronMark.className = 'mda-cm-code-lang-trigger-chevron';
  chevronMark.setAttribute('aria-hidden', 'true');
  chevronMark.textContent = '▾';
  chevronBtn.appendChild(chevronMark);

  group.appendChild(labelBtn);
  group.appendChild(chevronBtn);

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
  root.appendChild(group);
  root.appendChild(panel);

  /** @type {HTMLElement | null} */
  let submenuEl = null;
  let submenuLeaveTimer = 0;

  function clearSubmenuLeaveTimer() {
    window.clearTimeout(submenuLeaveTimer);
    submenuLeaveTimer = 0;
  }

  /**
   * @param {EventTarget | null} target
   */
  function isInLangSubCluster(target) {
    if (!target || !(target instanceof Node)) return false;
    if (root.contains(target)) return true;
    if (submenuEl && submenuEl.contains(target)) return true;
    return false;
  }

  function scheduleCloseSubmenu() {
    clearSubmenuLeaveTimer();
    submenuLeaveTimer = window.setTimeout(closeSubmenu, HOVER_LEAVE_MS);
  }

  function setTriggerLabel() {
    labelBtn.textContent = getCodeLangLabel(currentLang, t);
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
    root.classList.remove('mda-cm-code-lang-open');
    search.value = '';
    if (openPickerClose === closePanel) openPickerClose = null;
    document.removeEventListener('mousedown', onDocPointer, true);
  }

  function closeSubmenu() {
    clearSubmenuLeaveTimer();
    if (submenuEl && submenuEl.parentNode) submenuEl.parentNode.removeChild(submenuEl);
    submenuEl = null;
    chevronBtn.setAttribute('aria-expanded', 'false');
    root.classList.remove('mda-cm-code-lang-submenu-open');
    if (openSubmenuClose === closeSubmenu) openSubmenuClose = null;
    document.removeEventListener('mousedown', onDocSubPointer, true);
  }

  function closeAll() {
    closePanel();
    closeSubmenu();
  }

  function openPanel() {
    closeSubmenu();
    if (typeof openPickerClose === 'function' && openPickerClose !== closePanel) {
      openPickerClose();
    }
    panel.hidden = false;
    root.classList.add('mda-cm-code-lang-open');
    renderList();
    openPickerClose = closePanel;
    document.addEventListener('mousedown', onDocPointer, true);
    requestAnimationFrame(function () {
      search.focus();
      search.select();
    });
  }

  function placeSubmenu(menu) {
    document.body.appendChild(menu);
    const rect = chevronBtn.getBoundingClientRect();
    const pad = 8;
    let left = rect.left;
    let top = rect.bottom + 4;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    if (left + menu.offsetWidth > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - menu.offsetWidth - pad);
      menu.style.left = left + 'px';
    }
    if (top + menu.offsetHeight > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - menu.offsetHeight - 4);
      menu.style.top = top + 'px';
    }
  }

  function openSubmenu() {
    closePanel();
    if (typeof openSubmenuClose === 'function' && openSubmenuClose !== closeSubmenu) {
      openSubmenuClose();
    }
    if (typeof openPickerClose === 'function') openPickerClose();

    const menu = document.createElement('div');
    menu.className = 'mda-context-menu mda-cm-code-lang-submenu';
    menu.setAttribute('role', 'menu');

    for (let i = 0; i < CODE_BLOCK_LANGUAGES.length; i++) {
      const item = CODE_BLOCK_LANGUAGES[i];
      const row = document.createElement('div');
      row.className = 'mda-menu-item';
      row.setAttribute('role', 'menuitem');
      row.dataset.lang = item.id;
      if (item.id === currentLang) row.classList.add('mda-menu-item-active');
      const lab = document.createElement('span');
      lab.className = 'mda-menu-label';
      lab.textContent = item.id ? item.label : uiT('widgetCodeLangPlain', t);
      row.appendChild(lab);
      if (item.id === currentLang) {
        const mark = document.createElement('span');
        mark.className = 'mda-menu-key';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '✓';
        row.appendChild(mark);
      }
      menu.appendChild(row);
    }

    menu.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
    menu.addEventListener('click', function (e) {
      const row = e.target && e.target.closest ? e.target.closest('[data-lang]') : null;
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      pickLang(row.getAttribute('data-lang') || '');
    });
    menu.addEventListener('mouseenter', function () {
      clearSubmenuLeaveTimer();
    });
    menu.addEventListener('mouseleave', function (e) {
      if (isInLangSubCluster(e.relatedTarget)) return;
      scheduleCloseSubmenu();
    });

    submenuEl = menu;
    chevronBtn.setAttribute('aria-expanded', 'true');
    root.classList.add('mda-cm-code-lang-submenu-open');
    placeSubmenu(menu);
    openSubmenuClose = closeSubmenu;
    document.addEventListener('mousedown', onDocSubPointer, true);
  }

  function onDocPointer(e) {
    if (!root.contains(/** @type {Node} */ (e.target))) closePanel();
  }

  function onDocSubPointer(e) {
    const target = /** @type {Node} */ (e.target);
    if (root.contains(target)) return;
    if (submenuEl && submenuEl.contains(target)) return;
    closeSubmenu();
  }

  function pickLang(next) {
    const normalized = normalizeCodeBlockLang(next);
    if (normalized === currentLang) {
      closeAll();
      return;
    }
    currentLang = normalized;
    setTriggerLabel();
    closeAll();
    if (typeof opts.onChange === 'function') opts.onChange(currentLang);
  }

  setTriggerLabel();
  renderList();

  labelBtn.addEventListener('mousedown', function (e) {
    e.stopPropagation();
  });
  labelBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (panel.hidden) openPanel();
    else closePanel();
  });

  chevronBtn.addEventListener('mousedown', function (e) {
    e.stopPropagation();
  });
  chevronBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    clearSubmenuLeaveTimer();
    if (submenuEl) closeSubmenu();
    else openSubmenu();
  });
  root.addEventListener('mouseenter', function () {
    if (submenuEl) clearSubmenuLeaveTimer();
  });
  root.addEventListener('mouseleave', function (e) {
    if (!submenuEl) return;
    if (isInLangSubCluster(e.relatedTarget)) return;
    scheduleCloseSubmenu();
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
      labelBtn.focus();
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

  root.closePanel = closeAll;

  return root;
}

module.exports = {
  createCodeLangPicker: createCodeLangPicker,
  CODE_BLOCK_LANGUAGES: CODE_BLOCK_LANGUAGES,
};

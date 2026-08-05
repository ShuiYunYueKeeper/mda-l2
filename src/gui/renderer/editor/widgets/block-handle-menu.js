/**
 * 块左上角手柄菜单（AI / 插入 / 复制 / 剪切 / 删除）。
 * 部分 AI 与插入项为占位入口，后续补齐能力。
 */
'use strict';

const { uiT, HOVER_LEAVE_MS } = require('./widget-common');
const { menuIconHtml } = require('./block-menu-icons');

/** @type {HTMLElement | null} */
let activeMenu = null;
/** @type {HTMLElement | null} */
let activeSubmenu = null;
/** @type {HTMLElement | null} */
let menuAnchorEl = null;
/** @type {HTMLElement | null} */
let menuBlockRoot = null;
/** @type {(() => void) | null} */
let dismissFn = null;
let subOpenTimer = 0;
let subCloseTimer = 0;
/** @type {((e: KeyboardEvent) => void) | null} */
let escFn = null;
let menuCloseTimer = 0;
let menuGraceUntil = 0;

const MENU_GRACE_MS = 380;
const SUB_CLOSE_MS = HOVER_LEAVE_MS;
const MENU_CLOSE_MS = HOVER_LEAVE_MS;

const MOD_KEY =
  typeof navigator !== 'undefined' &&
  (navigator.platform || '').toLowerCase().indexOf('mac') >= 0
    ? '\u2318'
    : 'Ctrl+';

const COPY_AS_ITEMS = [
  { id: 'markdown', key: 'blockMenuCopyAsMarkdown', icon: 'markdown' },
  { id: 'image', key: 'blockMenuCopyAsImage', icon: 'copyAsImage' },
];

const AI_ITEMS = [
  { id: 'continue', key: 'blockMenuAiContinue', icon: 'continue', soon: true },
  { id: 'companion', key: 'blockMenuAiCompanion', icon: 'companion', soon: true },
  { id: 'polish', key: 'blockMenuAiPolish', icon: 'polish', soon: true },
  { id: 'expand', key: 'blockMenuAiExpand', icon: 'expand', soon: true },
  { id: 'shorten', key: 'blockMenuAiShorten', icon: 'shorten', soon: true },
  { id: 'grammar', key: 'blockMenuAiGrammar', icon: 'grammar', soon: true },
  { id: 'explain', key: 'blockMenuAiExplain', icon: 'explain', soon: true },
  { id: 'translate', key: 'blockMenuAiTranslate', icon: 'translate', soon: true },
  { id: 'summarize', key: 'blockMenuAiSummarize', icon: 'summarize', soon: true },
  { id: 'more', key: 'blockMenuAiMore', icon: 'more', soon: true },
];

const INSERT_ITEMS = [
  { id: 'image', key: 'blockMenuInsertImage', icon: 'image', soon: false },
  { id: 'table', key: 'blockMenuInsertTable', icon: 'table', soon: false },
  { id: 'code', key: 'blockMenuInsertCode', icon: 'code', soon: false },
  { id: 'quote', key: 'blockMenuInsertQuote', icon: 'quote', soon: false },
  { id: 'mermaid', key: 'blockMenuInsertMermaid', icon: 'mermaid', soon: false },
  { id: 'hr', key: 'blockMenuInsertHr', icon: 'hr', soon: false },
];

function clearSubTimers() {
  window.clearTimeout(subOpenTimer);
  window.clearTimeout(subCloseTimer);
  window.clearTimeout(menuCloseTimer);
  subOpenTimer = 0;
  subCloseTimer = 0;
  menuCloseTimer = 0;
}

function closeActiveSubmenu() {
  if (activeSubmenu && activeSubmenu.parentNode) {
    activeSubmenu.parentNode.removeChild(activeSubmenu);
  }
  activeSubmenu = null;
}

function removeOrphanSubmenus() {
  const nodes = document.querySelectorAll('.mda-block-handle-submenu');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}

/**
 * @param {Node | null | undefined} target
 */
function isInMenuCluster(target) {
  if (!target) return false;
  const el = /** @type {Node} */ (target);
  if (activeMenu && activeMenu.contains(el)) return true;
  if (activeSubmenu && activeSubmenu.contains(el)) return true;
  if (menuAnchorEl && menuAnchorEl.contains(el)) return true;
  if (menuBlockRoot && menuBlockRoot.contains(el)) return true;
  return false;
}

function closeBlockHandleMenu() {
  clearSubTimers();
  closeActiveSubmenu();
  removeOrphanSubmenus();
  const prevRoot = menuBlockRoot;
  if (activeMenu && activeMenu.parentNode) activeMenu.parentNode.removeChild(activeMenu);
  activeMenu = null;
  menuAnchorEl = null;
  menuBlockRoot = null;
  menuGraceUntil = 0;
  if (prevRoot && !prevRoot.matches(':hover')) {
    const handle = prevRoot.querySelector('.mda-cm-block-drag-handle');
    if (!handle || !handle.matches(':hover')) {
      prevRoot.classList.remove('mda-cm-block-handle-show');
    }
  }
  if (dismissFn) {
    document.removeEventListener('mousedown', dismissFn, true);
    document.removeEventListener('contextmenu', dismissFn, true);
    window.removeEventListener('blur', dismissFn);
    dismissFn = null;
  }
  if (escFn) {
    document.removeEventListener('keydown', escFn, true);
    escFn = null;
  }
}

/**
 * @param {HTMLElement | null | undefined} blockRoot
 */
function isBlockHandleMenuOpenFor(blockRoot) {
  return !!(activeMenu && menuBlockRoot && blockRoot && menuBlockRoot === blockRoot);
}

/**
 * @param {HTMLElement} menu
 */
function addMenuSeparator(menu) {
  const sep = document.createElement('div');
  sep.className = 'mda-menu-sep';
  sep.setAttribute('aria-hidden', 'true');
  menu.appendChild(sep);
}

/**
 * @param {string} label
 * @param {string} [iconName]
 * @param {string} [suffixHtml]
 */
function menuItemInner(label, iconName, suffixHtml) {
  return (
    menuIconHtml(iconName || '') +
    '<span class="mda-menu-label">' +
    label +
    '</span>' +
    (suffixHtml || '')
  );
}

/**
 * @param {HTMLElement} menu
 * @param {number} x
 * @param {number} y
 */
function placeMenu(menu, x, y) {
  menu.style.left = '0px';
  menu.style.top = '0px';
  document.body.appendChild(menu);
  const pad = 6;
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  let left = x;
  let top = y;
  if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
  if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

/**
 * @param {HTMLElement} parentItem
 * @param {HTMLElement} submenu
 */
function placeSubmenu(parentItem, submenu) {
  document.body.appendChild(submenu);
  const pr = parentItem.getBoundingClientRect();
  const pad = 6;
  let left = pr.right - 4;
  let top = pr.top - 4;
  submenu.style.left = left + 'px';
  submenu.style.top = top + 'px';
  if (left + submenu.offsetWidth > window.innerWidth - pad) {
    left = pr.left - submenu.offsetWidth + 4;
    submenu.style.left = left + 'px';
  }
  if (top + submenu.offsetHeight > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - submenu.offsetHeight - pad);
    submenu.style.top = top + 'px';
  }
}

/**
 * @param {(key: string) => string} t
 * @param {{ id: string, key: string, icon?: string, soon?: boolean }[]} items
 * @param {(id: string, soon: boolean) => void} onPick
 */
function buildSubmenu(t, items, onPick) {
  const sub = document.createElement('div');
  sub.className = 'mda-context-menu mda-block-handle-submenu';
  sub.setAttribute('role', 'menu');
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const row = document.createElement('div');
    row.className = 'mda-menu-item' + (it.soon ? ' mda-menu-item-soon' : '');
    row.setAttribute('role', 'menuitem');
    row.dataset.act = it.id;
    row.dataset.soon = it.soon ? '1' : '0';
    row.innerHTML = menuItemInner(uiT(it.key, t), it.icon);
    sub.appendChild(row);
  }
  sub.addEventListener('click', function (e) {
    const item = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!item) return;
    e.stopPropagation();
    onPick(item.dataset.act || '', item.dataset.soon === '1');
    closeBlockHandleMenu();
  });
  sub.addEventListener('mouseenter', function () {
    window.clearTimeout(subCloseTimer);
    subCloseTimer = 0;
    window.clearTimeout(menuCloseTimer);
    menuCloseTimer = 0;
  });
  sub.addEventListener('mouseleave', function () {
    window.clearTimeout(subCloseTimer);
    subCloseTimer = window.setTimeout(closeActiveSubmenu, SUB_CLOSE_MS);
  });
  return sub;
}

/**
 * @param {HTMLElement} menu
 * @param {(key: string) => string} t
 * @param {string} key
 * @param {string} icon
 * @param {() => HTMLElement} submenuFactory
 */
function addSubRow(menu, t, key, icon, submenuFactory) {
  const row = document.createElement('div');
  row.className = 'mda-menu-item mda-menu-has-sub';
  row.setAttribute('role', 'menuitem');
  row.innerHTML =
    menuItemInner(uiT(key, t), icon, '<span class="mda-menu-chevron" aria-hidden="true">\u203a</span>');

  row.addEventListener('mouseenter', function () {
    window.clearTimeout(subCloseTimer);
    subCloseTimer = 0;
    window.clearTimeout(menuCloseTimer);
    menuCloseTimer = 0;
    window.clearTimeout(subOpenTimer);
    subOpenTimer = window.setTimeout(function () {
      closeActiveSubmenu();
      activeSubmenu = submenuFactory();
      placeSubmenu(row, activeSubmenu);
    }, 100);
  });

  row.addEventListener('mouseleave', function (e) {
    window.clearTimeout(subOpenTimer);
    subOpenTimer = 0;
    const rt = e.relatedTarget;
    if (activeSubmenu && rt && activeSubmenu.contains(/** @type {Node} */ (rt))) return;
    window.clearTimeout(subCloseTimer);
    subCloseTimer = window.setTimeout(closeActiveSubmenu, SUB_CLOSE_MS);
  });

  menu.appendChild(row);
}

/**
 * @param {{
 *   anchorEl: HTMLElement,
 *   blockRoot?: HTMLElement,
 *   view: import('@codemirror/view').EditorView,
 *   block: { from: number, to: number, source?: string },
 *   blockKind?: string,
 *   t?: Function,
 *   handlers?: {
 *     onCopy?: Function,
 *     onCut?: Function,
 *     onCopyAs?: Function,
 *     onDelete?: Function,
 *     onInsert?: Function,
 *     onAi?: Function,
 *     onSoon?: Function,
 *   },
 * }} ctx
 */
function showBlockHandleMenu(ctx) {
  const { closeEmptyLineInsertMenu } = require('./empty-line-insert-menu');
  closeEmptyLineInsertMenu();
  closeBlockHandleMenu();
  const t = ctx.t;
  const handlers = ctx.handlers || {};
  const anchor = ctx.anchorEl;
  const rect = anchor.getBoundingClientRect();
  menuAnchorEl = anchor;
  menuBlockRoot = ctx.blockRoot || null;
  menuGraceUntil = Date.now() + MENU_GRACE_MS;
  if (menuBlockRoot) menuBlockRoot.classList.add('mda-cm-block-handle-show');

  const menu = document.createElement('div');
  menu.className = 'mda-context-menu mda-block-handle-menu';
  menu.id = 'mda-block-handle-menu';
  menu.setAttribute('role', 'menu');

  addSubRow(menu, t, 'blockMenuAiEdit', 'ai', function () {
    return buildSubmenu(t, AI_ITEMS, function (id, soon) {
      if (soon) {
        if (typeof handlers.onSoon === 'function') handlers.onSoon('ai', id);
        return;
      }
      if (typeof handlers.onAi === 'function') {
        handlers.onAi(id, ctx.block, ctx.blockKind);
      }
    });
  });

  addMenuSeparator(menu);

  addSubRow(menu, t, 'blockMenuInsertAbove', 'insertAbove', function () {
    return buildSubmenu(t, INSERT_ITEMS, function (id, soon) {
      if (soon) {
        if (typeof handlers.onSoon === 'function') handlers.onSoon('insert-above', id);
        return;
      }
      if (typeof handlers.onInsert === 'function') {
        handlers.onInsert('above', id, ctx.block, ctx.blockKind);
      }
    });
  });

  addSubRow(menu, t, 'blockMenuInsertBelow', 'insertBelow', function () {
    return buildSubmenu(t, INSERT_ITEMS, function (id, soon) {
      if (soon) {
        if (typeof handlers.onSoon === 'function') handlers.onSoon('insert-below', id);
        return;
      }
      if (typeof handlers.onInsert === 'function') {
        handlers.onInsert('below', id, ctx.block, ctx.blockKind);
      }
    });
  });

  addMenuSeparator(menu);

  const mod = ctx.modKey || MOD_KEY;

  function addActionRow(spec) {
    const row = document.createElement('div');
    row.className = 'mda-menu-item' + (spec.danger ? ' mda-menu-danger' : '');
    row.dataset.act = spec.act;
    row.setAttribute('role', 'menuitem');
    row.innerHTML = menuItemInner(
      uiT(spec.key, t),
      spec.icon,
      spec.shortcut ? '<span class="mda-menu-key">' + spec.shortcut + '</span>' : ''
    );
    menu.appendChild(row);
  }

  addActionRow({ act: 'copy', key: 'copyBtn', icon: 'copy', shortcut: mod + 'C' });
  addActionRow({ act: 'cut', key: 'blockMenuCut', icon: 'cut', shortcut: mod + 'X' });

  addSubRow(menu, t, 'blockMenuCopyAs', 'copyAs', function () {
    return buildSubmenu(t, COPY_AS_ITEMS, function (id) {
      if (typeof handlers.onCopyAs === 'function') {
        handlers.onCopyAs(ctx.block, ctx.blockKind, id);
      }
    });
  });

  addActionRow({
    act: 'delete',
    key: 'blockMenuDelete',
    icon: 'delete',
    shortcut: 'Backspace',
    danger: true,
  });

  menu.addEventListener('click', function (e) {
    const item = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!item || item.classList.contains('mda-menu-has-sub')) return;
    const act = item.dataset.act;
    if (act === 'copy' && typeof handlers.onCopy === 'function') {
      handlers.onCopy(ctx.block, ctx.blockKind);
    } else if (act === 'cut' && typeof handlers.onCut === 'function') {
      handlers.onCut(ctx.block, ctx.blockKind);
    } else if (act === 'delete' && typeof handlers.onDelete === 'function') {
      handlers.onDelete(ctx.block, ctx.blockKind);
    }
    closeBlockHandleMenu();
  });

  menu.addEventListener('mouseenter', function () {
    window.clearTimeout(menuCloseTimer);
    menuCloseTimer = 0;
  });

  menu.addEventListener('mouseleave', function (e) {
    const rt = e.relatedTarget;
    if (activeSubmenu && rt && activeSubmenu.contains(/** @type {Node} */ (rt))) return;
    window.clearTimeout(menuCloseTimer);
    menuCloseTimer = window.setTimeout(function () {
      if (Date.now() < menuGraceUntil) return;
      closeBlockHandleMenu();
    }, MENU_CLOSE_MS);
  });

  placeMenu(menu, rect.left, rect.bottom + 2);
  activeMenu = menu;

  dismissFn = function (ev) {
    if (Date.now() < menuGraceUntil) return;
    if (ev && (ev.type === 'mousedown' || ev.type === 'contextmenu')) {
      const target = /** @type {Node | null} */ (ev.target);
      if (isInMenuCluster(target)) return;
    }
    closeBlockHandleMenu();
  };

  escFn = function (ev) {
    if (ev.key === 'Escape') closeBlockHandleMenu();
  };
  document.addEventListener('keydown', escFn, true);

  window.setTimeout(function () {
    if (!activeMenu) return;
    document.addEventListener('mousedown', dismissFn, true);
    document.addEventListener('contextmenu', dismissFn, true);
    window.addEventListener('blur', dismissFn);
  }, MENU_GRACE_MS);
}

module.exports = {
  showBlockHandleMenu: showBlockHandleMenu,
  closeBlockHandleMenu: closeBlockHandleMenu,
  isBlockHandleMenuOpenFor: isBlockHandleMenuOpenFor,
  MOD_KEY: MOD_KEY,
};

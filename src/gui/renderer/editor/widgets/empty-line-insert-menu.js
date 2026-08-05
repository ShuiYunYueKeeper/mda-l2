/**
 * 空白行「+」：扁平插入菜单（图片 / 表格 / 代码块 / 引用 / 流程图 / 分隔线）。
 */
'use strict';

const { uiT, HOVER_LEAVE_MS } = require('./widget-common');
const { menuIconHtml } = require('./block-menu-icons');

/** @type {HTMLElement | null} */
let activeMenu = null;
/** @type {HTMLElement | null} */
let menuAnchorEl = null;
/** @type {HTMLElement | null} */
let menuBlockRoot = null;
/** @type {(() => void) | null} */
let dismissFn = null;
/** @type {((e: KeyboardEvent) => void) | null} */
let escFn = null;
let menuGraceUntil = 0;

const MENU_GRACE_MS = 380;
const MENU_CLOSE_MS = HOVER_LEAVE_MS;

const INSERT_ITEMS = [
  { id: 'image', key: 'blockMenuInsertImage', icon: 'image', soon: false },
  { id: 'table', key: 'blockMenuInsertTable', icon: 'table', soon: false },
  { id: 'code', key: 'blockMenuInsertCode', icon: 'code', soon: false },
  { id: 'quote', key: 'blockMenuInsertQuote', icon: 'quote', soon: false },
  { id: 'mermaid', key: 'blockMenuInsertMermaid', icon: 'mermaid', soon: false },
  { id: 'hr', key: 'blockMenuInsertHr', icon: 'hr', soon: false },
];

/**
 * @param {Node | null | undefined} target
 */
function isInMenuCluster(target) {
  if (!target) return false;
  const el = /** @type {Node} */ (target);
  if (activeMenu && activeMenu.contains(el)) return true;
  if (menuAnchorEl && menuAnchorEl.contains(el)) return true;
  if (menuBlockRoot && menuBlockRoot.contains(el)) return true;
  return false;
}

function closeEmptyLineInsertMenu() {
  const prevRoot = menuBlockRoot;
  if (activeMenu && activeMenu.parentNode) activeMenu.parentNode.removeChild(activeMenu);
  activeMenu = null;
  menuAnchorEl = null;
  menuBlockRoot = null;
  menuGraceUntil = 0;
  if (prevRoot && !prevRoot.matches(':hover')) {
    prevRoot.classList.remove('mda-cm-block-handle-show');
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
function isEmptyLineInsertMenuOpenFor(blockRoot) {
  return !!(activeMenu && menuBlockRoot && blockRoot && menuBlockRoot === blockRoot);
}

/**
 * @param {string} label
 * @param {string} [iconName]
 */
function menuItemInner(label, iconName) {
  return menuIconHtml(iconName || '') + '<span class="mda-menu-label">' + label + '</span>';
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
 * @param {{
 *   anchorEl: HTMLElement,
 *   blockRoot?: HTMLElement,
 *   view: import('@codemirror/view').EditorView,
 *   block: { from: number, to: number, source?: string },
 *   t?: Function,
 *   handlers?: {
 *     onBlankInsert?: Function,
 *     onSoon?: Function,
 *   },
 * }} ctx
 */
function showEmptyLineInsertMenu(ctx) {
  closeEmptyLineInsertMenu();
  const { closeBlockHandleMenu } = require('./block-handle-menu');
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
  menu.className = 'mda-context-menu mda-empty-line-insert-menu mda-block-handle-submenu';
  menu.id = 'mda-empty-line-insert-menu';
  menu.setAttribute('role', 'menu');

  for (let i = 0; i < INSERT_ITEMS.length; i++) {
    const it = INSERT_ITEMS[i];
    const row = document.createElement('div');
    row.className = 'mda-menu-item' + (it.soon ? ' mda-menu-item-soon' : '');
    row.setAttribute('role', 'menuitem');
    row.dataset.act = it.id;
    row.dataset.soon = it.soon ? '1' : '0';
    row.innerHTML = menuItemInner(uiT(it.key, t), it.icon);
    menu.appendChild(row);
  }

  menu.addEventListener('click', function (e) {
    const item = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!item) return;
    e.stopPropagation();
    const id = item.dataset.act || '';
    const soon = item.dataset.soon === '1';
    if (soon) {
      if (typeof handlers.onSoon === 'function') handlers.onSoon('insert-blank', id);
      closeEmptyLineInsertMenu();
      return;
    }
    if (typeof handlers.onBlankInsert === 'function') {
      handlers.onBlankInsert(id, ctx.block);
    }
    closeEmptyLineInsertMenu();
  });

  placeMenu(menu, rect.left, rect.bottom + 2);
  activeMenu = menu;

  dismissFn = function (ev) {
    if (Date.now() < menuGraceUntil) return;
    if (ev && (ev.type === 'mousedown' || ev.type === 'contextmenu')) {
      const target = /** @type {Node | null} */ (ev.target);
      if (isInMenuCluster(target)) return;
    }
    closeEmptyLineInsertMenu();
  };

  escFn = function (ev) {
    if (ev.key === 'Escape') closeEmptyLineInsertMenu();
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
  showEmptyLineInsertMenu: showEmptyLineInsertMenu,
  closeEmptyLineInsertMenu: closeEmptyLineInsertMenu,
  isEmptyLineInsertMenuOpenFor: isEmptyLineInsertMenuOpenFor,
};

/**
 * 空白行「+」：版式（标题/列表）+ 通用块插入菜单。
 */
'use strict';

const { HOVER_LEAVE_MS } = require('./widget-common');
const { appendInsertMenuPanel } = require('./insert-menu-panel');

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
 *   anchorEl?: HTMLElement,
 *   anchorRect?: { left: number, top: number, right: number, bottom: number },
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
  menuAnchorEl = anchor || null;
  menuBlockRoot = ctx.blockRoot || null;
  menuGraceUntil = Date.now() + MENU_GRACE_MS;
  if (menuBlockRoot) menuBlockRoot.classList.add('mda-cm-block-handle-show');

  const menu = document.createElement('div');
  menu.className =
    'mda-context-menu mda-empty-line-insert-menu mda-block-handle-submenu mda-insert-menu-panel';
  menu.id = 'mda-empty-line-insert-menu';
  menu.setAttribute('role', 'menu');

  appendInsertMenuPanel(menu, t, function (id, soon) {
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

  let placeX;
  let placeY;
  if (ctx.anchorRect) {
    placeX = ctx.anchorRect.left;
    placeY = ctx.anchorRect.bottom;
  } else if (anchor) {
    const rect = anchor.getBoundingClientRect();
    placeX = rect.left;
    placeY = rect.bottom;
  } else {
    placeX = 0;
    placeY = 0;
  }
  placeMenu(menu, placeX, placeY + 2);
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

/**
 * CM6 编辑面右键菜单（剪贴板 / 复制为 / 链接编辑 / AI 占位入口）。
 */
'use strict';

const { ViewPlugin } = require('@codemirror/view');
const { syntaxTree } = require('@codemirror/language');
const { sliceDocForClipboard } = require('./syntax-clipboard');
const { anchorFromSelection } = require('./model/anchor-from-sel');
const {
  canUseSelectionAnnoForRange,
  isBlockOnlyKind,
  blockAnnotationLine,
} = require('./model/anno-add-context');
const { hitBlankLineAt } = require('./empty-line-insert');
const {
  snapshotDomSelection,
  shouldPreserveDomSelection,
  shouldPreserveCmSelection,
  snapshotCmSelection,
  restoreCmSelection,
  restoreDomSelection,
  collapseCmAtClick,
  collapseWidgetDomAt,
  clearCmSelectionIfAny,
} = require('./context-selection');
const { menuIconHtml } = require('./widgets/block-menu-icons');
const { uiT } = require('./widgets/widget-common');
const { closeBlockHandleMenu, MOD_KEY } = require('./widgets/block-handle-menu');
const { closeEmptyLineInsertMenu } = require('./widgets/empty-line-insert-menu');
const { getSelectedImageBlock } = require('./widgets/image-selection');
const { getSelectedMermaidBlock } = require('./widgets/mermaid-selection');
const { getSelectedBlockOfKind } = require('./widgets/block-selection');
const { showLinkEditPopover } = require('./link-edit-popover');
const { normalizeExternalHref } = require('./model/auto-link');
const {
  setWidgetDomMenuGuard,
  isWidgetDomMenuGuard,
} = require('./widget-context-menu-guard');

const COPY_AS_ITEMS = [
  { id: 'markdown', key: 'blockMenuCopyAsMarkdown', icon: 'markdown' },
  { id: 'image', key: 'blockMenuCopyAsImage', icon: 'copyAsImage' },
];

const TABLE_CHROME_SEL =
  '.mda-cm-table-col-gutter, .mda-cm-table-row-gutter, .mda-cm-table-chrome, .mda-cm-table-col-bar, .mda-cm-table-row-bar, .mda-cm-table-col-gutter-clip, .mda-cm-table-col-resize-handle, .mda-cm-table-row-resize-handle';

const WIDGET_EDIT_SEL =
  '.mda-cm-code-input, .mda-cm-mermaid-source-input, th[contenteditable], td[contenteditable]';

/** @type {HTMLElement | null} */
let activeMenu = null;
/** @type {HTMLElement | null} */
let activeSubmenu = null;
/** @type {ReturnType<typeof setTimeout>} */
let subOpenTimer = 0;
/** @type {ReturnType<typeof setTimeout>} */
let subCloseTimer = 0;
/** @type {((ev: Event) => void) | null} */
let dismissFn = null;
/** @type {((ev: KeyboardEvent) => void) | null} */
let escFn = null;

/**
 * 右键按下时快照、菜单操作期间复用，避免 CM6 / contenteditable 折叠选区。
 * @type {{
 *   cm?: { anchor: number, head: number, from: number, to: number },
 *   dom?: { root: HTMLElement, text: string, range?: Range },
 * } | null}
 */
let pendingMenuSelection = null;

/** @type {typeof pendingMenuSelection} */
let activeMenuSelection = null;

/**
 * @param {HTMLElement | null | undefined} root
 */
function hasPendingDomMenuFor(root) {
  if (!root || !pendingMenuSelection || !pendingMenuSelection.dom) return false;
  return pendingMenuSelection.dom.root === root;
}

/**
 * @param {ReturnType<typeof snapshotDomSelection>} snap
 * @param {number} clientX
 * @param {number} clientY
 */
function stashDomMenuSelection(snap, clientX, clientY) {
  if (!snap) return;
  snap._menuX = clientX;
  snap._menuY = clientY;
  pendingMenuSelection = snap;
  setWidgetDomMenuGuard(true);
}

const SUB_CLOSE_MS = 200;

function clearSubTimers() {
  window.clearTimeout(subOpenTimer);
  window.clearTimeout(subCloseTimer);
  subOpenTimer = 0;
  subCloseTimer = 0;
}

function closeActiveSubmenu() {
  if (activeSubmenu && activeSubmenu.parentNode) {
    activeSubmenu.parentNode.removeChild(activeSubmenu);
  }
  activeSubmenu = null;
}

function closeContextMenu() {
  clearSubTimers();
  closeActiveSubmenu();
  if (activeMenu && activeMenu.parentNode) {
    activeMenu.parentNode.removeChild(activeMenu);
  }
  activeMenu = null;
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
  activeMenuSelection = null;
  pendingMenuSelection = null;
  setWidgetDomMenuGuard(false);
}

/**
 * @param {HTMLElement} menu
 * @param {number} x
 * @param {number} y
 */
function placeMenu(menu, x, y) {
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
 * @param {string} label
 * @param {string} [iconName]
 * @param {string} [keyHint]
 */
function menuItemWithKey(label, iconName, keyHint) {
  return menuItemInner(
    label,
    iconName,
    keyHint ? '<span class="mda-menu-key">' + keyHint + '</span>' : ''
  );
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ from: number, to: number, text: string, href: string } | null}
 */
/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @returns {{ from: number, to: number, text: string, href: string } | null}
 */
function linkFromSyntaxAt(state, pos) {
  if (pos == null || pos < 0) return null;
  const doc = state.doc.toString();
  for (const side of [1, -1, 0]) {
    let node = syntaxTree(state).resolveInner(pos, side);
    while (node) {
      if (node.name === 'Link') {
        const slice = doc.slice(node.from, node.to);
        const m = /^\[([\s\S]*?)\]\(([\s\S]*?)\)$/.exec(slice);
        if (m) {
          return {
            from: node.from,
            to: node.to,
            text: m[1],
            href: normalizeExternalHref(String(m[2] || '').trim()),
          };
        }
      } else if (node.name === 'Autolink') {
        const raw = doc.slice(node.from + 1, node.to - 1).trim();
        return {
          from: node.from,
          to: node.to,
          text: raw,
          href: normalizeExternalHref(raw),
        };
      } else if (node.name === 'URL') {
        const raw = doc.slice(node.from, node.to).trim();
        return {
          from: node.from,
          to: node.to,
          text: raw,
          href: normalizeExternalHref(raw),
        };
      }
      node = node.parent;
    }
  }
  return null;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @param {EventTarget | null} [target]
 * @returns {{ from: number, to: number, text: string, href: string } | null}
 */
function getLinkAtCoords(view, clientX, clientY, target) {
  // 与 Ctrl+点击 / 悬停同一路径：装饰层 span[data-mda-href] 优先
  let domEl = null;
  if (target && /** @type {HTMLElement} */ (target).closest) {
    domEl = /** @type {HTMLElement} */ (
      /** @type {HTMLElement} */ (target).closest('[data-mda-href], .mda-cm-link')
    );
  }

  let pos = view.posAtCoords({ x: clientX, y: clientY });
  if ((pos == null || isNaN(pos)) && domEl) {
    try {
      pos = view.posAtDOM(domEl, 0);
    } catch (_) {
      /* ignore */
    }
  }

  const fromTree = linkFromSyntaxAt(view.state, pos);
  if (fromTree) return fromTree;

  // 语法树未命中时：用装饰 href + 光标附近文本反查区间（裸 www / 已包装链接）
  if (domEl) {
    const rawAttr = domEl.getAttribute('data-mda-href') || '';
    const href = normalizeExternalHref(rawAttr);
    if (!href) return null;
    const doc = view.state.doc.toString();
    const probe = pos != null ? pos : 0;
    const line = view.state.doc.lineAt(Math.max(0, Math.min(probe, doc.length)));
    const lineText = line.text;
    // 可见文案：www 裸链用属性原值；https 链用属性
    const display =
      /^www\./i.test(rawAttr) || /^https?:\/\//i.test(rawAttr)
        ? rawAttr
        : href.replace(/^https:\/\//i, '');
    let idx = lineText.indexOf(display);
    if (idx < 0 && rawAttr) idx = lineText.indexOf(rawAttr);
    if (idx < 0) {
      // 已是 [text](href) 源码但 hide-mark 只露 text
      const wrapped = '[' + display + '](' + href + ')';
      const widx = lineText.indexOf(wrapped);
      if (widx >= 0) {
        return {
          from: line.from + widx,
          to: line.from + widx + wrapped.length,
          text: display,
          href: href,
        };
      }
      // 仅能打开、粗略用当前 pos 单点（编辑时扩成包装）
      if (pos != null) {
        return { from: pos, to: pos, text: display || rawAttr, href: href };
      }
      return null;
    }
    const from = line.from + idx;
    const to = from + display.length;
    // 若两侧是 [text](href) 定界符，扩到整段
    if (
      from > 0 &&
      doc.charAt(from - 1) === '[' &&
      doc.slice(to, to + 2) === ']('
    ) {
      const close = doc.indexOf(')', to + 2);
      if (close > to) {
        return {
          from: from - 1,
          to: close + 1,
          text: display,
          href: href,
        };
      }
    }
    return { from: from, to: to, text: display || rawAttr, href: href };
  }

  return null;
}

/**
 * 右键在选区外：折叠选区，后续菜单走「复制/剪切灰 + 粘贴」。
 * @param {import('@codemirror/view').EditorView} view
 * @param {MouseEvent} e
 */
/**
 * 代码块：先快照逻辑偏移，再压平到 plain 并恢复选区（禁止在快照前压平）。
 * @param {HTMLElement} root
 * @param {ReturnType<typeof snapshotDomSelection>} snap
 */
function finalizeCodeBlockMenuSnapshot(root, snap) {
  if (!snap || !snap.dom) return;
  const dom = snap.dom;
  if (typeof dom.start !== 'number' || typeof dom.end !== 'number' || dom.end <= dom.start) return;
  const block = root.closest('.mda-cm-code-block');
  if (block && typeof block._mdaRestoreLogicalSelection === 'function') {
    block._mdaRestoreLogicalSelection(dom.start, dom.end);
  }
}

/**
 * @param {HTMLElement} root
 * @param {number} clientX
 * @param {number} clientY
 */
function skipWidgetMenuCollapse(root, clientX, clientY) {
  return (
    hasPendingDomMenuFor(root) ||
    isWidgetDomMenuGuard() ||
    shouldPreserveDomSelection(root, clientX, clientY)
  );
}

function prepareContextSelection(view, e) {
  const target = /** @type {HTMLElement} */ (e.target);
  const widgetEdit = target.closest && target.closest(WIDGET_EDIT_SEL);
  const tableCell = target.closest && target.closest('th[contenteditable], td[contenteditable]');

  if (widgetEdit) {
    const root = /** @type {HTMLElement} */ (widgetEdit);
    if (!skipWidgetMenuCollapse(root, e.clientX, e.clientY)) {
      collapseWidgetDomAt(root, e.clientX, e.clientY);
    }
    clearCmSelectionIfAny(view);
    return;
  }

  if (tableCell) {
    const cell = /** @type {HTMLElement} */ (tableCell);
    if (!skipWidgetMenuCollapse(cell, e.clientX, e.clientY)) {
      collapseWidgetDomAt(cell, e.clientX, e.clientY);
    }
    if (!shouldPreserveCmSelection(view, e.clientX, e.clientY)) {
      if (!view.state.selection.main.empty) {
        collapseCmAtClick(view, e.clientX, e.clientY);
      }
    }
    return;
  }

  if (pendingMenuSelection) return;

  if (!shouldPreserveCmSelection(view, e.clientX, e.clientY)) {
    if (!view.state.selection.main.empty) {
      collapseCmAtClick(view, e.clientX, e.clientY);
    }
  }
}

/**
 * @param {typeof pendingMenuSelection} pending
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 */
function revalidatePendingSelection(pending, view, clientX, clientY) {
  if (!pending) return null;
  if (pending.cm) {
    const cur = view.state.selection.main;
    // mousedown 已 preventDefault 保住选区时，勿再用易失真的坐标二次否决
    if (
      !cur.empty &&
      cur.from === pending.cm.from &&
      cur.to === pending.cm.to &&
      cur.anchor === pending.cm.anchor &&
      cur.head === pending.cm.head
    ) {
      return pending;
    }
    if (shouldPreserveCmSelection(view, clientX, clientY)) return pending;
    return null;
  }
  if (pending.dom) {
    const snap = pending.dom;
    if (!snap.root.isConnected) return null;
    if (shouldPreserveDomSelection(snap.root, clientX, clientY)) return pending;
    return null;
  }
  return pending;
}

/**
 * @param {*} ctx
 * @param {typeof pendingMenuSelection} pending
 */
function adjustContextWithSelection(ctx, pending) {
  if (!pending) return ctx;
  if (pending.dom && (ctx.type === 'dom-collapsed' || ctx.type === 'dom-text')) {
    return { type: 'dom-text', root: pending.dom.root };
  }
  if (pending.cm && (ctx.type === 'line' || ctx.type === 'text')) {
    return { type: 'text' };
  }
  return ctx;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {*} ctx
 * @param {typeof pendingMenuSelection} pending
 */
function captureMenuSelection(view, ctx, pending) {
  if (pending) return pending;
  if (ctx.type === 'dom-text') return snapshotDomSelection(ctx.root);
  if (ctx.type === 'text') return snapshotCmSelection(view);
  return null;
}

/**
 * @param {HTMLElement} root
 * @param {string} text
 */
function replaceDomSelection(root, text) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * @param {HTMLElement} el
 * @returns {{ from: number, to: number, source: string, kind: string } | null}
 */
function blockFromElement(el) {
  const root = el.closest
    ? el.closest('[data-mda-block-from][data-mda-block-to]')
    : null;
  if (!root) return null;
  const from = parseInt(root.getAttribute('data-mda-block-from') || '', 10);
  const to = parseInt(root.getAttribute('data-mda-block-to') || '', 10);
  if (!(from >= 0 && to > from)) return null;
  let kind = 'block';
  if (root.classList.contains('mda-cm-image-block')) kind = 'image';
  else if (root.classList.contains('mda-cm-mermaid-block')) kind = 'mermaid';
  else if (root.classList.contains('mda-cm-hr-block')) kind = 'hr';
  else if (root.classList.contains('mda-cm-code-block')) kind = 'code';
  return {
    from: from,
    to: to,
    source: root.getAttribute('data-mda-block-source') || '',
    kind: kind,
  };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {MouseEvent} e
 */
function shouldDeferToTableMenu(view, e) {
  const target = /** @type {HTMLElement} */ (e.target);
  if (!target || !target.closest) return false;
  if (!target.closest('.mda-cm-table-stage')) return false;
  if (target.closest(TABLE_CHROME_SEL)) return true;
  const cell = target.closest('th[contenteditable], td[contenteditable]');
  if (!cell) return true;
  const cellEl = /** @type {HTMLElement} */ (cell);
  if (hasPendingDomMenuFor(cellEl) || isWidgetDomMenuGuard()) {
    return false;
  }
  if (shouldPreserveDomSelection(cellEl, e.clientX, e.clientY)) {
    return false;
  }
  return true;
}

/**
 * @param {MouseEvent} e
 */
function shouldSkipContextMenu(e) {
  const target = /** @type {HTMLElement} */ (e.target);
  if (!target || !target.closest) return true;
  if (
    target.closest(
      '.mda-block-handle-menu, .mda-block-handle-submenu, .mda-empty-line-insert-menu, .mda-cm-table-menu, .mda-link-edit-popover'
    )
  ) {
    return true;
  }
  return false;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {MouseEvent} e
 */
function resolveMenuContext(view, e) {
  const target = /** @type {HTMLElement} */ (e.target);
  const cmSel = view.state.selection.main;
  const hasCmSelection = cmSel.from !== cmSel.to;

  const link = getLinkAtCoords(view, e.clientX, e.clientY, e.target);
  if (link) {
    return { type: 'link', link: link };
  }

  const imgSel = getSelectedImageBlock();
  if (imgSel) {
    return { type: 'media', block: imgSel, kind: 'image' };
  }
  const imageHit = target.closest && target.closest('.mda-cm-image-block');
  if (imageHit) {
    const block = blockFromElement(/** @type {HTMLElement} */ (imageHit));
    if (block) return { type: 'media', block: block, kind: 'image' };
  }

  const mermaidSel = getSelectedMermaidBlock();
  if (mermaidSel && !target.closest('.mda-cm-mermaid-source-input')) {
    const frame = target.closest && target.closest('.mda-cm-mermaid-frame');
    if (frame && !frame.classList.contains('mda-cm-mermaid-source-mode')) {
      return { type: 'media', block: mermaidSel, kind: 'mermaid' };
    }
    if (!target.closest('.mda-cm-mermaid-source')) {
      return { type: 'media', block: mermaidSel, kind: 'mermaid' };
    }
  }
  const mermaidHit = target.closest && target.closest('.mda-cm-mermaid-block');
  if (mermaidHit && !target.closest('.mda-cm-mermaid-source-input')) {
    const frame = mermaidHit.querySelector('.mda-cm-mermaid-frame');
    if (frame && !frame.classList.contains('mda-cm-mermaid-source-mode')) {
      const block = blockFromElement(/** @type {HTMLElement} */ (mermaidHit));
      if (block) return { type: 'media', block: block, kind: 'mermaid' };
    }
  }

  const hrSel = getSelectedBlockOfKind('hr');
  if (hrSel) {
    return { type: 'media', block: hrSel, kind: 'hr' };
  }
  const hrHit = target.closest && target.closest('.mda-cm-hr-block');
  if (hrHit) {
    const block = blockFromElement(/** @type {HTMLElement} */ (hrHit));
    if (block) return { type: 'media', block: block, kind: 'hr' };
  }

  const widgetEdit = target.closest && target.closest(WIDGET_EDIT_SEL);
  if (widgetEdit) {
    const root = /** @type {HTMLElement} */ (widgetEdit);
    if (
      hasPendingDomMenuFor(root) ||
      isWidgetDomMenuGuard() ||
      shouldPreserveDomSelection(root, e.clientX, e.clientY)
    ) {
      return { type: 'dom-text', root: root };
    }
    return { type: 'dom-collapsed', root: root };
  }

  if (hasCmSelection && shouldPreserveCmSelection(view, e.clientX, e.clientY)) {
    return { type: 'text' };
  }

  const blank = hitBlankLineAt(view, e.clientX, e.clientY);
  if (blank && blank.kind === 'line') {
    return { type: 'blank', line: blank.line };
  }

  return { type: 'line' };
}

/**
 * @param {(key: string) => string} t
 * @param {boolean} disabled
 * @param {() => void} onPick
 */
function addClipboardRows(menu, t, disabled, onCopy, onCut, onPaste) {
  const copyRow = document.createElement('div');
  copyRow.className = 'mda-menu-item' + (disabled ? ' disabled' : '');
  copyRow.setAttribute('role', 'menuitem');
  copyRow.innerHTML = menuItemWithKey(t('copyBtn'), 'copy', MOD_KEY + 'C');
  if (!disabled) {
    copyRow.addEventListener('click', function (ev) {
      ev.stopPropagation();
      onCopy();
      closeContextMenu();
    });
  }
  menu.appendChild(copyRow);

  const cutRow = document.createElement('div');
  cutRow.className = 'mda-menu-item' + (disabled ? ' disabled' : '');
  cutRow.setAttribute('role', 'menuitem');
  cutRow.innerHTML = menuItemWithKey(t('blockMenuCut'), 'cut', MOD_KEY + 'X');
  if (!disabled) {
    cutRow.addEventListener('click', function (ev) {
      ev.stopPropagation();
      onCut();
      closeContextMenu();
    });
  }
  menu.appendChild(cutRow);

  const pasteRow = document.createElement('div');
  pasteRow.className = 'mda-menu-item';
  pasteRow.setAttribute('role', 'menuitem');
  pasteRow.innerHTML = menuItemWithKey(t('contextMenuPaste'), 'paste', MOD_KEY + 'V');
  pasteRow.addEventListener('click', function (ev) {
    ev.stopPropagation();
    onPaste();
    closeContextMenu();
  });
  menu.appendChild(pasteRow);
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
    menuItemInner(t(key), icon, '<span class="mda-menu-chevron" aria-hidden="true">\u203a</span>');

  row.addEventListener('mouseenter', function () {
    window.clearTimeout(subCloseTimer);
    subCloseTimer = 0;
    window.clearTimeout(subOpenTimer);
    subOpenTimer = window.setTimeout(function () {
      closeActiveSubmenu();
      activeSubmenu = submenuFactory();
      placeSubmenu(row, activeSubmenu);
    }, 100);
  });

  row.addEventListener('mouseleave', function (ev) {
    window.clearTimeout(subOpenTimer);
    subOpenTimer = 0;
    const rt = ev.relatedTarget;
    if (activeSubmenu && rt && activeSubmenu.contains(/** @type {Node} */ (rt))) return;
    window.clearTimeout(subCloseTimer);
    subCloseTimer = window.setTimeout(closeActiveSubmenu, SUB_CLOSE_MS);
  });

  menu.appendChild(row);
}

/**
 * @param {(key: string) => string} t
 * @param {{ id: string, key: string, icon?: string }[]} items
 * @param {(id: string) => void} onPick
 */
function buildSubmenu(t, items, onPick) {
  const sub = document.createElement('div');
  sub.className = 'mda-context-menu mda-block-handle-submenu';
  sub.setAttribute('role', 'menu');
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const row = document.createElement('div');
    row.className = 'mda-menu-item';
    row.setAttribute('role', 'menuitem');
    row.dataset.act = it.id;
    row.innerHTML = menuItemInner(t(it.key), it.icon);
    sub.appendChild(row);
  }
  sub.addEventListener('click', function (ev) {
    const item = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!item) return;
    ev.stopPropagation();
    onPick(item.dataset.act || '');
    closeContextMenu();
  });
  sub.addEventListener('mouseenter', function () {
    window.clearTimeout(subCloseTimer);
    subCloseTimer = 0;
  });
  sub.addEventListener('mouseleave', function () {
    window.clearTimeout(subCloseTimer);
    subCloseTimer = window.setTimeout(closeActiveSubmenu, SUB_CLOSE_MS);
  });
  return sub;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {*} liveOpts
 */
function copyCmSelection(view, liveOpts) {
  const snap = activeMenuSelection && activeMenuSelection.cm;
  if (snap) {
    restoreCmSelection(view, snap);
    const slice = sliceDocForClipboard(view.state, snap.from, snap.to);
    if (typeof liveOpts.copyText === 'function') liveOpts.copyText(slice.text);
    if (typeof liveOpts.toast === 'function' && typeof liveOpts.t === 'function') {
      liveOpts.toast(liveOpts.t('toastCopied'));
    }
    return true;
  }
  const sel = view.state.selection.main;
  if (sel.from === sel.to) return false;
  const slice = sliceDocForClipboard(view.state, sel.from, sel.to);
  if (typeof liveOpts.copyText === 'function') liveOpts.copyText(slice.text);
  if (typeof liveOpts.toast === 'function' && typeof liveOpts.t === 'function') {
    liveOpts.toast(liveOpts.t('toastCopied'));
  }
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {*} liveOpts
 */
function cutCmSelection(view, liveOpts) {
  const snap = activeMenuSelection && activeMenuSelection.cm;
  if (snap) {
    restoreCmSelection(view, snap);
    const slice = sliceDocForClipboard(view.state, snap.from, snap.to);
    if (typeof liveOpts.copyText === 'function') liveOpts.copyText(slice.text);
    view.dispatch({
      changes: { from: slice.from, to: slice.to, insert: '' },
    });
    view.focus();
    return true;
  }
  const sel = view.state.selection.main;
  if (sel.from === sel.to) return false;
  const slice = sliceDocForClipboard(view.state, sel.from, sel.to);
  if (typeof liveOpts.copyText === 'function') liveOpts.copyText(slice.text);
  view.dispatch({
    changes: { from: slice.from, to: slice.to, insert: '' },
  });
  view.focus();
  return true;
}

function hasCmMenuSelection(view) {
  const snap = activeMenuSelection && activeMenuSelection.cm;
  if (snap && snap.from < snap.to) return true;
  const sel = view.state.selection.main;
  return sel.from !== sel.to;
}

/**
 * @param {HTMLElement} menu
 * @param {(key: string) => string} t
 * @param {import('@codemirror/view').EditorView} view
 * @param {*} liveOpts
 */
function addSelectionAnnoRow(menu, t, view, liveOpts) {
  if (typeof liveOpts.onAddSelectionAnnotation !== 'function') return;
  const hasSel = hasCmMenuSelection(view);
  let selAllowed = hasSel;
  if (hasSel) {
    const sel = view.state.selection.main;
    const text = view.state.doc.toString();
    selAllowed = canUseSelectionAnnoForRange(text, sel.from, sel.to);
  }
  const row = document.createElement('div');
  row.className = 'mda-menu-item' + (selAllowed ? '' : ' disabled');
  row.setAttribute('role', 'menuitem');
  row.innerHTML = menuItemInner(t('addSelAnno'), 'anno');
  row.addEventListener('click', function (ev) {
    ev.stopPropagation();
    if (!hasCmMenuSelection(view)) return;
    const sel = view.state.selection.main;
    if (!canUseSelectionAnnoForRange(view.state.doc.toString(), sel.from, sel.to)) {
      if (typeof liveOpts.alert === 'function') liveOpts.alert(t('alertAnnoProseOnly'));
      return;
    }
    if (activeMenuSelection && activeMenuSelection.cm) {
      restoreCmSelection(view, activeMenuSelection.cm);
    }
    const anchor = anchorFromSelection(view.state);
    closeContextMenu();
    if (!anchor) {
      if (typeof liveOpts.alert === 'function') liveOpts.alert(t('alertBadSelectionEditor'));
      return;
    }
    liveOpts.onAddSelectionAnnotation(anchor);
    view.focus();
  });
  menu.appendChild(row);
}

/**
 * @param {*} liveOpts
 */
function copyDomFromMenu(liveOpts) {
  const snap = activeMenuSelection && activeMenuSelection.dom;
  const root = snap && snap.root;
  const text = snap ? snap.text : '';
  if (!root || !text) return;
  restoreDomSelection(snap);
  if (typeof liveOpts.copyText === 'function') liveOpts.copyText(text);
  if (typeof liveOpts.toast === 'function' && typeof liveOpts.t === 'function') {
    liveOpts.toast(liveOpts.t('toastCopied'));
  }
}

/**
 * @param {*} liveOpts
 */
function cutDomFromMenu(liveOpts) {
  const snap = activeMenuSelection && activeMenuSelection.dom;
  if (!snap || !snap.text) return;
  restoreDomSelection(snap);
  if (typeof liveOpts.copyText === 'function') liveOpts.copyText(snap.text);
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    sel.deleteFromDocument();
    snap.root.dispatchEvent(new Event('input', { bubbles: true }));
  }
  snap.root.focus();
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function pasteCmSelection(view) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function (text) {
      view.dispatch(view.state.replaceSelection(text == null ? '' : String(text)));
      view.focus();
    }).catch(function () { /* ignore */ });
    return;
  }
  view.focus();
}

function aiSoon(liveOpts) {
  if (typeof liveOpts.onBlockMenuSoon === 'function') {
    liveOpts.onBlockMenuSoon();
    return;
  }
  if (typeof liveOpts.toast === 'function' && typeof liveOpts.t === 'function') {
    liveOpts.toast(liveOpts.t('blockMenuSoon'));
  }
}

/**
 * @param {string} label
 * @param {string} icon
 * @param {() => void} onClick
 */
function addActionRow(menu, label, icon, onClick) {
  const row = document.createElement('div');
  row.className = 'mda-menu-item mda-menu-item-soon';
  row.setAttribute('role', 'menuitem');
  row.innerHTML = menuItemInner(label, icon);
  row.addEventListener('click', function (ev) {
    ev.stopPropagation();
    onClick();
    closeContextMenu();
  });
  menu.appendChild(row);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} x
 * @param {number} y
 * @param {*} ctx
 * @param {*} liveOpts
 */
function openContextMenu(view, x, y, ctx, liveOpts) {
  const pending = pendingMenuSelection;
  if (pending && pending.dom) setWidgetDomMenuGuard(true);
  closeBlockHandleMenu();
  closeEmptyLineInsertMenu();
  closeContextMenu();
  if (pending && pending.dom) setWidgetDomMenuGuard(true);

  ctx = adjustContextWithSelection(ctx, pending);
  activeMenuSelection = captureMenuSelection(view, ctx, pending);

  if (activeMenuSelection && activeMenuSelection.cm && (ctx.type === 'text' || ctx.type === 'link')) {
    restoreCmSelection(view, activeMenuSelection.cm);
  } else if (activeMenuSelection && activeMenuSelection.dom && ctx.type === 'dom-text') {
    restoreDomSelection(activeMenuSelection.dom);
  }

  const t = function (key) {
    return uiT(key, liveOpts.t);
  };
  const handlers = liveOpts.blockMenuHandlers;

  const menu = document.createElement('div');
  menu.className = 'mda-context-menu mda-block-handle-menu mda-cm-context-menu';
  menu.setAttribute('role', 'menu');

  if (ctx.type === 'media' && handlers) {
    const block = ctx.block;
    const kind = ctx.kind;
    addClipboardRows(
      menu,
      t,
      false,
      function () {
        handlers.onCopy(block, kind);
      },
      function () {
        handlers.onCut(block, kind);
      },
      function () {
        if (kind === 'image' && typeof liveOpts.onPasteImageBlock === 'function') {
          liveOpts.onPasteImageBlock(block);
          view.focus();
          return;
        }
        pasteCmSelection(view);
      }
    );
    addSubRow(menu, t, 'blockMenuCopyAs', 'copyAs', function () {
      return buildSubmenu(t, COPY_AS_ITEMS, function (id) {
        handlers.onCopyAs(block, kind, id);
      });
    });
    if (
      isBlockOnlyKind(kind) &&
      typeof liveOpts.onAddBlockAnnotation === 'function'
    ) {
      addActionRow(menu, t('addAnno'), 'anno', function () {
        liveOpts.onAddBlockAnnotation(block, kind);
        view.focus();
      });
    }
  } else if (ctx.type === 'link') {
    const link = ctx.link;
    addClipboardRows(
      menu,
      t,
      false,
      function () {
        if (typeof liveOpts.copyText === 'function') {
          liveOpts.copyText(view.state.sliceDoc(link.from, link.to));
        }
        if (typeof liveOpts.toast === 'function') liveOpts.toast(t('toastCopied'));
      },
      function () {
        if (typeof liveOpts.copyText === 'function') {
          liveOpts.copyText(view.state.sliceDoc(link.from, link.to));
        }
        view.dispatch({ changes: { from: link.from, to: link.to, insert: '' } });
        view.focus();
      },
      function () {
        pasteCmSelection(view);
      }
    );
    const editRow = document.createElement('div');
    editRow.className = 'mda-menu-item';
    editRow.setAttribute('role', 'menuitem');
    editRow.innerHTML = menuItemInner(t('contextMenuEditLink'), 'edit');
    editRow.addEventListener('click', function (ev) {
      ev.stopPropagation();
      closeContextMenu();
      showLinkEditPopover({
        x: x,
        y: y,
        text: link.text,
        href: link.href,
        t: liveOpts.t,
        onConfirm: function (nextText, nextHref) {
          const insert = '[' + nextText + '](' + nextHref + ')';
          view.dispatch({
            changes: { from: link.from, to: link.to, insert: insert },
            selection: { anchor: link.from + insert.length },
          });
          view.focus();
        },
      });
    });
    menu.appendChild(editRow);
  } else if (ctx.type === 'dom-text') {
    const root = ctx.root;
    addClipboardRows(
      menu,
      t,
      false,
      function () {
        copyDomFromMenu(liveOpts);
      },
      function () {
        cutDomFromMenu(liveOpts);
      },
      function () {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(function (text) {
            replaceDomSelection(root, text == null ? '' : String(text));
            root.focus();
          }).catch(function () { /* ignore */ });
        }
      }
    );
    addActionRow(menu, t('blockMenuAiEdit'), 'ai', function () {
      aiSoon(liveOpts);
    });
    addActionRow(menu, t('contextMenuAskAi'), 'askAi', function () {
      aiSoon(liveOpts);
    });
  } else if (ctx.type === 'dom-collapsed') {
    const root = ctx.root;
    addClipboardRows(
      menu,
      t,
      true,
      function () {},
      function () {},
      function () {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(function (text) {
            replaceDomSelection(root, text == null ? '' : String(text));
            root.focus();
          }).catch(function () { /* ignore */ });
        }
      }
    );
  } else if (ctx.type === 'text') {
    addClipboardRows(
      menu,
      t,
      false,
      function () {
        copyCmSelection(view, liveOpts);
      },
      function () {
        cutCmSelection(view, liveOpts);
      },
      function () {
        pasteCmSelection(view);
      }
    );
    addSelectionAnnoRow(menu, t, view, liveOpts);
    addActionRow(menu, t('blockMenuAiEdit'), 'ai', function () {
      aiSoon(liveOpts);
    });
    addActionRow(menu, t('contextMenuAskAi'), 'askAi', function () {
      aiSoon(liveOpts);
    });
  } else if (ctx.type === 'blank') {
    addClipboardRows(
      menu,
      t,
      true,
      function () {},
      function () {},
      function () {
        pasteCmSelection(view);
      }
    );
    addActionRow(menu, t('contextMenuAiWrite'), 'ai', function () {
      aiSoon(liveOpts);
    });
  } else {
    addClipboardRows(
      menu,
      t,
      true,
      function () {},
      function () {},
      function () {
        pasteCmSelection(view);
      }
    );
  }

  placeMenu(menu, x, y);
  activeMenu = menu;

  if (activeMenuSelection && activeMenuSelection.dom) {
    const domSnap = activeMenuSelection.dom;
    requestAnimationFrame(function () {
      restoreDomSelection(domSnap);
    });
  }

  dismissFn = function (ev) {
    const target = ev && ev.target;
    if (target && menu.contains(/** @type {Node} */ (target))) return;
    if (activeSubmenu && target && activeSubmenu.contains(/** @type {Node} */ (target))) return;
    closeContextMenu();
  };
  escFn = function (ev) {
    if (ev.key === 'Escape') closeContextMenu();
  };
  document.addEventListener('mousedown', dismissFn, true);
  document.addEventListener('contextmenu', dismissFn, true);
  window.addEventListener('blur', dismissFn);
  document.addEventListener('keydown', escFn, true);
}

/**
 * @param {*} liveOpts
 */
function createContextMenuExtension(liveOpts) {
  return ViewPlugin.fromClass(
    class {
      /**
       * @param {import('@codemirror/view').EditorView} view
       */
      constructor(view) {
        this.view = view;
        this._onCtx = this.onContextMenu.bind(this);
        this._onMouseDown = this.onMouseDown.bind(this);
        view.dom.addEventListener('contextmenu', this._onCtx, true);
        // document 捕获须早于各表格 onDocPointer（后注册），否则 removeAllRanges 会抢先清选区
        document.addEventListener('mousedown', this._onMouseDown, true);
      }

      /**
       * 右键 mousedown 会折叠 CM6 / contenteditable 选区；在选区内拦截并快照。
       * @param {MouseEvent} e
       */
      onMouseDown(e) {
        if (e.button !== 2) return;
        const view = this.view;
        if (!view.dom.contains(/** @type {Node} */ (e.target))) return;
        if (shouldSkipContextMenu(e)) return;

        const target = /** @type {HTMLElement} */ (e.target);
        if (target.closest && target.closest('.mda-cm-block-drag-handle')) return;

        const tableCell = target.closest && target.closest('th[contenteditable], td[contenteditable]');
        if (tableCell && !target.closest(TABLE_CHROME_SEL)) {
          const cell = /** @type {HTMLElement} */ (tableCell);
          const snap = snapshotDomSelection(cell);
          if (snap && shouldPreserveDomSelection(cell, e.clientX, e.clientY)) {
            stashDomMenuSelection(snap, e.clientX, e.clientY);
            e.preventDefault();
          } else {
            pendingMenuSelection = null;
            if (snap) {
              collapseWidgetDomAt(cell, e.clientX, e.clientY);
            }
          }
          return;
        }

        if (shouldDeferToTableMenu(view, e)) return;

        const widgetEdit = target.closest && target.closest(WIDGET_EDIT_SEL);
        if (widgetEdit) {
          const root = /** @type {HTMLElement} */ (widgetEdit);
          const snap = snapshotDomSelection(root);
          if (snap && shouldPreserveDomSelection(root, e.clientX, e.clientY)) {
            stashDomMenuSelection(snap, e.clientX, e.clientY);
            e.preventDefault();
          } else {
            pendingMenuSelection = null;
            if (snap) {
              collapseWidgetDomAt(root, e.clientX, e.clientY);
            }
          }
          return;
        }

        if (shouldPreserveCmSelection(view, e.clientX, e.clientY)) {
          const snap = snapshotCmSelection(view);
          if (snap) {
            snap._menuX = e.clientX;
            snap._menuY = e.clientY;
            pendingMenuSelection = snap;
            e.preventDefault();
          }
        } else {
          pendingMenuSelection = null;
        }
      }

      /**
       * @param {MouseEvent} e
       */
      onContextMenu(e) {
        const view = this.view;
        if (!view.dom.contains(/** @type {Node} */ (e.target))) return;
        if (shouldSkipContextMenu(e)) return;
        if (shouldDeferToTableMenu(view, e)) return;

        const target = /** @type {HTMLElement} */ (e.target);
        if (target.closest && target.closest('.mda-cm-block-drag-handle')) return;

        e.preventDefault();
        e.stopPropagation();

        const widgetEditCtx =
          target.closest && target.closest(WIDGET_EDIT_SEL);
        const tableCellCtx =
          target.closest && target.closest('th[contenteditable], td[contenteditable]');
        const menuRoot =
          widgetEditCtx ||
          (tableCellCtx && !target.closest(TABLE_CHROME_SEL) ? tableCellCtx : null);
        if (!pendingMenuSelection && menuRoot) {
          const rootEl = /** @type {HTMLElement} */ (menuRoot);
          if (shouldPreserveDomSelection(rootEl, e.clientX, e.clientY)) {
            const snap = snapshotDomSelection(rootEl);
            if (snap) {
              stashDomMenuSelection(snap, e.clientX, e.clientY);
            }
          }
        }

        pendingMenuSelection = revalidatePendingSelection(
          pendingMenuSelection,
          view,
          e.clientX,
          e.clientY
        );
        if (pendingMenuSelection && pendingMenuSelection.dom) {
          const domRoot = pendingMenuSelection.dom.root;
          finalizeCodeBlockMenuSnapshot(domRoot, pendingMenuSelection);
          restoreDomSelection(pendingMenuSelection.dom);
        }
        prepareContextSelection(view, e);
        const ctx = resolveMenuContext(view, e);
        openContextMenu(view, e.clientX, e.clientY, ctx, liveOpts || {});
      }

      destroy() {
        this.view.dom.removeEventListener('contextmenu', this._onCtx, true);
        document.removeEventListener('mousedown', this._onMouseDown, true);
        closeContextMenu();
      }
    }
  );
}

module.exports = {
  createContextMenuExtension: createContextMenuExtension,
  closeContextMenu: closeContextMenu,
  isWidgetDomMenuGuard: isWidgetDomMenuGuard,
};

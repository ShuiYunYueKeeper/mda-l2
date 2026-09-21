/**
 * 构建插入面板 DOM：版式网格 + 通用 + 图形与数据。
 */
'use strict';

const { uiT } = require('./widget-common');
const { menuIconHtml } = require('./block-menu-icons');
const {
  FORMAT_GRID_ROWS,
  findInsertMenuItem,
  INSERT_GENERAL_ITEMS,
  INSERT_CHART_ITEMS,
  INSERT_ACTION_ITEMS,
} = require('./insert-menu-items');

/**
 * @param {HTMLElement} menu
 */
function addMenuSeparator(menu) {
  const sep = document.createElement('div');
  sep.className = 'mda-menu-sep mda-insert-menu-sep';
  sep.setAttribute('aria-hidden', 'true');
  menu.appendChild(sep);
}

/**
 * @param {InsertMenuItem} it
 * @returns {string}
 */
function formatCellInner(it) {
  if (it.gridKind === 'text') {
    return '<span class="mda-insert-text-label" aria-hidden="true">T</span>';
  }
  if (it.gridKind === 'heading' && it.gridLabel) {
    return (
      '<span class="mda-insert-heading-chip" aria-hidden="true">' +
      '<span class="mda-insert-heading-h">H</span>' +
      '<span class="mda-insert-heading-n">' +
      it.gridLabel +
      '</span></span>'
    );
  }
  if (it.gridKind === 'icon' && it.icon) {
    return menuIconHtml(it.icon);
  }
  return '';
}

/**
 * @param {HTMLElement} menu
 * @param {InsertMenuItem[]} items
 * @param {(key: string) => string} t
 */
function appendInsertMenuSection(menu, labelKey, items, t) {
  const sectionLabel = document.createElement('div');
  sectionLabel.className = 'mda-insert-menu-section-label';
  sectionLabel.textContent = uiT(labelKey, t);
  menu.appendChild(sectionLabel);

  const list = document.createElement('div');
  list.className = 'mda-insert-menu-general';

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const row = document.createElement('div');
    row.className = 'mda-menu-item' + (it.soon ? ' mda-menu-item-soon' : '');
    row.setAttribute('role', 'menuitem');
    row.dataset.act = it.id;
    row.dataset.soon = it.soon ? '1' : '0';
    row.title = uiT(it.key, t);
    const sub = it.hasSub
      ? '<span class="mda-insert-menu-sub" aria-hidden="true">›</span>'
      : '';
    row.innerHTML =
      menuIconHtml(it.icon || '') +
      '<span class="mda-menu-label">' +
      uiT(it.key, t) +
      '</span>' +
      sub;
    list.appendChild(row);
  }

  menu.appendChild(list);
}

/**
 * @param {HTMLElement} menu
 * @param {(key: string) => string} t
 * @param {(id: string, soon: boolean) => void} onPick
 */
function appendInsertMenuPanel(menu, t, onPick) {
  const gridWrap = document.createElement('div');
  gridWrap.className = 'mda-insert-format-grid-wrap';
  gridWrap.setAttribute('role', 'group');

  const grid = document.createElement('div');
  grid.className = 'mda-insert-format-grid';

  for (let r = 0; r < FORMAT_GRID_ROWS.length; r++) {
    const rowIds = FORMAT_GRID_ROWS[r];
    for (let c = 0; c < rowIds.length; c++) {
      const id = rowIds[c];
      if (!id) {
        const spacer = document.createElement('span');
        spacer.className = 'mda-insert-format-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        grid.appendChild(spacer);
        continue;
      }
      const it = findInsertMenuItem(id);
      if (!it) continue;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'mda-insert-format-cell';
      cell.dataset.act = it.id;
      cell.dataset.soon = '0';
      cell.setAttribute('role', 'menuitem');
      cell.title = uiT(it.key, t);
      cell.setAttribute('aria-label', uiT(it.key, t));
      cell.innerHTML = formatCellInner(it);
      grid.appendChild(cell);
    }
  }

  gridWrap.appendChild(grid);
  menu.appendChild(gridWrap);

  addMenuSeparator(menu);
  appendInsertMenuSection(menu, 'insertMenuGeneral', INSERT_GENERAL_ITEMS, t);
  addMenuSeparator(menu);
  appendInsertMenuSection(menu, 'insertMenuCharts', INSERT_CHART_ITEMS, t);
  addMenuSeparator(menu);
  appendInsertMenuSection(menu, 'insertMenuActions', INSERT_ACTION_ITEMS, t);

  menu.addEventListener('click', function (e) {
    const item = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!item) return;
    e.stopPropagation();
    const id = item.dataset.act || '';
    const soon = item.dataset.soon === '1';
    onPick(id, soon);
  });
}

module.exports = {
  appendInsertMenuPanel: appendInsertMenuPanel,
  addMenuSeparator: addMenuSeparator,
  INSERT_ACTION_ITEMS: INSERT_ACTION_ITEMS,
};

/**
 * 插入菜单：版式网格 + 通用 + 图形与数据（对齐竞品 insert-menu.png）。
 */
'use strict';

/** @typedef {{ id: string, key: string, soon?: boolean, icon?: string, gridLabel?: string, gridKind?: 'text'|'heading'|'list'|'icon', hasSub?: boolean }} InsertMenuItem */

/** @type {InsertMenuItem[]} */
const INSERT_FORMAT_ITEMS = [
  { id: 'text', key: 'insertMenuBodyText', gridLabel: 'T', gridKind: 'text' },
  { id: 'h1', key: 'insertMenuHeading1', gridLabel: '1', gridKind: 'heading' },
  { id: 'h2', key: 'insertMenuHeading2', gridLabel: '2', gridKind: 'heading' },
  { id: 'h3', key: 'insertMenuHeading3', gridLabel: '3', gridKind: 'heading' },
  { id: 'h4', key: 'insertMenuHeading4', gridLabel: '4', gridKind: 'heading' },
  { id: 'h5', key: 'insertMenuHeading5', gridLabel: '5', gridKind: 'heading' },
  { id: 'h6', key: 'insertMenuHeading6', gridLabel: '6', gridKind: 'heading' },
  { id: 'bullet', key: 'insertMenuBulletList', gridKind: 'icon', icon: 'bulletList' },
  { id: 'ordered', key: 'insertMenuOrderedList', gridKind: 'icon', icon: 'orderedList' },
  { id: 'task', key: 'insertMenuTaskList', gridKind: 'icon', icon: 'taskList' },
];

/** 5 列网格（竞品：上排 T + H1–H4，下排 H5–H6 + 三种列表） */
const FORMAT_GRID_ROWS = [
  ['text', 'h1', 'h2', 'h3', 'h4'],
  ['h5', 'h6', 'bullet', 'ordered', 'task'],
];

/** @type {InsertMenuItem[]} */
const INSERT_GENERAL_ITEMS = [
  { id: 'image', key: 'blockMenuInsertImage', icon: 'image' },
  { id: 'table', key: 'blockMenuInsertTable', icon: 'table', hasSub: true },
  { id: 'code', key: 'blockMenuInsertCode', icon: 'code' },
  { id: 'quote', key: 'blockMenuInsertQuote', icon: 'quote' },
  { id: 'link', key: 'insertMenuLink', icon: 'link' },
  { id: 'hr', key: 'blockMenuInsertHr', icon: 'hr' },
];

/** @type {InsertMenuItem[]} */
const INSERT_CHART_ITEMS = [
  { id: 'mermaid', key: 'blockMenuInsertMermaid', icon: 'mermaid' },
];

/** @type {Record<string, InsertMenuItem>} */
const ITEM_MAP = Object.create(null);

function indexItems(list) {
  for (let i = 0; i < list.length; i++) {
    ITEM_MAP[list[i].id] = list[i];
  }
}

indexItems(INSERT_FORMAT_ITEMS);
indexItems(INSERT_GENERAL_ITEMS);
indexItems(INSERT_CHART_ITEMS);

/**
 * @param {string} id
 * @returns {InsertMenuItem | null}
 */
function findInsertMenuItem(id) {
  return ITEM_MAP[id] || null;
}

module.exports = {
  INSERT_FORMAT_ITEMS: INSERT_FORMAT_ITEMS,
  INSERT_GENERAL_ITEMS: INSERT_GENERAL_ITEMS,
  INSERT_CHART_ITEMS: INSERT_CHART_ITEMS,
  FORMAT_GRID_ROWS: FORMAT_GRID_ROWS,
  findInsertMenuItem: findInsertMenuItem,
};

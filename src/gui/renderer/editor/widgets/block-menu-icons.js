/**
 * 块手柄 / 插入菜单 / 右键菜单图标（Lucide，见 lucide-icons.generated.js）。
 */
'use strict';

const { LUCIDE_ICONS } = require('../lucide-icons.generated');

/** @type {Record<string, string>} */
const ICONS = LUCIDE_ICONS;

/**
 * @param {number} level 1–6
 * @returns {string}
 */
function headingLevelIconHtml(level) {
  const lv = Math.max(1, Math.min(6, level || 1));
  const kind = 'h' + lv;
  return (
    '<span class="mda-cm-block-type-icon mda-cm-heading-level-icon" aria-hidden="true" data-kind="' +
    kind +
    '"><span class="mda-cm-heading-level-label">' +
    '<span class="mda-cm-heading-level-h">H</span>' +
    '<span class="mda-cm-heading-level-n">' +
    lv +
    '</span></span></span>'
  );
}

/** @type {Record<string, string>} */
const BLOCK_KIND_ICON = {
  image: 'image',
  mermaid: 'mermaid',
  math: 'math',
  table: 'table',
  code: 'code',
  quote: 'quote',
  heading: 'heading',
  hr: 'hr',
};

/**
 * @param {string} name
 * @returns {string}
 */
function menuIconHtml(name) {
  const svg = ICONS[name] || '';
  if (!svg) return '';
  return '<span class="mda-menu-icon" aria-hidden="true">' + svg + '</span>';
}

/**
 * 块手柄左侧类型图标。
 * @param {string} [blockKind]
 * @returns {string}
 */
function blockTypeIconHtml(blockKind) {
  const hk = /^h([1-6])$/.exec(blockKind || '');
  if (hk) return headingLevelIconHtml(parseInt(hk[1], 10));
  const key = BLOCK_KIND_ICON[blockKind || ''] || '';
  const svg = key ? ICONS[key] : '';
  if (!svg) return '';
  return (
    '<span class="mda-cm-block-type-icon" aria-hidden="true" data-kind="' +
    (blockKind || '') +
    '">' +
    svg +
    '</span>'
  );
}

module.exports = {
  menuIconHtml: menuIconHtml,
  blockTypeIconHtml: blockTypeIconHtml,
  headingLevelIconHtml: headingLevelIconHtml,
  BLOCK_KIND_ICON: BLOCK_KIND_ICON,
  ICONS: ICONS,
};

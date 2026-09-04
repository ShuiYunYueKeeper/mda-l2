/**
 * 常驻编辑工具栏图标（Lucide，见 lucide-icons.generated.js）。
 */
'use strict';

const {
  LUCIDE_ICONS,
  TOOLBAR_ICON_NAMES,
} = require('./lucide-icons.generated');

/**
 * @param {string} name
 * @returns {string}
 */
function toolbarIconHtml(name) {
  const svg = LUCIDE_ICONS[name] || '';
  if (!svg) return '';
  return '<span class="mda-cm-tb-icon" aria-hidden="true">' + svg + '</span>';
}

module.exports = {
  toolbarIconHtml: toolbarIconHtml,
  TOOLBAR_ICON_NAMES: TOOLBAR_ICON_NAMES,
  TOOLBAR_ICONS: LUCIDE_ICONS,
};

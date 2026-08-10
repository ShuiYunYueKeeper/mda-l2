/**
 * 块手柄菜单 / 块类型图标（内联 SVG，16×16）。
 */
'use strict';

/** @type {Record<string, string>} */
const ICONS = {
  ai: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2l1 3h3l-2.5 2 1 3L8 8l-2.5 2 1-3L4 5h3z"/></svg>',
  insertAbove:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 10h10M8 3v7"/><path d="M5.5 6.5L8 4l2.5 2.5"/></svg>',
  insertBelow:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 6h10M8 13V6"/><path d="M5.5 9.5L8 12l2.5-2.5"/></svg>',
  copy:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5.5" y="5.5" width="7" height="7" rx="1"/><path d="M4 10.5H3.5a1 1 0 01-1-1v-7a1 1 0 011-1H9a1 1 0 011 1V4"/></svg>',
  copyAs:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5.5" y="5.5" width="7" height="7" rx="1"/><path d="M4 10.5H3.5a1 1 0 01-1-1v-7a1 1 0 011-1H9a1 1 0 011 1V4"/></svg>',
  markdown:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3.5" y="2.5" width="9" height="11" rx="1"/><path d="M5.5 11V5.2l1.6 3.4h.8L9.5 5.2V11"/><path d="M11.2 5.5h1.3v5.5h-1.3z" fill="currentColor" stroke="none"/></svg>',
  copyAsImage:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/><circle cx="5.8" cy="6.6" r="1.15"/><path d="M3.5 11.2l2.8-2.3 2 1.4 2.4-2.1 2.3 3"/></svg>',
  cut: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="4.5" cy="4.5" r="1.8"/><circle cx="4.5" cy="11.5" r="1.8"/><path d="M6.2 6l3.6 4M6.2 10l3.6-4l3.2 1.8"/></svg>',
  paste:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5.5" y="2.5" width="7" height="9" rx="1"/><path d="M4 4.5H3.5a1.5 1.5 0 010-3H7a1.5 1.5 0 011.4 1"/><path d="M8 9.5v3M6.5 11h3"/></svg>',
  edit:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 13h2.5l7.2-7.2a1.2 1.2 0 00-1.7-1.7L3.8 11.3V13z"/><path d="M9.5 4.5l2 2"/></svg>',
  askAi:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.5 4.5h9a1 1 0 011 1v5a1 1 0 01-1 1H7l-2.5 2v-2H3.5a1 1 0 01-1-1v-5a1 1 0 011-1z"/><circle cx="6" cy="8" r=".55" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r=".55" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r=".55" fill="currentColor" stroke="none"/></svg>',
  delete:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.5 5h9l-.8 8.2a1 1 0 01-1 .8H5.3a1 1 0 01-1-.8L3.5 5z"/><path d="M2.5 5h11M6.5 5V3.8a1 1 0 011-1h1a1 1 0 011 1V5"/></svg>',
  continue:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 12l3-8 3 5 2-3"/></svg>',
  companion:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 8h7M10 5v6"/><path d="M12.5 6.5l1.5 1.5-1.5 1.5"/></svg>',
  polish:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 13l7-7 3 3-7 7H3v-3z"/><path d="M9 4l2 2"/></svg>',
  expand:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 6h8M4 8.5h6M4 11h4"/></svg>',
  shorten:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 6h8M4 9h5"/></svg>',
  grammar:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 4h8v8H4z"/><path d="M6 8h4M6 10.5h2.5"/></svg>',
  explain:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.5"/><path d="M8 7v3.5"/><circle cx="8" cy="5.2" r=".8" fill="currentColor" stroke="none"/></svg>',
  translate:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 4.5h6M5.5 4.5V3M4 8.5h5M11 4l2.5 2.5L11 9"/><path d="M11 11.5h2.5"/></svg>',
  summarize:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 4h8M4 7h8M4 10h5"/></svg>',
  more: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="4" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="12" cy="8" r="1.1"/></svg>',
  // 块类型（手柄左侧）
  image:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/><circle cx="5.8" cy="6.6" r="1.15"/><path d="M3.5 11.2l2.8-2.3 2 1.4 2.4-2.1 2.3 3"/></svg>',
  table:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="10" height="10" rx="1"/><path d="M3 8h10M8 3v10"/></svg>',
  code: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M6.2 3.5C4.6 3.5 4 4.6 4 5.8v1.1c0 .9-.4 1.3-1.2 1.3.8 0 1.2.4 1.2 1.3v1.1c0 1.2.6 2.3 2.2 2.3M9.8 3.5c1.6 0 2.2 1.1 2.2 2.3v1.1c0 .9.4 1.3 1.2 1.3-.8 0-1.2.4-1.2 1.3v1.1c0 1.2-.6 2.3-2.2 2.3"/></svg>',
  quote:
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.2 11.5V8.2C3.2 5.6 4.8 3.8 7.2 3.2l.4 1.4c-1.5.4-2.4 1.5-2.4 3.1h2.1v3.8H3.2zm5.7 0V8.2c0-2.6 1.6-4.4 4-5l.4 1.4c-1.5.4-2.4 1.5-2.4 3.1h2.1v3.8H8.9z"/></svg>',
  mermaid:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3.5 5.5V3.5h2M10.5 3.5h2v2M12.5 10.5v2h-2M5.5 12.5h-2v-2"/></svg>',
  math: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5h3.2M5.6 4.5v7M4 11.5h3.2M9.2 5.2l3.6 5.6M12.8 5.2l-3.6 5.6"/></svg>',
  hr: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 8h10"/></svg>',
};

/** @type {Record<string, string>} */
const BLOCK_KIND_ICON = {
  image: 'image',
  mermaid: 'mermaid',
  math: 'math',
  table: 'table',
  code: 'code',
  quote: 'quote',
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
  BLOCK_KIND_ICON: BLOCK_KIND_ICON,
  ICONS: ICONS,
};

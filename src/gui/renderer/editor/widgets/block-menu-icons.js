/**
 * 块手柄菜单图标（内联 SVG，16×16）。
 */
'use strict';

/** @type {Record<string, string>} */
const ICONS = {
  ai: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2l1 3h3l-2.5 2 1 3L8 8l-2.5 2 1-3L4 5h3z"/></svg>',
  insertAbove:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 10h10M8 3v7"/><path d="M5.5 6.5L8 4l2.5 2.5"/></svg>',
  insertBelow:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 6h10M8 13V6"/><path d="M5.5 9.5L8 12l2.5-2.5"/></svg>',
  copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5.5" y="5.5" width="7" height="7" rx="1"/><path d="M4 10.5H3.5a1 1 0 01-1-1v-7a1 1 0 011-1H9a1 1 0 011 1V4"/></svg>',
  cut: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="4.5" cy="4.5" r="1.8"/><circle cx="4.5" cy="11.5" r="1.8"/><path d="M6.2 6l3.6 4M6.2 10l3.6-4l3.2 1.8"/></svg>',
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
  image:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2.5" y="3.5" width="11" height="9" rx="1"/><circle cx="5.8" cy="6.8" r="1.2"/><path d="M3.5 11.5l3-2.5 2 1.5 2.5-2 1.5 3.5"/></svg>',
  table:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3.5" width="10" height="9" rx="1"/><path d="M3 7h10M8 3.5v9M6 7v5.5M10 7v5.5"/></svg>',
  code: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5.5 4.5L2.5 8l3 3.5M10.5 4.5l3 3.5-3 3.5"/></svg>',
  quote:
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 5.5c0-1.5 1-2.5 2.5-2.5.8 0 1.5.3 2 .8-.8.3-1.5 1-1.5 2 0 1.2 1 2.2 2.2 2.2H4.5V11H3V5.5zm6 0c0-1.5 1-2.5 2.5-2.5.8 0 1.5.3 2 .8-.8.3-1.5 1-1.5 2 0 1.2 1 2.2 2.2 2.2H10.5V11H9V5.5z"/></svg>',
  highlight:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 13l3-1 7-7-2-2-7 7-1 3z"/><path d="M10 4l2 2"/></svg>',
  mermaid:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="4.5" height="3" rx=".8"/><rect x="9.5" y="2.5" width="4.5" height="3" rx=".8"/><rect x="5.5" y="10.5" width="5" height="3" rx=".8"/><path d="M4.2 5.5v2.2h7.6V8.2M8 8.2v2.3"/></svg>',
  hr: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 8h10"/></svg>',
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

module.exports = {
  menuIconHtml: menuIconHtml,
  ICONS: ICONS,
};

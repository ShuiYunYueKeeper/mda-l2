/**
 * 从 lucide（ISC）生成 GUI 统一图标集 lucide-icons.generated.js。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const lucide = require('lucide');
const { iconSvg } = require('./lucide-icon-svg');

const OUT = path.join(__dirname, '..', 'src', 'gui', 'renderer', 'editor', 'lucide-icons.generated.js');

/** @type {Record<string, keyof typeof lucide>} */
const ICON_MAP = {
  // —— 编辑工具栏 ——
  cut: 'Scissors',
  copy: 'Copy',
  paste: 'ClipboardPaste',
  undo: 'Undo2',
  redo: 'Redo2',
  formatBrush: 'Paintbrush',
  clearFormat: 'RemoveFormatting',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  textColor: 'Baseline',
  highlight: 'Highlighter',
  superscript: 'Superscript',
  code: 'Code',
  task: 'ListTodo',
  ul: 'List',
  ol: 'ListOrdered',
  save: 'Save',
  print: 'Printer',
  find: 'Search',
  comment: 'MessageSquare',
  copyPreview: 'ClipboardCopy',
  export: 'FileDown',
  ai: 'Sparkles',
  // —— 块手柄 / 插入 / 右键菜单 ——
  insertAbove: 'ArrowUpFromLine',
  insertBelow: 'ArrowDownFromLine',
  copyAs: 'Copy',
  markdown: 'FileText',
  copyAsImage: 'Image',
  edit: 'SquarePen',
  anno: 'MessageSquare',
  askAi: 'Bot',
  delete: 'Trash2',
  continue: 'PenLine',
  companion: 'Users',
  polish: 'Wand2',
  expand: 'Maximize2',
  shorten: 'Shrink',
  grammar: 'SpellCheck',
  explain: 'CircleHelp',
  translate: 'Languages',
  summarize: 'ScrollText',
  more: 'Ellipsis',
  bulletList: 'List',
  orderedList: 'ListOrdered',
  taskList: 'ListTodo',
  image: 'Image',
  table: 'Table',
  quote: 'Quote',
  mermaid: 'Workflow',
  math: 'Sigma',
  hr: 'Minus',
  heading: 'Heading',
  link: 'Link',
  cloud: 'Cloud',
  folder: 'Folder',
  columns: 'Columns2',
  date: 'Calendar',
  media: 'CirclePlay',
  emoji: 'Smile',
  template: 'LayoutTemplate',
  shield: 'Shield',
  whiteboard: 'Presentation',
  mindmap: 'GitBranch',
  flowchart: 'Network',
  spreadsheet: 'Sheet',
  multitable: 'LayoutGrid',
  menu: 'Menu',
};

/** @type {readonly string[]} */
const TOOLBAR_ICON_NAMES = [
  'undo',
  'redo',
  'clearFormat',
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'task',
  'ul',
  'ol',
  'save',
  'find',
  'comment',
  'copyPreview',
  'export',
  'ai',
];

const lines = [];
lines.push('/**');
lines.push(' * MDA GUI 统一 Lucide 图标（24×24 描边矢量，由 scripts/generate-gui-icons.js 生成）。');
lines.push(' * 源：lucide v' + require('lucide/package.json').version + '（ISC）');
lines.push(' * 重新生成：npm run generate:gui-icons');
lines.push(" */");
lines.push("'use strict';");
lines.push('');
lines.push('/** @type {readonly string[]} */');
lines.push('const LUCIDE_ICON_NAMES = [');
Object.keys(ICON_MAP).forEach(function (key) {
  lines.push("  '" + key + "',");
});
lines.push('];');
lines.push('');
lines.push('/** @type {readonly string[]} */');
lines.push('const TOOLBAR_ICON_NAMES = [');
TOOLBAR_ICON_NAMES.forEach(function (key) {
  lines.push("  '" + key + "',");
});
lines.push('];');
lines.push('');
lines.push('/** @type {Record<string, string>} */');
lines.push('const LUCIDE_ICONS = {');

Object.keys(ICON_MAP).forEach(function (key) {
  const lucideName = ICON_MAP[key];
  const node = lucide[lucideName];
  if (!node) {
    throw new Error('Missing lucide icon: ' + lucideName + ' for key ' + key);
  }
  lines.push('  ' + key + ': ' + JSON.stringify(iconSvg(node)) + ',');
});

lines.push('};');
lines.push('');
lines.push('module.exports = {');
lines.push('  LUCIDE_ICONS: LUCIDE_ICONS,');
lines.push('  LUCIDE_ICON_NAMES: LUCIDE_ICON_NAMES,');
lines.push('  TOOLBAR_ICON_NAMES: TOOLBAR_ICON_NAMES,');
lines.push('};');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), { encoding: 'utf8' });
process.stdout.write('  generated: ' + OUT + '\n');

const CHROME_OUT = path.join(__dirname, '..', 'src', 'gui', 'renderer', 'gui-chrome-icons.js');
const chromeKeys = ['menu'];
const chromeLines = [];
chromeLines.push('/**');
chromeLines.push(' * 壳层按钮 Lucide 图标（由 scripts/generate-gui-icons.js 生成）。');
chromeLines.push(" */");
chromeLines.push('(function (global) {');
chromeLines.push("  'use strict';");
chromeLines.push('  global.MDAGuiIcons = {');
chromeKeys.forEach(function (key) {
  const lucideName = ICON_MAP[key];
  const node = lucide[lucideName];
  if (!node) throw new Error('Missing chrome icon: ' + key);
  chromeLines.push('    ' + key + ': ' + JSON.stringify(iconSvg(node)) + ',');
});
chromeLines.push('  };');
chromeLines.push("})(typeof window !== 'undefined' ? window : this);");
chromeLines.push('');
fs.writeFileSync(CHROME_OUT, chromeLines.join('\n'), { encoding: 'utf8' });
process.stdout.write('  generated: ' + CHROME_OUT + '\n');

/**
 * 块手柄 / 插入 / 右键菜单 Lucide 图标
 */
import * as path from 'path';

const { menuIconHtml, ICONS } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/block-menu-icons.js'
));

const MENU_REQUIRED = [
  'insertAbove',
  'insertBelow',
  'copy',
  'cut',
  'paste',
  'delete',
  'image',
  'table',
  'code',
  'mermaid',
  'link',
  'bulletList',
  'askAi',
];

describe('block menu Lucide icons', () => {
  test('常用菜单图标齐全且为 Lucide 24 描边 SVG', () => {
    for (const name of MENU_REQUIRED) {
      expect(ICONS[name]).toBeTruthy();
      const html = menuIconHtml(name);
      expect(html).toContain('mda-menu-icon');
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html).toContain('stroke="currentColor"');
    }
  });
});

/**
 * 编辑工具栏 Lucide 图标集
 */
import * as path from 'path';

const {
  toolbarIconHtml,
  TOOLBAR_ICON_NAMES,
  TOOLBAR_ICONS,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/toolbar-icons.js'));

const REQUIRED = [
  'undo',
  'redo',
  'clearFormat',
  'bold',
  'italic',
  'strike',
  'code',
  'ul',
  'ol',
  'task',
  'find',
  'comment',
  'save',
  'ai',
  'copyPreview',
  'export',
];

describe('toolbar Lucide icons', () => {
  test('TOOLBAR_ICON_NAMES 与 TOOLBAR_ICONS 键一致', () => {
    // TOOLBAR_ICONS 是完整图标集（TOOLBAR_ICON_NAMES 为其子集），故逐名校验存在性。
    for (const name of TOOLBAR_ICON_NAMES) {
      expect(TOOLBAR_ICONS[name]).toBeTruthy();
    }
  });

  test('必需图标齐全且为 Lucide 24 描边 SVG', () => {
    for (const name of REQUIRED) {
      expect(TOOLBAR_ICONS[name]).toBeTruthy();
      const html = toolbarIconHtml(name);
      expect(html).toContain('mda-cm-tb-icon');
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html).toContain('stroke="currentColor"');
      expect(html).toContain('<svg');
    }
  });

  test('未知图标返回空字符串', () => {
    expect(toolbarIconHtml('not-a-real-icon')).toBe('');
  });
});

/**
 * 块手柄类型图标
 */
import * as path from 'path';

const {
  blockTypeIconHtml,
  BLOCK_KIND_ICON,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/block-menu-icons.js'
));
const { buildHandleInnerHtml, HANDLE_HIDE_MS } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/block-drag-handle.js'
));

describe('block handle type icons', () => {
  const kinds = [
    'image',
    'mermaid',
    'math',
    'table',
    'code',
    'quote',
    'highlight',
    'hr',
  ];

  test('每种块都有类型图标映射', () => {
    for (const kind of kinds) {
      expect(BLOCK_KIND_ICON[kind]).toBeTruthy();
      const html = blockTypeIconHtml(kind);
      expect(html).toContain('mda-cm-block-type-icon');
      expect(html).toContain('<svg');
      expect(html).toContain('data-kind="' + kind + '"');
    }
  });

  test('手柄 HTML 含类型图标与六点 grip', () => {
    for (const kind of kinds) {
      const html = buildHandleInnerHtml(kind);
      expect(html).toContain('mda-cm-block-type-icon');
      expect(html).toContain('mda-cm-block-drag-grip');
      expect((html.match(/<i><\/i>/g) || []).length).toBe(6);
    }
  });

  test('未知 kind 仅保留 grip', () => {
    const html = buildHandleInnerHtml('unknown');
    expect(html).not.toContain('mda-cm-block-type-icon');
    expect(html).toContain('mda-cm-block-drag-grip');
  });

  test('手柄移出延迟隐藏常数合理', () => {
    expect(HANDLE_HIDE_MS).toBe(200);
  });
});

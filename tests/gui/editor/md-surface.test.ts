import * as path from 'path';

const { htmlFromRender } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/md-surface.js'
));

describe('md-surface htmlFromRender', () => {
  test('接受字符串返回值', () => {
    expect(htmlFromRender('|a|', () => '<table></table>')).toBe('<table></table>');
  });

  test('接受 { success, html }', () => {
    expect(
      htmlFromRender('x', () => ({ success: true, html: '<p>x</p>' }))
    ).toBe('<p>x</p>');
  });

  test('无 renderMarkdown 时为空', () => {
    expect(htmlFromRender('x')).toBe('');
  });
});

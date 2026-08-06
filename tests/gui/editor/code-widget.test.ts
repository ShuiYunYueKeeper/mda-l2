/**
 * M8-C4：围栏代码块 widget 辅助函数
 */
import * as path from 'path';

const { buildLineNumbers, highlightHtmlWithTrailingLines } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/code.js'
));

describe('code widget helpers', () => {
  test('buildLineNumbers 按行数生成', () => {
    expect(buildLineNumbers('a\nb\nc')).toBe('1\n2\n3');
    expect(buildLineNumbers('')).toBe('1');
  });

  test('highlightHtmlWithTrailingLines 为尾部换行补 br', () => {
    expect(highlightHtmlWithTrailingLines('line', 'line\n')).toBe('line<br>');
    expect(highlightHtmlWithTrailingLines('ab', 'ab\n\n')).toBe('ab<br><br>');
    expect(highlightHtmlWithTrailingLines('x', 'x')).toBe('x');
  });
});

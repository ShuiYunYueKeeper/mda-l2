/**
 * S15/S16 公式扫描与序列化
 */
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  findMathRanges,
  parseMathInline,
  parseMathBlock,
  serializeMathInline,
  serializeMathBlock,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/model/parse-math.js'));

describe('parse-math (S15/S16)', () => {
  test('行内公式 $...$', () => {
    const text = '质能 $E = mc^2$ 关系';
    const ranges = findMathRanges(text);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      kind: 'math-inline',
      tex: 'E = mc^2',
    });
    expect(text.slice(ranges[0].from, ranges[0].to)).toBe('$E = mc^2$');
  });

  test('块级公式 $$...$$ 多行', () => {
    const text = '前文\n$$\n\\sum_{n=1}^{\\infty} \\frac{1}{n^2}\n$$\n后文';
    const ranges = findMathRanges(text);
    expect(ranges.some((r: { kind: string }) => r.kind === 'math-block')).toBe(true);
    const block = ranges.find((r: { kind: string }) => r.kind === 'math-block');
    expect(block.tex).toContain('\\sum');
  });

  test('围栏内 $...$ 不识别为公式', () => {
    const text = '```text\n$E = mc^2$\n```';
    const ranges = findMathRanges(text);
    expect(ranges).toHaveLength(0);
  });

  test('行内代码内 $ 不识别', () => {
    const text = '使用 `$x$` 变量';
    const ranges = findMathRanges(text);
    expect(ranges).toHaveLength(0);
  });

  test('serialize / parse 往返', () => {
    const inline = serializeMathInline('a^2+b^2');
    expect(parseMathInline(inline)).toEqual({ tex: 'a^2+b^2' });
    const block = serializeMathBlock('x^2');
    expect(parseMathBlock(block)).toEqual({ tex: 'x^2' });
  });

  test('块级单行 $$x$$', () => {
    const text = '$$E=mc^2$$';
    const ranges = findMathRanges(text);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].kind).toBe('math-block');
    expect(ranges[0].tex).toBe('E=mc^2');
  });
});

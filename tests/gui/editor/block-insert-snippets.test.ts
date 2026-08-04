import * as path from 'path';

const {
  getInsertSnippet,
  caretOffsetInSnippet,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/block-insert-snippets.js'
));

describe('block-insert-snippets', () => {
  test('quote 片段存在；不做高亮块', () => {
    expect(getInsertSnippet('quote')).toBe('> ');
    expect(getInsertSnippet('highlight')).toBeNull();
  });

  test('caret 落在可输入位置', () => {
    const quote = getInsertSnippet('quote')!;
    expect(caretOffsetInSnippet('quote', quote)).toBe(quote.length);

    const code = getInsertSnippet('code')!;
    expect(caretOffsetInSnippet('code', code)).toBe(4);
  });
});

describe('isEmptyQuoteLineText', () => {
  const { isEmptyQuoteLineText } = require(path.join(
    __dirname,
    '../../../src/gui/renderer/editor/widgets/quote-handle.js'
  ));

  test('空引用判定', () => {
    expect(isEmptyQuoteLineText('> ')).toBe(true);
    expect(isEmptyQuoteLineText('>')).toBe(true);
    expect(isEmptyQuoteLineText('> hello')).toBe(false);
  });
});

import * as path from 'path';

const {
  getInsertSnippet,
  caretOffsetInSnippet,
  planLineOrientedInsert,
  formatBlankLineInsert,
  hrLeadingNewline,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/block-insert-snippets.js'
));

describe('block-insert-snippets', () => {
  test('quote 片段存在；不做高亮块', () => {
    expect(getInsertSnippet('quote')).toBe('> ');
    expect(getInsertSnippet('text')).toBe('');
    expect(getInsertSnippet('highlight')).toBeNull();
  });

  test('caret 落在可输入位置', () => {
    const quote = getInsertSnippet('quote')!;
    expect(caretOffsetInSnippet('quote', quote)).toBe(quote.length);

    const code = getInsertSnippet('code')!;
    expect(caretOffsetInSnippet('code', code)).toBe(4);

    const h2 = getInsertSnippet('h2')!;
    expect(h2).toBe('## ');
    expect(caretOffsetInSnippet('h2', h2)).toBe(h2.length);

    const ordered = getInsertSnippet('ordered')!;
    expect(caretOffsetInSnippet('ordered', ordered)).toBe(3);

    const task = getInsertSnippet('task')!;
    expect(caretOffsetInSnippet('task', task)).toBe(6);
  });

  test('planLineOrientedInsert：上/下方独占新行', () => {
    const h2 = getInsertSnippet('h2')!;
    const above = planLineOrientedInsert('above', 10, 18, 'h2', h2);
    expect(above).toEqual({ pos: 10, insert: '## \n', caret: 13 });

    const below = planLineOrientedInsert('below', 10, 18, 'h2', h2);
    expect(below).toEqual({ pos: 18, insert: '\n## ', caret: 22 });

    const bodyBelow = planLineOrientedInsert('below', 10, 18, 'text', '');
    expect(bodyBelow).toEqual({ pos: 18, insert: '\n', caret: 19 });

    const bulletAbove = planLineOrientedInsert('above', 0, 5, 'bullet', '- ');
    expect(bulletAbove).toEqual({ pos: 0, insert: '- \n', caret: 2 });
  });

  test('formatBlankLineInsert：HR 在段后空白行插入补前导空行', () => {
    const doc = {
      line: function (n: number) {
        if (n === 1) return { number: 1, from: 0, to: 5, text: 'hello' };
        return { number: 2, from: 6, to: 6, text: '' };
      },
      lineAt: function (pos: number) {
        if (pos <= 5) return { number: 1, from: 0, to: 5, text: 'hello' };
        return { number: 2, from: 6, to: 6, text: '' };
      },
      sliceString: function () {
        return '\n';
      },
    };
    const hr = getInsertSnippet('hr')!;
    expect(formatBlankLineInsert('hr', hr, doc, { number: 2 })).toEqual({
      insert: '\n---',
      caretOffset: 0,
    });
    expect(formatBlankLineInsert('quote', '> ', doc, { number: 2 })).toEqual({
      insert: '> ',
      caretOffset: 2,
    });
  });

  test('hrLeadingNewline：段后无空行时补 \\n', () => {
    const doc = {
      line: function (n: number) {
        if (n === 1) return { number: 1, from: 0, to: 5, text: 'hello' };
        return { number: 2, from: 6, to: 6, text: '' };
      },
      lineAt: function (pos: number) {
        if (pos <= 5) return { number: 1, from: 0, to: 5, text: 'hello' };
        return { number: 2, from: 6, to: 6, text: '' };
      },
      sliceString: function (a: number, b: number) {
        return a === 5 && b === 6 ? '\n' : '';
      },
    };
    expect(hrLeadingNewline(doc, 6)).toBe('\n');
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

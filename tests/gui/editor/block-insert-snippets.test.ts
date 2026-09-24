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

    const mermaid = getInsertSnippet('mermaid')!;
    expect(mermaid.endsWith('\n')).toBe(false);
    expect(caretOffsetInSnippet('mermaid', mermaid)).toBe(mermaid.length + 1);
  });

  test('formatBlankLineInsert：流程图后补空白行且光标在行首', () => {
    const doc = {
      line: function () {
        return { number: 1, from: 0, to: 0, text: '' };
      },
      lineAt: function () {
        return { number: 1, from: 0, to: 0, text: '' };
      },
    };
    const mermaid = getInsertSnippet('mermaid')!;
    const planned = formatBlankLineInsert('mermaid', mermaid, doc, { number: 1, from: 0 });
    expect(planned.insert).toBe(mermaid + '\n');
    expect(planned.caretOffset).toBe(planned.insert.length);
    expect(planned.insert.endsWith('```\n')).toBe(true);
  });

  test('planMermaidInsert：近旁插入也保证围栏后空白行', () => {
    const { planMermaidInsert } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/widgets/block-insert-snippets.js'
    ));
    const mermaid = getInsertSnippet('mermaid')!;
    // 已有尾随 \n
    const a = planMermaidInsert(10, mermaid + '\n', mermaid);
    expect(a.insert).toBe(mermaid + '\n');
    expect(a.caret).toBe(10 + mermaid.length + 1);
    // 缺少尾随 \n 时补上
    const b = planMermaidInsert(10, mermaid, mermaid);
    expect(b.insert).toBe(mermaid + '\n');
    expect(b.caret).toBe(10 + mermaid.length + 1);
    // 前导换行
    const c = planMermaidInsert(5, '\n' + mermaid, mermaid);
    expect(c.insert).toBe('\n' + mermaid + '\n');
    expect(c.caret).toBe(5 + 1 + mermaid.length + 1);
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

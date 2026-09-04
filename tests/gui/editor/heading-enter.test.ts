/**
 * 预览模式标题行 Enter：行中拆分保留 ATX；行尾新段落。
 */
import * as path from 'path';

const {
  planHeadingEnter,
  handlePreviewHeadingEnter,
  shouldDeleteEmptyHeadingLine,
  planEmptyHeadingLineDelete,
  handlePreviewHeadingBackspace,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/heading-enter.js'));

describe('heading-enter', () => {
  test('标题正文行首回车：下一行带同级 ## 前缀', () => {
    const line = '## 目录结构';
    const off = line.indexOf('目');
    expect(planHeadingEnter(line, off)).toEqual({
      insert: '\n## ',
      cursor: 4,
    });
  });

  test('标题行尾回车：普通换行，不续写 ## 前缀', () => {
    const line = '## 目录结构';
    expect(planHeadingEnter(line, line.length)).toEqual({
      insert: '\n',
      cursor: 1,
    });
  });

  test('光标在 # 或空格前缀内走默认换行', () => {
    expect(planHeadingEnter('## 目录结构', 0)).toBeNull();
    expect(planHeadingEnter('## 目录结构', 1)).toBeNull();
  });

  test('handlePreviewHeadingEnter 在标题正文处 dispatch', () => {
    const doc = '## 目录结构\n';
    const pos = doc.indexOf('目');
    const dispatch = jest.fn();
    const view = {
      state: {
        selection: { main: { empty: true, from: pos, to: pos } },
        doc: {
          lineAt: function () {
            return { from: 0, text: '## 目录结构' };
          },
        },
      },
      dispatch,
    };
    expect(handlePreviewHeadingEnter(view)).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: pos, to: pos, insert: '\n## ' },
      selection: { anchor: pos + 4, head: pos + 4 },
    });
  });

  test('空标题行 Backspace：删整行含换行', () => {
    const doc = 'Hi\n## \nBye';
    const line2From = 3;
    const pos = line2From + 3;
    expect(shouldDeleteEmptyHeadingLine('## ', 3)).toBe(true);
    expect(shouldDeleteEmptyHeadingLine('## 目录', 3)).toBe(false);
    const plan = planEmptyHeadingLineDelete(
      {
        lines: 3,
        line: function (n: number) {
          if (n === 1) return { number: 1, from: 0, to: 2, text: 'Hi' };
          if (n === 2) return { number: 2, from: 3, to: 6, text: '## ' };
          return { number: 3, from: 7, to: 10, text: 'Bye' };
        },
      },
      { number: 2, from: 3, to: 6, text: '## ' }
    );
    expect(plan).toEqual({ from: 3, to: 7, cursor: 2 });

    const dispatch = jest.fn();
    const view = {
      state: {
        selection: { main: { empty: true, from: pos, to: pos } },
        doc: {
          lines: 3,
          lineAt: function () {
            return { number: 2, from: 3, to: 6, text: '## ' };
          },
          line: function (n: number) {
            if (n === 1) return { number: 1, from: 0, to: 2, text: 'Hi' };
            if (n === 2) return { number: 2, from: 3, to: 6, text: '## ' };
            return { number: 3, from: 7, to: 10, text: 'Bye' };
          },
        },
      },
      dispatch,
    };
    expect(handlePreviewHeadingBackspace(view)).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 3, to: 7, insert: '' },
      selection: { anchor: 2, head: 2 },
    });
  });
});

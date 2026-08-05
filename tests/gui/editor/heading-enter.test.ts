/**
 * 预览模式标题行 Enter：新行保留 ATX 前缀。
 */
import * as path from 'path';

const {
  planHeadingEnter,
  handlePreviewHeadingEnter,
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
});

/**
 * 空白正文行：/ 唤起插入菜单。
 */
import * as path from 'path';

const {
  handleBlankLineSlashOpen,
  isBlankProseLine,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/empty-line-insert.js'));

describe('empty-line-insert slash', () => {
  test('非空白行不拦截 /', () => {
    const view = {
      destroyed: false,
      state: {
        selection: { main: { empty: true, from: 0, to: 0, head: 0 } },
        doc: {
          lineAt: function () {
            return { from: 0, to: 5, text: 'hello', number: 1 };
          },
        },
      },
    };
    expect(isBlankProseLine(view, { from: 0, to: 5, text: 'hello', number: 1 })).toBe(false);
    expect(handleBlankLineSlashOpen(view, {})).toBe(false);
  });
});

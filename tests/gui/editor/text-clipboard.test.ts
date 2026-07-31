/**
 * 预览模式正文剪贴板：图片粘贴不抢占纯文本
 */
import * as path from 'path';

const { createImagePasteHandler } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/image-shortcuts.js'
));

describe('image paste vs text', () => {
  test('剪贴板同时含图与文字时交给 CM6 粘贴文本', () => {
    const insert = jest.fn();
    const handler = createImagePasteHandler({ onInsertImageAt: insert });
    const prevented: boolean[] = [];
    const event = {
      clipboardData: {
        items: [{ type: 'image/png' }],
        getData: function (type: string) {
          return type === 'text/plain' ? 'hello' : '';
        },
      },
      preventDefault: function () {
        prevented.push(true);
      },
    };
    const view = { state: { selection: { main: { head: 3 } } } };
    expect(handler(event, view)).toBe(false);
    expect(prevented.length).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  test('纯图片剪贴板仍插入图片块', () => {
    const insert = jest.fn();
    const handler = createImagePasteHandler({ onInsertImageAt: insert });
    const event = {
      clipboardData: {
        items: [{ type: 'image/png' }],
        getData: function () {
          return '';
        },
      },
      preventDefault: function () {},
    };
    const view = { state: { selection: { main: { head: 3 } } } };
    expect(handler(event, view)).toBe(true);
    expect(insert).toHaveBeenCalledWith(3);
  });
});

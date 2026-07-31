/**
 * M8-C4：围栏代码块 Delete / Backspace 快捷键
 */
import * as path from 'path';

const { tryDeleteSelectedCodeBlock } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/code-shortcuts.js'
));

describe('code delete shortcuts', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.document = {
      activeElement: null,
      querySelector: jest.fn(() => null),
    };
  });

  afterEach(() => {
    // @ts-expect-error cleanup
    delete global.document;
  });

  test('选中代码块时 Delete 触发 onDeleteCodeBlock', () => {
    const block = { from: 1, to: 20, source: '```js\na\n```' };
    global.document.querySelector = jest.fn(() => ({
      classList: { contains: () => true },
      getAttribute: function (name: string) {
        if (name === 'data-mda-block-from') return '1';
        if (name === 'data-mda-block-to') return '20';
        if (name === 'data-mda-block-source') return block.source;
        return '';
      },
    }));
    const onDelete = jest.fn();
    const event = {
      key: 'Delete',
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    expect(tryDeleteSelectedCodeBlock(event, { onDeleteCodeBlock: onDelete })).toBe(true);
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ from: 1, to: 20 }));
  });

  test('代码编辑聚焦时不删除块', () => {
    global.document.querySelector = jest.fn(() => ({
      classList: { contains: () => true },
      getAttribute: function (name: string) {
        if (name === 'data-mda-block-from') return '1';
        if (name === 'data-mda-block-to') return '20';
        return '';
      },
    }));
    const editor = {
      closest: function (sel: string) {
        return sel === '.mda-cm-code-input' ? editor : null;
      },
    };
    // @ts-expect-error test stub
    global.document.activeElement = editor;
    const onDelete = jest.fn();
    const event = {
      key: 'Backspace',
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    expect(tryDeleteSelectedCodeBlock(event, { onDeleteCodeBlock: onDelete })).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });
});

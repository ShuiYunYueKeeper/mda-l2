/**
 * M8-C4：围栏代码块 Delete / Backspace / Ctrl+C 快捷键
 */
import * as path from 'path';

const {
  tryDeleteSelectedCodeBlock,
  tryCopySelectedCodeBlock,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/code-shortcuts.js'));
const {
  setSelectedCodeBlock,
  clearSelectedCodeBlock,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/code-selection.js'
));

describe('code delete shortcuts', () => {
  beforeEach(() => {
    (global as any).document = {
      activeElement: null,
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
    };
  });

  afterEach(() => {
    clearSelectedCodeBlock();
    delete (global as any).document;
    delete (global as any).window;
  });

  test('选中代码块时 Delete 触发 onDeleteCodeBlock', () => {
    setSelectedCodeBlock({ from: 1, to: 20, source: '```js\na\n```' });
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
    setSelectedCodeBlock({ from: 1, to: 20, source: '```js\na\n```' });
    const editor = {
      closest: function (sel: string) {
        return sel === '.mda-cm-code-input' ? editor : null;
      },
    };
    (global as any).document.activeElement = editor;
    const onDelete = jest.fn();
    const event = {
      key: 'Backspace',
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    expect(tryDeleteSelectedCodeBlock(event, { onDeleteCodeBlock: onDelete })).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('选中代码块时 Ctrl+C 触发 onCopyCodeBlock', () => {
    setSelectedCodeBlock({ from: 1, to: 30, source: '```js\nconsole.log(1)\n```' });
    const onCopy = jest.fn();
    const event = {
      key: 'c',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    expect(tryCopySelectedCodeBlock(event, { onCopyCodeBlock: onCopy })).toBe(true);
    expect(onCopy).toHaveBeenCalledWith(
      expect.objectContaining({ source: expect.stringContaining('console.log') })
    );
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('代码框内有拖选时 Ctrl+C 不拦截', () => {
    setSelectedCodeBlock({ from: 1, to: 20, source: '```js\na\n```' });
    const editor = {
      closest: function (sel: string) {
        return sel === '.mda-cm-code-input' ? editor : null;
      },
    };
    (global as any).document.activeElement = editor;
    (global as any).window = {
      getSelection: function () {
        return {
          isCollapsed: false,
          toString: function () {
            return 'log';
          },
        };
      },
    };
    const onCopy = jest.fn();
    const event = {
      key: 'c',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    expect(tryCopySelectedCodeBlock(event, { onCopyCodeBlock: onCopy })).toBe(false);
    expect(onCopy).not.toHaveBeenCalled();
  });
});

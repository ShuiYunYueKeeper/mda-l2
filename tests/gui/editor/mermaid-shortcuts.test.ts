/**
 * M8-C2：Mermaid 块 Delete / Backspace / Ctrl+C 快捷键
 */
import * as path from 'path';

const {
  tryDeleteSelectedMermaidBlock,
  tryCopySelectedMermaidBlock,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/mermaid-shortcuts.js'));
const {
  setSelectedMermaidBlock,
  clearSelectedMermaidBlock,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/mermaid-selection.js'
));

describe('mermaid delete shortcuts', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.document = { activeElement: null };
  });

  afterEach(() => {
    clearSelectedMermaidBlock();
    // @ts-expect-error cleanup
    delete global.document;
    // @ts-expect-error cleanup
    delete global.window;
  });

  test('选中 Mermaid 块时 Delete 触发 onDeleteMermaidBlock', () => {
    const onDelete = jest.fn();
    setSelectedMermaidBlock({ from: 1, to: 20, source: '```mermaid\na\n```' });
    const event = {
      key: 'Delete',
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    expect(tryDeleteSelectedMermaidBlock(event, { onDeleteMermaidBlock: onDelete })).toBe(true);
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ from: 1, to: 20 }));
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('源码编辑聚焦时不删除块', () => {
    const onDelete = jest.fn();
    setSelectedMermaidBlock({ from: 1, to: 20, source: '```mermaid\na\n```' });
    const sourceEl = {
      tagName: 'DIV',
      closest: function (sel: string) {
        return sel === '.mda-cm-mermaid-source-input' ? sourceEl : null;
      },
    };
    // @ts-expect-error test stub
    global.document.activeElement = sourceEl;

    const event = {
      key: 'Backspace',
      preventDefault: jest.fn(),
    };
    expect(tryDeleteSelectedMermaidBlock(event, { onDeleteMermaidBlock: onDelete })).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('选中 Mermaid 块时 Ctrl+C 触发 onCopyMermaidBlock', () => {
    const onCopy = jest.fn();
    setSelectedMermaidBlock({
      from: 1,
      to: 40,
      source: '```mermaid\ngraph LR\n  Start --> Stop\n```',
    });
    const event = {
      key: 'c',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    expect(tryCopySelectedMermaidBlock(event, { onCopyMermaidBlock: onCopy })).toBe(true);
    expect(onCopy).toHaveBeenCalledWith(
      expect.objectContaining({ source: expect.stringContaining('Start --> Stop') })
    );
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('源码框内有拖选时 Ctrl+C 不拦截', () => {
    const onCopy = jest.fn();
    setSelectedMermaidBlock({ from: 1, to: 20, source: '```mermaid\na\n```' });
    const sourceEl = {
      closest: function (sel: string) {
        return sel === '.mda-cm-mermaid-source-input' ? sourceEl : null;
      },
    };
    // @ts-expect-error test stub
    global.document.activeElement = sourceEl;
    const fakeWin: { getSelection: () => { isCollapsed: boolean; toString: () => string } } = {
      getSelection: function () {
        return {
          isCollapsed: false,
          toString: function () {
            return 'Start';
          },
        };
      },
    };
    // @ts-expect-error test stub
    global.window = fakeWin;
    const event = {
      key: 'c',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    expect(tryCopySelectedMermaidBlock(event, { onCopyMermaidBlock: onCopy })).toBe(false);
    expect(onCopy).not.toHaveBeenCalled();
  });
});

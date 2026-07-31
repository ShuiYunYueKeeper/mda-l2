/**
 * M8-C2：Mermaid 块 Delete / Backspace 快捷键
 */
import * as path from 'path';

const { tryDeleteSelectedMermaidBlock } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/mermaid-shortcuts.js'
));
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
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ from: 1, to: 20 })
    );
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('源码编辑 textarea 聚焦时不删除块', () => {
    const onDelete = jest.fn();
    setSelectedMermaidBlock({ from: 1, to: 20, source: '```mermaid\na\n```' });
    const textarea = {
      tagName: 'TEXTAREA',
      closest: function (sel: string) {
        return sel === '.mda-cm-mermaid-source-input' ? textarea : null;
      },
    };
    // @ts-expect-error test stub
    global.document.activeElement = textarea;

    const event = {
      key: 'Backspace',
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    expect(tryDeleteSelectedMermaidBlock(event, { onDeleteMermaidBlock: onDelete })).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });
});

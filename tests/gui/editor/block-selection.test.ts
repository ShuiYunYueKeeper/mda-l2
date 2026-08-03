/**
 * 通用块选中态：删除后保留内存，撤销后按 source 重定位。
 */
import * as path from 'path';

const {
  setSelectedBlock,
  getSelectedBlock,
  clearSelectedBlock,
  reconcileSelectedBlock,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/block-selection.js'
));

function mockView(text: string) {
  return {
    dom: {
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
    },
    state: {
      doc: {
        toString: function () {
          return text;
        },
        sliceString: function (from: number, to: number) {
          return text.slice(from, to);
        },
        get length() {
          return text.length;
        },
      },
    },
  };
}

describe('block-selection', () => {
  afterEach(() => {
    clearSelectedBlock();
  });

  test('reconcileSelectedBlock 按 source 更新 from/to（代码块）', () => {
    const text = 'head\n```js\nconst a = 1\n```\ntail';
    const source = '```js\nconst a = 1\n```';
    const from = text.indexOf(source);
    const to = from + source.length + 1;
    setSelectedBlock({ kind: 'code', from: 0, to: 1, source: source });
    reconcileSelectedBlock(mockView(text));
    const sel = getSelectedBlock();
    expect(sel).not.toBeNull();
    expect(sel!.kind).toBe('code');
    expect(sel!.from).toBe(from);
    expect(sel!.to).toBe(to);
  });

  test('删除后保留内存，撤销后可重新定位', () => {
    const source = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const original = 'before\n' + source + '\nafter\n';
    const from = original.indexOf(source);
    const to = from + source.length + 1;
    setSelectedBlock({ kind: 'table', from: from, to: to, source: source });

    reconcileSelectedBlock(mockView('before\nafter\n'));
    expect(getSelectedBlock()!.source).toBe(source);

    reconcileSelectedBlock(mockView(original));
    const restored = getSelectedBlock();
    expect(restored!.from).toBe(from);
    expect(restored!.to).toBe(to);
  });

  test('hr / quote kind 可写入内存', () => {
    setSelectedBlock({ kind: 'hr', from: 2, to: 5, source: '---' });
    expect(getSelectedBlock()!.kind).toBe('hr');
    setSelectedBlock({ kind: 'quote', from: 0, to: 4, source: '> hi' });
    expect(getSelectedBlock()!.kind).toBe('quote');
  });
});

/**
 * 图片选中态：删除/移动后撤销应恢复选中。
 */
import * as path from 'path';

const {
  setSelectedImageBlock,
  getSelectedImageBlock,
  clearSelectedImageBlock,
  reconcileSelectedImageBlock,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/widgets/image-selection.js'));

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
      },
    },
  };
}

describe('image-selection', () => {
  afterEach(() => {
    clearSelectedImageBlock();
  });

  test('reconcileSelectedImageBlock 按 source 更新 from/to', () => {
    const text = 'head\n![img](a.png)\ntail';
    const from = text.indexOf('![img]');
    const to = text.indexOf('\n', from) + 1;
    setSelectedImageBlock({ from: 0, to: 1, source: '![img](a.png)' });
    reconcileSelectedImageBlock(mockView(text));
    const sel = getSelectedImageBlock();
    expect(sel).not.toBeNull();
    expect(sel!.from).toBe(from);
    expect(sel!.to).toBe(to);
  });

  test('reconcileSelectedImageBlock 图片不存在时保留内存选中', () => {
    setSelectedImageBlock({ from: 10, to: 20, source: '![gone](x.png)' });
    reconcileSelectedImageBlock(mockView('no images'));
    const sel = getSelectedImageBlock();
    expect(sel).not.toBeNull();
    expect(sel!.source).toBe('![gone](x.png)');
  });

  test('撤销恢复后 reconcile 可重新定位', () => {
    const original = 'before\n![keep](a.png)\nafter';
    const from = original.indexOf('![keep]');
    const to = original.indexOf('\n', from) + 1;
    setSelectedImageBlock({ from: from, to: to, source: '![keep](a.png)' });

    const deleted = 'before\nafter';
    reconcileSelectedImageBlock(mockView(deleted));
    expect(getSelectedImageBlock()!.source).toBe('![keep](a.png)');

    reconcileSelectedImageBlock(mockView(original));
    const restored = getSelectedImageBlock();
    expect(restored!.from).toBe(from);
    expect(restored!.to).toBe(to);
  });
});

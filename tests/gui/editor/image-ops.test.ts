/**
 * M8-C1 / COORD-5：点击定位与图片块操作
 */
import * as path from 'path';

const { posAtClick } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/click-collapse.js'
));
const { insertImageAt, moveBlockRange, resolveBlockRange, resolveDropTargetFromCoords, dropReplaceImageBlock, resolveImageLineRange, deleteBlockRange } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/image-block-ops.js'
));
const { LONG_PRESS_MS } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/image-drag.js'
));

describe('click-collapse', () => {
  test('posAtClick 导出可用', () => {
    expect(typeof posAtClick).toBe('function');
  });
});

describe('image-block-ops', () => {
  test('insertImageAt 导出可用', () => {
    expect(typeof insertImageAt).toBe('function');
  });

  test('moveBlockRange 导出可用', () => {
    expect(typeof moveBlockRange).toBe('function');
  });

  test('moveBlockRange 剪切移动而非复制', () => {
    const doc = 'before\n![img](a.png)\nafter';
    let text = doc;
    const view = {
      state: {
        doc: {
          length: doc.length,
          toString: function () {
            return text;
          },
          sliceString: function (from: number, to: number) {
            return text.slice(from, to);
          },
          lineAt: function (pos: number) {
            const before = text.slice(0, Math.max(0, Math.min(pos, text.length)));
            const from = before.lastIndexOf('\n') + 1;
            const next = text.indexOf('\n', from);
            const to = next >= 0 ? next + 1 : text.length;
            const number = before.split('\n').length;
            return { from: from, to: to, number: number };
          },
          line: function (n: number) {
            let from = 0;
            let number = 1;
            while (number < n) {
              const next = text.indexOf('\n', from);
              if (next < 0) break;
              from = next + 1;
              number += 1;
            }
            const next = text.indexOf('\n', from);
            const to = next >= 0 ? next + 1 : text.length;
            return { from: from, to: to, number: number };
          },
          get lines() {
            return text.split('\n').length;
          },
        },
      },
      dispatch: function (tr: { changes: { from: number; to: number; insert: string } | { from: number; to: number; insert: string }[] }) {
        const changes = Array.isArray(tr.changes) ? tr.changes : [tr.changes];
        for (let i = 0; i < changes.length; i++) {
          const ch = changes[i];
          text = text.slice(0, ch.from) + (ch.insert || '') + text.slice(ch.to);
        }
      },
    };
    const idx = text.indexOf('![img]');
    const lineEnd = text.indexOf('\n', idx);
    const from = idx;
    const to = lineEnd + 1;
    moveBlockRange(view, from, to, text.length);
    expect(text.match(/!\[img\]/g)?.length || 0).toBe(1);
    expect(text).not.toContain('![img](a.png)\n![img]');
    expect(text.indexOf('after')).toBeGreaterThan(text.indexOf('![img]'));
  });

  test('deleteBlockRange 删除前钉选区到块首（避免撤销回到文档头）', () => {
    const doc = 'before\n![img](a.png)\nafter';
    let text = doc;
    let selection = { from: 0, to: 0 };
    const dispatches: Array<{ selection?: { anchor: number; head: number }; changes?: unknown }> = [];
    const view = {
      state: {
        get selection() {
          return { main: selection };
        },
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
      dispatch: function (tr: {
        changes?: { from: number; to: number; insert: string };
        selection?: { anchor: number; head: number };
      }) {
        dispatches.push(tr);
        if (tr.selection) {
          selection = { from: tr.selection.anchor, to: tr.selection.head };
        }
        if (tr.changes) {
          const ch = tr.changes;
          text = text.slice(0, ch.from) + (ch.insert || '') + text.slice(ch.to);
        }
      },
    };
    const from = text.indexOf('![img]');
    const to = text.indexOf('\n', from) + 1;
    deleteBlockRange(view, from, to);
    expect(dispatches.length).toBeGreaterThanOrEqual(2);
    expect(dispatches[0].selection).toEqual({ anchor: from, head: from });
    expect(dispatches[1].changes).toBeTruthy();
    expect(dispatches[1].selection?.anchor).toBe(from);
    expect(text).toBe('before\nafter');
    expect(text).not.toContain('![img]');
  });

  test('resolveBlockRange 按 from/to 定位（source 无换行）', () => {
    const text = 'line1\n![x](y.png)\nline3';
    const view = {
      state: {
        doc: {
          toString: function () {
            return text;
          },
        },
      },
    };
    const from = text.indexOf('![x]');
    const to = text.indexOf('\n', from) + 1;
    const range = resolveBlockRange(view, { from: from, to: to, source: '![x](y.png)' });
    expect(range).not.toBeNull();
    expect(text.slice(range!.from, range!.to)).toBe('![x](y.png)\n');
  });

  test('resolveBlockRange 重复 source 取离 from 最近', () => {
    const text = '![same](a.png)\nmid\n![same](a.png)\n';
    const secondFrom = text.lastIndexOf('![same]');
    const view = {
      state: {
        doc: {
          toString: function () {
            return text;
          },
        },
      },
    };
    const range = resolveBlockRange(view, {
      from: secondFrom,
      to: secondFrom + '![same](a.png)'.length,
      source: '![same](a.png)',
    });
    expect(range).not.toBeNull();
    expect(range!.from).toBe(secondFrom);
  });

  test('resolveDropTargetFromCoords 悬停其他图片时为替换模式', () => {
    const text = 'top\n![a](1.png)\nmid\n![b](2.png)\n';
    const bFrom = text.indexOf('![b]');
    const bTo = text.indexOf('\n', bFrom) + 1;
    const view = {
      dom: {
        querySelectorAll: function () {
          return [
            {
              getAttribute: function (name: string) {
                if (name === 'data-mda-block-from') return String(bFrom);
                if (name === 'data-mda-block-to') return String(bTo);
                return '';
              },
              getBoundingClientRect: function () {
                return { left: 0, right: 200, top: 100, bottom: 200 };
              },
            },
          ];
        },
      },
      posAtCoords: function () {
        return bFrom + 3;
      },
      state: {
        doc: {
          length: text.length,
          lineAt: function (pos: number) {
            const before = text.slice(0, pos);
            return { from: before.lastIndexOf('\n') + 1, number: before.split('\n').length };
          },
          line: function () {
            return { from: bFrom };
          },
          get lines() {
            return 5;
          },
        },
      },
    };
    const resolved = resolveDropTargetFromCoords(view, 10, 20, 100, 150, null);
    expect(resolved.mode).toBe('replace');
    expect(resolved.targetBlock).not.toBeNull();
    expect(resolved.targetBlock!.from).toBe(bFrom);
    expect(resolved.pos).toBeNull();
  });

  test('resolveImageLineRange 不含上方批注行', () => {
    const text =
      '[comment]: <> (@anno {"id":"x","content":"c","tags":[],"level":"info","status":"open","created_at":"2020-01-01T00:00:00.000Z"})\n' +
      '![img](a.png)\n';
    const imgFrom = text.indexOf('![img]');
    const imgTo = text.indexOf('\n', imgFrom) + 1;
    const view = {
      state: {
        doc: {
          toString: function () {
            return text;
          },
        },
      },
    };
    const range = resolveImageLineRange(view, {
      from: imgFrom,
      to: imgTo,
      source: '![img](a.png)',
    });
    expect(range).not.toBeNull();
    expect(text.slice(range!.from, range!.to)).toBe('![img](a.png)\n');
    expect(text.slice(range!.from, range!.to)).not.toContain('[comment]');
  });

  test('dropReplaceImageBlock 上方图替换下方图（单次原子替换）', () => {
    const doc =
      '![drag](a.png)\n' +
      '[comment]: <> (@anno {"id":"x","content":"c","tags":[],"level":"info","status":"open","created_at":"2020-01-01T00:00:00.000Z"})\n' +
      '![target](b.png)\n' +
      'tail';
    let text = doc;
    const view = {
      state: {
        doc: {
          length: doc.length,
          toString: function () {
            return text;
          },
          sliceString: function (from: number, to: number) {
            return text.slice(from, to);
          },
        },
      },
      dispatch: function (tr: { changes: { from: number; to: number; insert: string } | { from: number; to: number; insert: string }[] }) {
        const changes = Array.isArray(tr.changes) ? tr.changes : [tr.changes];
        for (let i = 0; i < changes.length; i++) {
          const ch = changes[i];
          text = text.slice(0, ch.from) + (ch.insert || '') + text.slice(ch.to);
        }
      },
    };
    const dragFrom = text.indexOf('![drag]');
    const dragTo = text.indexOf('\n', dragFrom) + 1;
    const targetFrom = text.indexOf('![target]');
    const targetTo = text.indexOf('\n', targetFrom) + 1;
    dropReplaceImageBlock(
      view,
      { from: dragFrom, to: dragTo, source: '![drag](a.png)' },
      { from: targetFrom, to: targetTo, source: '![target](b.png)' }
    );
    expect(text.match(/!\[[^\]]*\]\([^)]*\)/g)?.length || 0).toBe(1);
    expect(text).toContain('![drag](a.png)');
    expect(text).not.toContain('![target](b.png)');
    expect(text).toContain('[comment]: <> (@anno');
    expect(text.indexOf('[comment]')).toBeLessThan(text.indexOf('![drag]'));
    expect(text).toContain('tail');
  });

  test('dropReplaceImageBlock 下方图替换上方图', () => {
    const doc = '![target](b.png)\nmid\n![drag](a.png)\n';
    let text = doc;
    const view = {
      state: {
        doc: {
          toString: function () {
            return text;
          },
        },
      },
      dispatch: function (tr: { changes: { from: number; to: number; insert: string } }) {
        const ch = tr.changes;
        text = text.slice(0, ch.from) + (ch.insert || '') + text.slice(ch.to);
      },
    };
    const targetFrom = text.indexOf('![target]');
    const targetTo = text.indexOf('\n', targetFrom) + 1;
    const dragFrom = text.indexOf('![drag]');
    const dragTo = text.indexOf('\n', dragFrom) + 1;
    dropReplaceImageBlock(
      view,
      { from: dragFrom, to: dragTo, source: '![drag](a.png)' },
      { from: targetFrom, to: targetTo, source: '![target](b.png)' }
    );
    expect(text).toBe('![drag](a.png)\nmid\n');
  });
});

describe('image-drag', () => {
  test('长按阈值约 200ms', () => {
    expect(LONG_PRESS_MS).toBe(200);
  });
});

describe('image-corner-resize', () => {
  test('右下角 14px 内判定为缩放区', () => {
    const frame = {
      getBoundingClientRect: function () {
        return { left: 100, right: 300, top: 50, bottom: 250 };
      },
    };
    const { isNearFrameResizeCorner, CORNER_PX } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/widgets/image-edge-resize.js'
    ));
    expect(isNearFrameResizeCorner(frame, 300, 250)).toBe(true);
    expect(isNearFrameResizeCorner(frame, 287, 237)).toBe(true);
    expect(isNearFrameResizeCorner(frame, 283, 233)).toBe(false);
    expect(CORNER_PX).toBe(16);
  });
});

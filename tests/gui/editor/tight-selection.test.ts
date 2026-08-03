/**
 * 紧致选区：只盖实际字符
 */
import * as path from 'path';

const {
  tightMarkersForRange,
  createProseSelectionExtension,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/view/tight-selection.js'));

describe('tight-selection', () => {
  test('createProseSelectionExtension 返回 layer + theme', () => {
    const ext = createProseSelectionExtension();
    expect(Array.isArray(ext)).toBe(true);
    expect(ext.length).toBe(2);
  });

  test('tightMarkersForRange：空选区返回 []', () => {
    const view = { viewport: { from: 0, to: 100 } };
    expect(tightMarkersForRange(view, { from: 3, to: 3 })).toEqual([]);
  });

  test('tightMarkersForRange：同视觉行矩形贴合字符、不铺满', () => {
    const view: any = {
      viewport: { from: 0, to: 100 },
      textDirection: 0,
      scaleX: 1,
      scaleY: 1,
      state: {
        doc: {
          lineAt: (pos: number) => ({ from: 0, to: 20, number: 1 }),
        },
      },
      scrollDOM: {
        getBoundingClientRect: () => ({ left: 0, right: 800, top: 0, bottom: 600 }),
        scrollLeft: 0,
        scrollTop: 0,
        clientWidth: 800,
      },
      coordsAtPos: (pos: number) => ({
        left: 100 + pos * 10,
        right: 100 + pos * 10 + 10,
        top: 20,
        bottom: 40,
      }),
    };

    const markers = tightMarkersForRange(view, { from: 2, to: 5 });
    expect(markers.length).toBe(1);
    expect(markers[0].width).toBe(30);
    expect(markers[0].width).toBeLessThan(200);
  });

  test('layer / mark class 不得含空格（否则 classList.add 崩溃）', () => {
    const { TIGHT_LAYER_CLASS, TIGHT_MARK_CLASS } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/view/tight-selection.js'
    ));
    expect(TIGHT_LAYER_CLASS).not.toMatch(/\s/);
    expect(TIGHT_MARK_CLASS).not.toMatch(/\s/);
  });
});

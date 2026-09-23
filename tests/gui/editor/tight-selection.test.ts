/**
 * 紧致选区：只盖实际字符
 */
import * as path from 'path';

const {
  tightMarkersForRange,
  createProseSelectionExtension,
  createSourceSelectionExtension,
  charCoordsAt,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/view/tight-selection.js'));

describe('tight-selection', () => {
  test('createProseSelectionExtension 返回 layer + theme', () => {
    const ext = createProseSelectionExtension();
    expect(Array.isArray(ext)).toBe(true);
    expect(ext.length).toBe(2);
  });

  test('createSourceSelectionExtension 返回源码选区 theme', () => {
    const ext = createSourceSelectionExtension();
    expect(ext).toBeTruthy();
  });

  test('charCoordsAt 合并左右落点覆盖整字宽', () => {
    const view: any = {
      coordsAtPos: (pos: number, side: number) => {
        if (side === 1) return { left: 100 + pos * 10, right: 100 + pos * 10 + 4, top: 0, bottom: 20 };
        return { left: 100 + (pos - 1) * 10, right: 100 + (pos - 1) * 10 + 10, top: 0, bottom: 20 };
      },
    };
    const c = charCoordsAt(view, 3);
    expect(c).not.toBeNull();
    expect(c!.right - c!.left).toBe(10);
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
      coordsAtPos: (pos: number, side: number) => {
        if (side === 1) {
          const left = 100 + pos * 10;
          return { left: left, right: left, top: 20, bottom: 40 };
        }
        const right = 100 + pos * 10;
        return { left: right, right: right, top: 20, bottom: 40 };
      },
    };

    const markers = tightMarkersForRange(view, { from: 2, to: 5 });
    expect(markers.length).toBe(1);
    expect(markers[0].width).toBe(30);
    expect(markers[0].height).toBe(20);
    expect(markers[0].width).toBeLessThan(200);
  });

  test('tightMarkersForRange：半开区间末字计入宽度', () => {
    const view: any = {
      viewport: { from: 0, to: 100 },
      textDirection: 0,
      scaleX: 1,
      scaleY: 1,
      state: {
        doc: {
          lineAt: () => ({ from: 0, to: 20, number: 1 }),
        },
      },
      scrollDOM: {
        getBoundingClientRect: () => ({ left: 0, right: 800, top: 0, bottom: 600 }),
        scrollLeft: 0,
        scrollTop: 0,
        clientWidth: 800,
      },
      coordsAtPos: (pos: number, side: number) => {
        if (side === 1) {
          const left = 100 + pos * 10;
          return { left: left, right: left, top: 20, bottom: 40 };
        }
        const right = 100 + pos * 10;
        return { left: right, right: right, top: 20, bottom: 40 };
      },
    };

    const markers = tightMarkersForRange(view, { from: 2, to: 6 });
    expect(markers.length).toBe(1);
    expect(markers[0].width).toBe(40);
  });

  test('lineBlockAt 不前进时不得死循环（widget 边界）', () => {
    const view: any = {
      viewport: { from: 0, to: 100 },
      textDirection: 0,
      scaleX: 1,
      scaleY: 1,
      state: {
        doc: {
          lineAt: () => ({ from: 0, to: 20, number: 1 }),
        },
      },
      scrollDOM: {
        getBoundingClientRect: () => ({ left: 0, right: 800, top: 0, bottom: 600 }),
        scrollLeft: 0,
        scrollTop: 0,
        clientWidth: 800,
      },
      coordsAtPos: (pos: number, side: number) => {
        const left = 100 + pos * 10;
        if (side === 1) return { left, right: left + 10, top: 20, bottom: 40 };
        return { left, right: left + 10, top: 20, bottom: 40 };
      },
    };
    expect(() => tightMarkersForRange(view, { from: 2, to: 8 })).not.toThrow();
    expect(tightMarkersForRange(view, { from: 2, to: 8 }).length).toBeGreaterThan(0);
  });

  test('同一行内字号不同不拆行：只出一个矩形，高度取并集', () => {
    // pos 0-1 模拟列表符号（小字号），pos 2+ 模拟标题正文（大字号），两者纵向重叠
    const view: any = {
      viewport: { from: 0, to: 100 },
      textDirection: 0,
      scaleX: 1,
      scaleY: 1,
      state: { doc: { lineAt: () => ({ from: 0, to: 20, number: 1 }) } },
      scrollDOM: {
        getBoundingClientRect: () => ({ left: 0, right: 800, top: 0, bottom: 600 }),
        scrollLeft: 0,
        scrollTop: 0,
        clientWidth: 800,
      },
      // side===-1 问的是 pos 左侧落点，归属前一个字符
      coordsAtPos: (pos: number, side: number) => {
        const idx = side === -1 ? pos - 1 : pos;
        const left = 100 + idx * 10;
        const small = idx < 2;
        return {
          left: left,
          right: left + 10,
          top: small ? 26 : 20,
          bottom: small ? 42 : 46,
        };
      },
    };
    const markers = tightMarkersForRange(view, { from: 0, to: 4 });
    expect(markers.length).toBe(1);
    expect(markers[0].height).toBe(26);
  });

  test('真正换行仍拆成两个矩形', () => {
    const view: any = {
      viewport: { from: 0, to: 100 },
      textDirection: 0,
      scaleX: 1,
      scaleY: 1,
      state: { doc: { lineAt: () => ({ from: 0, to: 20, number: 1 }) } },
      scrollDOM: {
        getBoundingClientRect: () => ({ left: 0, right: 800, top: 0, bottom: 600 }),
        scrollLeft: 0,
        scrollTop: 0,
        clientWidth: 800,
      },
      coordsAtPos: (pos: number, side: number) => {
        const idx = side === -1 ? pos - 1 : pos;
        const wrapped = idx >= 2;
        const left = 100 + (wrapped ? idx - 2 : idx) * 10;
        return {
          left: left,
          right: left + 10,
          top: wrapped ? 40 : 20,
          bottom: wrapped ? 60 : 40,
        };
      },
    };
    expect(tightMarkersForRange(view, { from: 0, to: 4 }).length).toBe(2);
  });

  test('优先 DOM Range：coords 撑满整行时仍只画选区宽度', () => {
    const rects = [
      { left: 220, right: 300, top: 100, bottom: 120 },
      { left: 80, right: 150, top: 120, bottom: 140 },
    ];
    (global as any).document = {
      createRange: () => ({
        setStart() {},
        setEnd() {},
        getClientRects: () => rects,
      }),
    };
    const view: any = {
      viewport: { from: 0, to: 1000 },
      textDirection: 0,
      scaleX: 1,
      scaleY: 1,
      state: { doc: { lineAt: () => ({ from: 0, to: 100, number: 1 }) } },
      scrollDOM: {
        getBoundingClientRect: () => ({ left: 0, right: 800, top: 0, bottom: 600 }),
        scrollLeft: 0,
        scrollTop: 0,
        clientWidth: 800,
        clientHeight: 600,
      },
      // 失真：每个字都返回接近整行宽
      coordsAtPos: () => ({ left: 50, right: 750, top: 100, bottom: 120 }),
      domAtPos: (pos: number) => ({ node: { nodeType: 3 }, offset: Math.max(0, pos) }),
    };
    try {
      const markers = tightMarkersForRange(view, { from: 10, to: 40 });
      expect(markers.length).toBe(2);
      expect(markers[0].width).toBe(80);
      expect(markers[1].width).toBe(70);
      expect(Math.max(markers[0].width, markers[1].width)).toBeLessThan(200);
    } finally {
      delete (global as any).document;
    }
  });

  test('DOM 同行碎矩形合并：行内 code 与正文统一高度', () => {
    const {
      mergeClientRectsByVisualRow,
    } = require(path.join(__dirname, '../../../src/gui/renderer/editor/view/tight-selection.js'));
    const merged = mergeClientRectsByVisualRow([
      { left: 100, right: 200, top: 22, bottom: 40 },
      { left: 200, right: 350, top: 18, bottom: 44 },
      { left: 350, right: 420, top: 22, bottom: 40 },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].left).toBe(100);
    expect(merged[0].right).toBe(420);
    expect(merged[0].top).toBe(18);
    expect(merged[0].bottom).toBe(44);
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

/**
 * click-collapse 导出冒烟
 */
import * as path from 'path';

const {
  posAtClick,
  placeCaret,
  isBlockWidgetTarget,
  refineIfFar,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/click-collapse.js'
));

describe('click-collapse', () => {
  test('导出 posAtClick / placeCaret / isBlockWidgetTarget', () => {
    expect(typeof posAtClick).toBe('function');
    expect(typeof placeCaret).toBe('function');
    expect(typeof isBlockWidgetTarget).toBe('function');
  });

  test('块 widget 目标识别对 null 安全', () => {
    expect(isBlockWidgetTarget(null)).toBe(false);
  });

  test('refineIfFar 横向大偏差不触发邻行重选', () => {
    const pos = 42;
    const view = {
      coordsAtPos: () => ({ left: 1000, top: 650, bottom: 672 }),
      state: { doc: { lineAt: () => ({ number: 5, from: 40, to: 50 }) } },
    };
    const refined = refineIfFar(view as never, 1052.5, 653, pos);
    expect(refined).toBe(pos);
  });

  test('caretPosForClick 不把上一行末 snap 进下一空行', () => {
    const { caretPosForClick } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/click-collapse.js'
    ));
    const { EditorState } = require('@codemirror/state');
    const state = EditorState.create({ doc: '## 标题\n\n下文' });
    const raw = state.doc.line(1).to;
    const view = { state: state, destroyed: false };
    const next = caretPosForClick(view, raw);
    expect(state.doc.lineAt(next).number).toBe(1);
  });

  test('selectWordAtClick 导出', () => {
    const { selectWordAtClick, selectLineAtClick } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/click-collapse.js'
    ));
    expect(typeof selectWordAtClick).toBe('function');
    expect(typeof selectLineAtClick).toBe('function');
  });

  test('lineSelectionRange 行末不含下一行行首', () => {
    const { lineSelectionRange } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/click-collapse.js'
    ));
    const { EditorState } = require('@codemirror/state');
    const doc = '1. 第一项\n2. 第二项';
    const state = EditorState.create({ doc });
    const line1 = state.doc.line(1);
    const range = lineSelectionRange(state, line1);
    expect(range.to).toBe(line1.to);
    expect(range.to).toBeLessThan(state.doc.line(2).from);
  });
});

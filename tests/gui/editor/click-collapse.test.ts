/**
 * click-collapse 导出冒烟
 */
import * as path from 'path';

const {
  posAtClick,
  placeCaret,
  isBlockWidgetTarget,
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
});

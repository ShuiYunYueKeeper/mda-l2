/**
 * CM6 大纲滚动高亮：标题行锚点算法
 */
import * as path from 'path';

const {
  headingAtOrBefore,
  headingProbePos,
  isHeadingDocLine,
  pickOutlineActiveFromEntries,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/outline-scroll.js'
));

describe('outline-scroll', () => {
  test('headingAtOrBefore 取不超过锚点的最近标题', () => {
    const lines = [10, 50, 120, 200];
    expect(headingAtOrBefore(lines, 1)).toBe(10);
    expect(headingAtOrBefore(lines, 10)).toBe(10);
    expect(headingAtOrBefore(lines, 49)).toBe(10);
    expect(headingAtOrBefore(lines, 50)).toBe(50);
    expect(headingAtOrBefore(lines, 199)).toBe(120);
    expect(headingAtOrBefore(lines, 999)).toBe(200);
  });

  test('isHeadingDocLine 识别 ATX 标题行', () => {
    const doc = {
      lines: 3,
      line: (n: number) => ({
        text: n === 1 ? '# 标题' : n === 2 ? '正文' : '###',
      }),
    };
    expect(isHeadingDocLine(doc as never, 1)).toBe(true);
    expect(isHeadingDocLine(doc as never, 2)).toBe(false);
    expect(isHeadingDocLine(doc as never, 3)).toBe(true);
  });

  test('headingProbePos 跳过 ATX # 标记', () => {
    const doc = {
      line: (n: number) => ({
        from: 100,
        to: 112,
        text: '## 验证方法',
        number: n,
      }),
    };
    expect(headingProbePos(doc as never, 1)).toBe(103);
  });

  test('pickOutlineActiveFromEntries 视口内靠上标题优先于上一节', () => {
    const scrollTop = 1000;
    const clientH = 800;
    const entries = [
      { line: 370, docTop: 500, inViewport: false },
      { line: 391, docTop: 1300, inViewport: true },
      { line: 398, docTop: 1700, inViewport: true },
    ];
    expect(pickOutlineActiveFromEntries(entries, scrollTop, clientH)).toBe(391);
  });

  test('pickOutlineActiveFromEntries 仅底部可见下一节时仍停留当前节', () => {
    const scrollTop = 1000;
    const clientH = 800;
    const entries = [
      { line: 391, docTop: 800, inViewport: false },
      { line: 398, docTop: 1650, inViewport: true },
    ];
    expect(pickOutlineActiveFromEntries(entries, scrollTop, clientH)).toBe(391);
  });
});

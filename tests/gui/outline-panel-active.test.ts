/**
 * 大纲 setHeadings 后保留仍有效的 activeLine
 */
import * as path from 'path';

const { preserveActiveLine } = require(path.join(
  __dirname,
  '../../src/gui/renderer/outline-panel.js'
));

describe('outline-panel preserveActiveLine', () => {
  test('仍存在则保留', () => {
    expect(preserveActiveLine(5, [{ line: 1 }, { line: 5 }, { line: 9 }])).toBe(5);
  });

  test('已不存在则 null', () => {
    expect(preserveActiveLine(3, [{ line: 1 }, { line: 5 }])).toBeNull();
  });

  test('空列表 / 无效 prev → null', () => {
    expect(preserveActiveLine(1, [])).toBeNull();
    expect(preserveActiveLine(null, [{ line: 1 }])).toBeNull();
  });
});

describe('outline-panel headingLineAtOrBefore', () => {
  const { headingLineAtOrBefore } = require(path.join(
    __dirname,
    '../../src/gui/renderer/outline-panel.js'
  ));

  test('取 ≤ 光标的最近标题', () => {
    const flat = [{ line: 1 }, { line: 5 }, { line: 9 }];
    expect(headingLineAtOrBefore(1, flat)).toBe(1);
    expect(headingLineAtOrBefore(6, flat)).toBe(5);
    expect(headingLineAtOrBefore(20, flat)).toBe(9);
  });
});

describe('setHeadings caret 优先于 preserve', () => {
  test('caretLine 覆盖仍存在的旧 active', () => {
    const {
      preserveActiveLine,
      headingLineAtOrBefore,
    } = require(path.join(__dirname, '../../src/gui/renderer/outline-panel.js'));
    const flat = [{ line: 1 }, { line: 5 }, { line: 9 }];
    const prev = 1;
    const caretLine = 6;
    // 模拟 setHeadings 优先级
    let kept = headingLineAtOrBefore(caretLine, flat);
    if (kept == null) kept = preserveActiveLine(prev, flat);
    expect(kept).toBe(5);
    expect(preserveActiveLine(prev, flat)).toBe(1);
  });
});

/**
 * 查找栏：选区打开不应跳到文档首个命中
 */
import * as path from 'path';

const {
  findAll,
  indexOfMatchForSelection,
} = require(path.join(__dirname, '../../src/gui/renderer/find-replace.js'));

describe('find-replace selection seed', () => {
  test('findAll 基础命中', () => {
    expect(findAll('aa bb aa', 'aa', {})).toEqual([
      { start: 0, end: 2 },
      { start: 6, end: 8 },
    ]);
  });

  test('indexOfMatchForSelection：精确落在选区对应的第二次出现', () => {
    const matches = findAll('foo x foo y foo', 'foo', {});
    expect(matches.length).toBe(3);
    // 选中第二次 foo（start=6）
    expect(indexOfMatchForSelection(matches, 6, 9)).toBe(1);
  });

  test('indexOfMatchForSelection：选区略宽于命中仍命中内部项', () => {
    const matches = [
      { start: 0, end: 3 },
      { start: 10, end: 13 },
    ];
    expect(indexOfMatchForSelection(matches, 9, 14)).toBe(1);
  });

  test('indexOfMatchForSelection：无重叠返回 -1', () => {
    expect(indexOfMatchForSelection([{ start: 0, end: 2 }], 5, 7)).toBe(-1);
  });
});

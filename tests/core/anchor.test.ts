import {
  parseAnchor,
  validateAnchor,
  sliceUtf16,
  anchorToLine,
  charOffsetAtLineIndex,
  shiftAnchorForInsert,
  isAnchorStale,
} from '../../src/core/anchor';
import { Annotation } from '../../src/core/model';

describe('anchor', () => {
  test('E26: parseAnchor 合法', () => {
    expect(parseAnchor({ start: 0, end: 5, quote: 'hello' })).toEqual({
      start: 0,
      end: 5,
      quote: 'hello',
    });
  });

  test('E27: parseAnchor 非法 start>=end', () => {
    expect(parseAnchor({ start: 5, end: 5 })).toBeUndefined();
    expect(parseAnchor({ start: 10, end: 3 })).toBeUndefined();
  });

  test('E28: validateAnchor 边界', () => {
    const text = 'abc';
    expect(validateAnchor(text, { start: 0, end: 3 })).toBe(true);
    expect(validateAnchor(text, { start: 0, end: 4 })).toBe(false);
  });

  test('E29: anchorToLine', () => {
    const text = 'line1\nline2\nline3';
    expect(anchorToLine(text, 0)).toBe(1);
    expect(anchorToLine(text, 6)).toBe(2);
    expect(anchorToLine(text, 12)).toBe(3);
  });

  test('E29b: charOffsetAtLineIndex + shiftAnchorForInsert', () => {
    const lines = ['# Title', '', '正文段落。'];
    const offset = charOffsetAtLineIndex(lines, 2, '\n');
    expect(offset).toBe('# Title\n\n'.length);
    const shifted = shiftAnchorForInsert({ start: offset, end: offset + 2, quote: '正文' }, offset, 50);
    expect(shifted.start).toBe(offset + 50);
    expect(shifted.end).toBe(offset + 52);
  });

  test('E30: isAnchorStale', () => {
    const text = 'hello world';
    const ann: Annotation = {
      id: '1',
      content: 'c',
      tags: [],
      level: 'info',
      status: 'open',
      created_at: '2026-01-01T00:00:00Z',
      anchor: { start: 0, end: 5, quote: 'hello' },
    };
    expect(isAnchorStale(text, ann)).toBe(false);
    expect(isAnchorStale('HELLO world', ann)).toBe(true);
    expect(isAnchorStale(text, { ...ann, anchor: { start: 0, end: 5 } })).toBe(false);
  });

  test('sliceUtf16 与 string.slice 一致', () => {
    const t = '你好abc';
    expect(sliceUtf16(t, 0, 2)).toBe('你好');
    expect(sliceUtf16(t, 2, 5)).toBe('abc');
  });
});

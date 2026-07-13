// @ts-nocheck
const sel = require('../../src/gui/renderer/selection-anchor.js');

describe('selection-anchor', () => {
  test('E40 lineOffsetUtf16', () => {
    const text = 'line1\nline2\nline3';
    expect(sel.lineOffsetUtf16(text, 1)).toBe(0);
    expect(sel.lineOffsetUtf16(text, 2)).toBe(6);
    expect(sel.lineOffsetUtf16(text, 3)).toBe(12);
  });

  test('E41 buildPlainTextMap strips bold', () => {
    const map = sel.buildPlainTextMap('**hello**');
    expect(map.plain).toBe('hello');
    expect(map.toSource[0]).toBe(2);
    expect(map.toSource[4]).toBe(6);
  });

  test('E42 buildPlainTextMap link text', () => {
    const map = sel.buildPlainTextMap('[link](http://x)');
    expect(map.plain).toBe('link');
  });

  test('E43 paragraphBounds', () => {
    const text = 'p1 line\np1 cont\n\np2';
    const b = sel.paragraphBounds(text, 1);
    expect(b.start).toBe(0);
    expect(text.slice(b.start, b.end)).toBe('p1 line\np1 cont');
  });

  test('E44 anchorToLine', () => {
    const text = 'a\nb\nc';
    expect(sel.anchorToLine(text, 2)).toBe(2);
  });

  test('E45 validateAnchor', () => {
    expect(sel.validateAnchor('abc', { start: 0, end: 2 })).toBe(true);
    expect(sel.validateAnchor('abc', { start: 0, end: 4 })).toBe(false);
  });

  test('E47 extractFenceContentRegions', () => {
    const text = '# t\n\n```js\nnpm install\n```\n';
    const regions = sel.extractFenceContentRegions(text);
    expect(regions.length).toBe(1);
    expect(regions[0].content.replace(/\n$/, '')).toBe('npm install');
    expect(text.slice(regions[0].contentStart, regions[0].contentEnd).replace(/\n$/, '')).toBe('npm install');
  });

  test('E48 fence region in simple block', () => {
    const text = '```bash\nnpm install foo\n```';
    const regions = sel.extractFenceContentRegions(text);
    expect(regions.length).toBe(1);
    expect(regions[0].content).toContain('npm install');
  });

  test('E46 isAnchorStale', () => {
    const ann = {
      anchor: { start: 0, end: 5, quote: 'hello' },
    };
    expect(sel.isAnchorStale('hello world', ann)).toBe(false);
    expect(sel.isAnchorStale('HELLO world', ann)).toBe(true);
  });
});

import * as path from 'path';

const inlineSelection = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/inline-selection-style.js'
));

const { rangesOverlap, INLINE_SEL } = inlineSelection;

describe('inline-selection-style', () => {
  it('rangesOverlap detects partial and full overlap', () => {
    expect(rangesOverlap({ from: 0, to: 10 }, { from: 5, to: 15 })).toBe(true);
    expect(rangesOverlap({ from: 5, to: 15 }, { from: 0, to: 10 })).toBe(true);
    expect(rangesOverlap({ from: 0, to: 5 }, { from: 5, to: 10 })).toBe(false);
    expect(rangesOverlap({ from: 0, to: 10 }, { from: 2, to: 8 })).toBe(true);
  });

  it('INLINE_SEL covers styled inline classes', () => {
    expect(INLINE_SEL).toContain('mda-cm-code');
    expect(INLINE_SEL).toContain('mda-cm-link');
  });
});

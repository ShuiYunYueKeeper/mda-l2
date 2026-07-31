/**
 * M8-A4b：SearchSession 骨架
 */
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SearchSession } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/search-session.js'
));

describe('SearchSession (M8-A4b)', () => {
  test('retains query and options across mode switches', () => {
    const s = new SearchSession();
    s.applyOptions({ query: 'foo', caseSensitive: true, regex: true });
    expect(s.toJSON()).toMatchObject({
      query: 'foo',
      caseSensitive: true,
      regex: true,
      matchIndex: -1,
      total: 0,
    });
  });

  test('setMatches updates total and clamps index', () => {
    const s = new SearchSession();
    s.setMatches([
      { start: 0, end: 3 },
      { start: 10, end: 13 },
    ]);
    expect(s.total).toBe(2);
    expect(s.matchIndex).toBe(0);
    expect(s.currentMatch()).toEqual({ start: 0, end: 3 });
    s.stepMatch(false);
    expect(s.matchIndex).toBe(1);
    s.stepMatch(true);
    expect(s.matchIndex).toBe(0);
  });
});

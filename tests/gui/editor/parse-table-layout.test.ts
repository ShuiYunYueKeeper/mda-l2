/**
 * GFM 表格 meta 与布局序列化
 */
import * as path from 'path';

const {
  parseGfmTableBlock,
  serializeGfmTableBlock,
  expandTableBlockRange,
  tableLayoutEqual,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/model/parse-table.js'));

describe('parse-table layout meta', () => {
  const tableBody = '| A | B |\n| --- | --- |\n| 1 | 2 |';

  test('serializeGfmTableBlock / parseGfmTableBlock roundtrip', () => {
    const parsed = parseGfmTableBlock(tableBody);
    expect(parsed).not.toBeNull();
    parsed.colWidths = [120, 80];
    parsed.rowHeights = [36, 40];
    const block = serializeGfmTableBlock(parsed);
    expect(block).toContain('@mda-table');
    const again = parseGfmTableBlock(block);
    expect(again.headers).toEqual(['A', 'B']);
    expect(again.colWidths).toEqual([120, 80]);
    expect(again.rowHeights).toEqual([36, 40]);
    expect(tableLayoutEqual(parsed, again)).toBe(true);
  });

  test('expandTableBlockRange includes meta line', () => {
    const meta = '[comment]: <> (@mda-table {"colWidths":[100]})\n';
    const text = meta + tableBody + '\n';
    const gfmFrom = text.indexOf('| A');
    const expanded = expandTableBlockRange(text, gfmFrom, text.length);
    expect(text.slice(expanded.from, expanded.to).trim()).toBe((meta + tableBody).trim());
  });

  test('sanitizeLayoutNumbers clamps insane meta dimensions', () => {
    const { sanitizeLayoutNumbers, parseGfmTableBlock, hasTableLayoutMeta } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-table.js'
    ));
    expect(typeof hasTableLayoutMeta).toBe('function');
    expect(sanitizeLayoutNumbers([99999, 50], 600)).toEqual([600, 50]);
    const meta =
      '[comment]: <> (@mda-table {"colWidths":[80000],"rowHeights":[50000,50000]})\n' + tableBody;
    const parsed = parseGfmTableBlock(meta);
    expect(parsed.colWidths).toEqual([4000]);
    expect(parsed.rowHeights).toEqual([600, 600]);
  });
});

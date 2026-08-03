/**
 * M8-C3 表格结构化编辑
 */
import * as path from 'path';

const {
  cloneTableData,
  insertTableRow,
  insertTableColumn,
  deleteTableRow,
  deleteTableColumn,
  clearTableSelection,
  extractTableTSV,
  extractTableHtml,
  pasteTableTSV,
  isFullColumnSelection,
  isFullRowSelection,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/model/table-model.js'));

describe('table-model', () => {
  const sample = {
    headers: ['A', 'B'],
    aligns: ['left', 'left'],
    rows: [
      ['1', '2'],
      ['3', '4'],
    ],
  };

  test('insertTableRow / insertTableColumn', () => {
    const p = cloneTableData(sample);
    insertTableRow(p, 1, 'after');
    expect(p.rows).toHaveLength(3);
    expect(p.rows[2]).toEqual(['', '']);
    insertTableColumn(p, 0, 'after');
    expect(p.headers).toEqual(['A', '', 'B']);
    expect(p.rows[0]).toEqual(['1', '', '2']);
  });

  test('deleteTableRow / deleteTableColumn 保留至少一列', () => {
    const p = cloneTableData(sample);
    deleteTableRow(p, 0);
    expect(p.rows).toEqual([['3', '4']]);
    deleteTableColumn(p, 1);
    expect(p.headers).toEqual(['A']);
    deleteTableColumn(p, 0);
    expect(p.headers).toEqual(['A']);
  });

  test('extract / clear / paste TSV', () => {
    const p = cloneTableData(sample);
    const tsv = extractTableTSV(p, { kind: 'rect', row1: -1, col1: 0, row2: 0, col2: 1 });
    expect(tsv).toBe('A\tB\n1\t2');
    clearTableSelection(p, { kind: 'row', row: 0 });
    expect(p.rows[0]).toEqual(['', '']);
    const dest = cloneTableData({ headers: ['X'], aligns: ['left'], rows: [['']] });
    pasteTableTSV(dest, -1, 0, 'H1\tH2\nr1\tr2');
    expect(dest.headers).toEqual(['H1', 'H2']);
    expect(dest.rows[0]).toEqual(['r1', 'r2']);
  });

  test('gutter 多列/多行选区 + HTML 剪贴板', () => {
    const p = cloneTableData(sample);
    const multiCol = {
      kind: 'rect' as const,
      row1: -1,
      col1: 0,
      row2: Number.MAX_SAFE_INTEGER,
      col2: 1,
    };
    expect(isFullColumnSelection(multiCol)).toBe(true);
    expect(isFullRowSelection(multiCol)).toBe(false);
    expect(extractTableTSV(p, multiCol)).toBe('A\tB\n1\t2\n3\t4');
    expect(extractTableHtml(p, multiCol)).toBe(
      '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>'
    );

    const multiRow = {
      kind: 'rect' as const,
      row1: 0,
      col1: 0,
      row2: 1,
      col2: Number.MAX_SAFE_INTEGER,
    };
    expect(isFullRowSelection(multiRow)).toBe(true);
    expect(extractTableTSV(p, multiRow)).toBe('1\t2\n3\t4');
  });

  test('extractTableMarkdown 供正文粘贴为 GFM 表格', () => {
    const {
      extractTableMarkdown,
      clipboardLooksLikeGfmTable,
      parseClipboardTable,
      isEntireTableSelection,
    } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/table-model.js'
    ));
    const p = cloneTableData(sample);
    const md = extractTableMarkdown(p, {
      kind: 'rect',
      row1: -1,
      col1: 0,
      row2: Number.MAX_SAFE_INTEGER,
      col2: 1,
    });
    expect(md).toContain('| A | B |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 1 | 2 |');
    expect(md).toContain('| 3 | 4 |');
    expect(clipboardLooksLikeGfmTable(md)).toBe(true);
    const grid = parseClipboardTable(md);
    expect(grid[0]).toEqual(['A', 'B']);
    expect(grid[1]).toEqual(['1', '2']);

    expect(
      isEntireTableSelection(p, {
        kind: 'rect',
        row1: -1,
        col1: 0,
        row2: Number.MAX_SAFE_INTEGER,
        col2: 1,
      })
    ).toBe(true);
    expect(
      isEntireTableSelection(p, {
        kind: 'rect',
        row1: -1,
        col1: 0,
        row2: Number.MAX_SAFE_INTEGER,
        col2: 0,
      })
    ).toBe(false);
  });
});

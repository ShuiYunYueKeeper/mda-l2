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
  pasteTableTSV,
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
});

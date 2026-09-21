/**
 * 表格块内查找：文档偏移 → 单元格映射
 */
import * as path from 'path';

const { buildTableCellDocMap } = require(
  path.join(__dirname, '../../../src/gui/renderer/editor/table-find-highlight.js')
);

describe('table-find-highlight cell map', () => {
  const block =
    '| Name | Value |\n| --- | --- |\n| **test** | foo |';
  const blockFrom = 100;

  test('maps header and body cells with doc offsets', () => {
    const cells = buildTableCellDocMap(block, blockFrom);
    expect(cells.length).toBe(4);
    expect(cells[0]).toMatchObject({ row: -1, col: 0 });
    expect(cells[1]).toMatchObject({ row: -1, col: 1 });
    expect(cells[2]).toMatchObject({ row: 0, col: 0 });
    expect(cells[3]).toMatchObject({ row: 0, col: 1 });

    const bodyCell = cells[2];
    const localTest = 'test';
    const md = block.slice(
      bodyCell.docFrom - blockFrom,
      bodyCell.docTo - blockFrom
    );
    const idx = md.indexOf(localTest);
    expect(idx).toBeGreaterThanOrEqual(0);
    const matchFrom = bodyCell.docFrom + idx;
    const matchTo = matchFrom + localTest.length;
    expect(blockFrom).toBeLessThan(matchFrom);
    expect(matchTo).toBeLessThanOrEqual(bodyCell.docTo);
  });

  test('cell markdown slice uses absolute doc offsets', () => {
    const blockFrom = 500;
    const block =
      '| API | 说明 |\n| --- | --- |\n| `GetCompanyTabButtonMgr` | C ABI 导出 |';
    const cells = buildTableCellDocMap(block, blockFrom);
    const bodyCell = cells.find(function (c: { row: number; col: number }) {
      return c.row === 0 && c.col === 0;
    });
    expect(bodyCell).toBeTruthy();
    const cellMd = block.slice(
      bodyCell.docFrom - blockFrom,
      bodyCell.docTo - blockFrom
    );
    expect(cellMd).toContain('GetCompanyTabButtonMgr');
    const idx = cellMd.toLowerCase().indexOf('company');
    expect(idx).toBeGreaterThanOrEqual(0);
    const { markdownToVisibleOffset } = require(
      path.join(__dirname, '../../../src/gui/renderer/editor/widgets/table-cell-content.js')
    );
    const visStart = markdownToVisibleOffset(cellMd, idx);
    const visEnd = markdownToVisibleOffset(cellMd, idx + 'company'.length);
    expect(visEnd).toBeGreaterThan(visStart);
  });
});

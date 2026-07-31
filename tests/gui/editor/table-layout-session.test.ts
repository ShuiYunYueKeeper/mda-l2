'use strict';

const path = require('path');
const {
  setTableLayoutSession,
  getTableLayoutSession,
  applyTableLayoutSession,
  migrateTableLayoutSession,
  mergeTableLayoutSession,
  clearTableLayoutSession,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/widgets/table-layout-session.js'));

describe('table-layout-session', () => {
  const source = '| a | b |\n| --- | --- |\n| 1 | 2 |';

  afterEach(() => {
    clearTableLayoutSession(source);
  });

  test('保存并在重建时恢复列宽', () => {
    const parsed = {
      headers: ['a', 'b'],
      aligns: ['left', 'left'],
      rows: [['1', '2']],
      colWidths: [120, 80],
      rowHeights: [32, 28],
    };
    setTableLayoutSession(source, parsed);
    const fresh = {
      headers: ['a', 'b'],
      aligns: ['left', 'left'],
      rows: [['1', '2']],
    } as { headers: string[]; aligns: string[]; rows: string[][]; colWidths?: number[]; rowHeights?: number[] };
    applyTableLayoutSession(source, fresh);
    expect(fresh.colWidths).toEqual([120, 80]);
    expect(fresh.rowHeights).toEqual([32, 28]);
    expect(getTableLayoutSession(source)).toEqual({
      colWidths: [120, 80],
      rowHeights: [32, 28],
    });
  });

  test('结构变更后迁移会话键并补齐新列宽', () => {
    const oldSource = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    const newSource = '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |';
    setTableLayoutSession(oldSource, {
      headers: ['a', 'b'],
      aligns: ['left', 'left'],
      rows: [['1', '2']],
      colWidths: [120, 80],
      rowHeights: [32, 28],
    });
    migrateTableLayoutSession(oldSource, newSource);
    expect(getTableLayoutSession(oldSource)).toBeNull();
    const fresh = {
      headers: ['a', 'b', 'c'],
      aligns: ['left', 'left', 'left'],
      rows: [['1', '2', '3']],
    } as { headers: string[]; aligns: string[]; rows: string[][]; colWidths?: number[]; rowHeights?: number[] };
    applyTableLayoutSession(newSource, fresh);
    expect(fresh.colWidths).toEqual([120, 80, 0]);
    expect(fresh.rowHeights).toEqual([32, 28]);
  });
});

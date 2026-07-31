/**
 * M8-C1：只读块、表格 v1
 */
import * as path from 'path';

const { detectFrontMatter } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/readonly-blocks.js'
));
const { parseGfmTable } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/parse-table.js'
));
const { buildDecorationSpecs } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/build-specs.js'
));

describe('M8-C1 readonly + table v1', () => {
  test('detectFrontMatter 识别 YAML 头', () => {
    const text = '---\ntitle: x\n---\n\n# Body\n';
    const fm = detectFrontMatter(text);
    expect(fm).not.toBeNull();
    expect(fm.from).toBe(0);
    expect(text.slice(fm.from, fm.to)).toContain('title: x');
  });

  test('聚焦表格块时保持 widget 渲染（就地编辑，不显露源码）', () => {
    const table = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
    const specs = buildDecorationSpecs(
      table,
      [{ type: 'Table', from: 0, to: table.length }],
      [],
      {
        focusedBlock: { from: 0, to: table.length, kind: 'table' },
        widgetEnabled: function (kind: string) { return kind === 'table'; },
      }
    );
    expect(specs.some((s: { kind: string; widget?: string }) => s.kind === 'widget' && s.widget === 'table')).toBe(true);
    expect(specs.some((s: { kind: string; cls?: string }) => s.kind === 'raw' && s.cls === 'mda-cm-focused-source')).toBe(false);
  });

  test('parseGfmTable 供表格 v1 渲染', () => {
    const parsed = parseGfmTable('| h1 | h2 |\n| --- | --- |\n| c1 | c2 |');
    expect(parsed!.headers).toEqual(['h1', 'h2']);
    expect(parsed!.rows[0]).toEqual(['c1', 'c2']);
  });
});

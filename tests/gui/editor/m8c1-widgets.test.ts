/**
 * M8-C1 / S24：批注隐藏、表格/图片/围栏解析
 */
import * as path from 'path';

const { findAnnotationHideRanges } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/anno-lines.js'
));
const { parseGfmTable } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/parse-table.js'
));
const { parseImageMarkdown } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/parse-image.js'
));
const { parseFencedCode } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/parse-fence.js'
));
const { buildDecorationSpecs } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/build-specs.js'
));

describe('S24 annotation hide ranges', () => {
  test('围栏外批注行隐藏，围栏内不隐藏', () => {
    const tick = '```';
    const anno =
      '[comment]: <> (@anno {"id":"1","content":"x","tags":[],"level":"info","status":"open","created_at":"2020-01-01T00:00:00.000Z"})';
    const text = ['para', anno, tick, anno, tick, ''].join('\n');
    const ranges = findAnnotationHideRanges(text);
    expect(ranges).toHaveLength(1);
    expect(text.slice(ranges[0].from, ranges[0].to)).toContain('@anno');
  });
});

describe('S14 parseGfmTable', () => {
  test('解析表头与数据行', () => {
    const t = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    const p = parseGfmTable(t);
    expect(p).toEqual({
      headers: ['a', 'b'],
      aligns: ['left', 'left'],
      rows: [['1', '2']],
    });
  });

  test('serializeGfmTable 往返', () => {
    const { serializeGfmTable, expandGfmTableRange } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-table.js'
    ));
    const src = '| a | b |\n| --- | :---: |\n| 1 | 2 |';
    const p = parseGfmTable(src);
    expect(p).not.toBeNull();
    const out = serializeGfmTable(p!);
    expect(parseGfmTable(out)).toEqual(p);
    const expanded = expandGfmTableRange(src + '\n\npara', 0, src.length);
    expect(src.slice(expanded.from, expanded.to)).toBe(src);
  });
});

describe('S22 parseImageMarkdown', () => {
  test('解析 alt 与 src', () => {
    expect(parseImageMarkdown('![MDA Logo](mda-logo.png)')).toEqual({
      alt: 'MDA Logo',
      src: 'mda-logo.png',
      title: '',
    });
  });
});

describe('S13 parseFencedCode', () => {
  test('解析语言与代码', () => {
    const tick = '```';
    const slice = `${tick}bash\nmda-cli scan\n${tick}`;
    expect(parseFencedCode(slice)).toEqual({ lang: 'bash', code: 'mda-cli scan' });
  });
});

describe('buildDecorationSpecs widgets', () => {
  test('批注 → hide-line；Table/Image/Code → 各自 widget', () => {
    const anno =
      '[comment]: <> (@anno {"id":"1","content":"x","tags":[],"level":"info","status":"open","created_at":"2020-01-01T00:00:00.000Z"})';
    const text = anno + '\n\npara\n';
    expect(
      buildDecorationSpecs(text, [], []).some((s: { kind: string }) => s.kind === 'hide-line')
    ).toBe(true);

    const withWidgets = buildDecorationSpecs(
      'abcdefghij',
      [
        { type: 'Table', from: 0, to: 3 },
        { type: 'Image', from: 3, to: 6 },
        { type: 'FencedCode', from: 6, to: 10 },
      ],
      [],
      { widgetEnabled: function () { return true; } }
    );
    const widgets = withWidgets
      .filter((s: { kind: string }) => s.kind === 'widget')
      .map((s: { widget?: string }) => s.widget)
      .sort();
    expect(widgets).toEqual(['code', 'image', 'table']);
  });
});

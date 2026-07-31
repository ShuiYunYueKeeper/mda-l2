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
    const withTrail = expandGfmTableRange(src + '\n\n', 0, src.length + 2);
    expect(src.slice(withTrail.from, withTrail.to)).toBe(src);
  });

  test('expandGfmTableRange 不因语法树偏大的 to 吞掉表格后正文', () => {
    const { expandGfmTableRange } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-table.js'
    ));
    const table = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
    const text = table + '\n## 二、后续章节\n\n正文段落。\n';
    const inflatedTo = text.length;
    const expanded = expandGfmTableRange(text, 0, inflatedTo);
    expect(text.slice(expanded.from, expanded.to)).toBe(table);
    expect(expanded.to).toBeLessThan(text.indexOf('##'));
  });

  test('单连字符分隔行（GFM 最小形式）可解析', () => {
    const p = parseGfmTable('| h |\n| - |\n| x |');
    expect(p).toEqual({
      headers: ['h'],
      aligns: ['left'],
      rows: [['x']],
    });
  });

  test('单元格含竖线时转义往返', () => {
    const { serializeGfmTable, escapeCell } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-table.js'
    ));
    const p = {
      headers: ['a', 'b'],
      aligns: ['left', 'left'],
      rows: [['x|y', 'z']],
    };
    expect(escapeCell('a|b')).toBe('a\\|b');
    const out = serializeGfmTable(p);
    expect(out).toContain('x\\|y');
    expect(parseGfmTable(out)).toEqual(p);
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
    expect(parseFencedCode(slice)).toEqual({ lang: 'bash', code: 'mda-cli scan', marker: '```' });
  });

  test('serializeFencedCode 往返', () => {
    const { serializeFencedCode } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-fence.js'
    ));
    const src = '```js\nconst x = 1;\n```';
    const parsed = parseFencedCode(src);
    expect(parsed).not.toBeNull();
    const out = serializeFencedCode(parsed!.lang, parsed!.code, parsed!.marker);
    expect(parseFencedCode(out)).toEqual(parsed);
  });

  test('expandFenceBlockRange 不因语法树偏大的 to 吞掉围栏后正文', () => {
    const { expandFenceBlockRange } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-fence.js'
    ));
    const tick = '```';
    const fence = tick + 'mermaid\nflowchart LR\n  A --> B\n' + tick + '\n';
    const text = fence + '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n## Section\n';
    const from = text.indexOf(tick);
    const expanded = expandFenceBlockRange(text, from, text.length);
    expect(text.slice(expanded.from, expanded.to)).toBe(fence);
    expect(text.indexOf('## Section')).toBeGreaterThan(expanded.to);
    expect(text.indexOf('| a')).toBeGreaterThanOrEqual(expanded.to);
  });

  test('expandFenceBlockRange 未闭合围栏时不信任偏大的 to', () => {
    const { expandFenceBlockRange } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-fence.js'
    ));
    const tick = '```';
    const open = tick + '\nline one\nline two\n';
    const text = open + '## 后续章节\n\n正文。\n';
    const from = text.indexOf(tick);
    const expanded = expandFenceBlockRange(text, from, text.length);
    expect(text.slice(expanded.from, expanded.to)).toBe(open);
    expect(text.indexOf('## 后续章节')).toBeGreaterThanOrEqual(expanded.to);
  });

  test('expandFenceBlockRange 语法树 from 落在 @anno 行时仍定位到后续围栏', () => {
    const { expandFenceBlockRange } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-fence.js'
    ));
    const anno =
      '[comment]: <> (@anno {"id":"x","content":"demo","tags":[],"level":"info","status":"open","created_at":"..."})';
    const fence =
      '```markdown\n[comment]: <> (@anno {"id":"..."})\n\n这是被批注的段落。\n```\n';
    const text = anno + '\n批注是独立成行的 Markdown 注释。\n\n' + fence + '\n![img](a.png)\n';
    const from = text.indexOf('"content":"demo"');
    const expanded = expandFenceBlockRange(text, from, text.length);
    expect(text.slice(expanded.from, expanded.to)).toBe(fence);
    expect(text.indexOf('![img]')).toBeGreaterThanOrEqual(expanded.to);
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

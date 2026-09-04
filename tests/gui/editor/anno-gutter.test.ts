import * as path from 'path';

const { buildAnnoGutterMarks, mostSevereAnno, appendAnnoLineDecorations } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/anno-gutter.js'
));

const COLORS = {
  critical: '#e74c3c',
  major: '#e67e22',
  minor: '#f1c40f',
  info: '#95a5a6',
};
const SEV = { critical: 3, major: 2, minor: 1, info: 0 };

describe('anno gutter (align 2.0 decorateParagraphs)', () => {
  test('mostSevereAnno 取最高级别', () => {
    const top = mostSevereAnno(
      [{ level: 'info' }, { level: 'major' }, { level: 'minor' }],
      SEV
    );
    expect(top.level).toBe('major');
  });

  test('有批注段落 → startLine + 级别色', () => {
    const scan = {
      paragraphs: [
        {
          startLine: 5,
          annotations: [{ level: 'major' }, { level: 'info' }],
        },
        { startLine: 8, annotations: [] },
      ],
    };
    const marks = buildAnnoGutterMarks('', scan, COLORS, SEV);
    expect(marks).toEqual([{ line: 5, color: COLORS.major }]);
  });

  test('filterAnnotation 仅保留过滤后批注的色条', () => {
    const scan = {
      paragraphs: [
        {
          startLine: 3,
          annotations: [{ level: 'critical' }, { level: 'info' }],
        },
        {
          startLine: 7,
          annotations: [{ level: 'major' }],
        },
      ],
    };
    const marks = buildAnnoGutterMarks('', scan, COLORS, SEV, function (a: { level: string }) {
      return a.level !== 'critical';
    });
    expect(marks).toEqual([
      { line: 3, color: COLORS.info },
      { line: 7, color: COLORS.major },
    ]);
  });

  test('appendAnnoLineDecorations 写入 line 装饰层', () => {
    const text = 'a\n\nbody line\n';
    const lineDecos: { from: number; to: number; deco: { spec: { class: string } } }[] = [];
    const fakeDeco = {
      line: (spec: { class: string }) => ({ spec }),
    };
    appendAnnoLineDecorations(
      text,
      lineDecos,
      {
        parseAnnotations: () => ({
          paragraphs: [{ startLine: 3, annotations: [{ level: 'info' }] }],
        }),
        levelColors: COLORS,
        levelSeverity: SEV,
      },
      fakeDeco
    );
    expect(lineDecos).toHaveLength(1);
    expect(lineDecos[0].from).toBe(3);
    expect(lineDecos[0].deco.spec.class).toBe('mda-anno-block-line');
  });
});

import * as path from 'path';

const { buildAnnoGutterMarks, mostSevereAnno } = require(path.join(
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
});

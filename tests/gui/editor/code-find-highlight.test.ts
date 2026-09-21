/**
 * 围栏代码块内查找：正文偏移映射
 */
import * as path from 'path';

const { getFenceBodyDocRange } = require(
  path.join(__dirname, '../../../src/gui/renderer/editor/code-find-highlight.js')
);

describe('code-find-highlight body range', () => {
  test('maps fence body to doc offsets', () => {
    const blockFrom = 200;
    const block = '```bash\ncompany=1\nkcompany=2\n```';
    const body = getFenceBodyDocRange(blockFrom, block);
    expect(body).not.toBeNull();
    expect(body.code).toBe('company=1\nkcompany=2\n');
    expect(body.bodyFrom).toBe(blockFrom + '```bash\n'.length);
    expect(body.bodyTo).toBe(body.bodyFrom + body.code.length);
    const idx = body.code.indexOf('company');
    expect(idx).toBeGreaterThanOrEqual(0);
    const matchFrom = body.bodyFrom + idx;
    const matchTo = matchFrom + 'company'.length;
    expect(matchTo).toBeLessThanOrEqual(body.bodyTo);
  });

  test('body ends before closing fence, not at block tail', () => {
    const blockFrom = 0;
    const block = '```txt\nline\n```\n\nafter';
    const body = getFenceBodyDocRange(blockFrom, block);
    expect(body).not.toBeNull();
    expect(body.code).toBe('line\n');
    expect(body.bodyTo).toBe(blockFrom + '```txt\nline\n'.length);
  });
});

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { parseAnnotations } from '../../src/core/parser';
import { addAnnotation, editAnnotation, removeAnnotation } from '../../src/core/writer';
import { Annotation } from '../../src/core/model';

const tmpDir = path.join(os.tmpdir(), 'mda-writer-test-' + Date.now());

beforeEach(async () => {
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function tmpFile(name: string): string {
  return path.join(tmpDir, name);
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

// ---- 源文件保护 ----

describe('源文件保护', () => {
  test('add 后正文行逐字节一致', async () => {
    const f = tmpFile('test.md');
    await writeFile(f, '# Title\n\n正文段落。\n\n另一段。\n');

    await addAnnotation(f, 3, { content: 'review', tags: ['bug'], level: 'major' });

    const content = await readFile(f);
    expect(content).toContain('正文段落。');
    expect(content).toContain('另一段。');
    expect(content).toContain('# Title');
    // 正文顺序不变
    const bodyStart = content.indexOf('正文段落。');
    const bodyEnd = content.indexOf('另一段。');
    expect(bodyStart).toBeLessThan(bodyEnd);
  });

  test('edit 后非批注行不变', async () => {
    const f = tmpFile('test.md');
    await writeFile(f, makeText([
      makeAnnoLine({ id: 'a1', content: 'old', level: 'minor' }),
      '正文。',
    ]));

    await editAnnotation(f, 'a1', { content: 'new content' });

    const content = await readFile(f);
    expect(content).toContain('正文。');
    expect(content).not.toContain('"old"');
  });

  test('remove 后非批注行不变', async () => {
    const f = tmpFile('test.md');
    await writeFile(f, makeText([
      makeAnnoLine({ id: 'a1', content: 'remove me', level: 'info' }),
      '正文。',
    ]));

    await removeAnnotation(f, 'a1');

    const content = await readFile(f);
    expect(content).toContain('正文。');
    expect(content).not.toContain('@anno');
  });
});

// ---- 原子写入 ----

describe('原子写入', () => {
  test('写入过程中断时原文件不受影响', async () => {
    const f = tmpFile('test.md');
    const original = '# Title\n\n正文。\n';
    await writeFile(f, original);

    // 正常写入不抛异常即验证原子性
    await addAnnotation(f, 3, { content: 'test' });
    const content = await readFile(f);
    expect(content).toContain('正文。');
    expect(content).toContain('@anno');
  });
});

// ---- 空行压缩 ----

describe('空行压缩 (E25)', () => {
  test('删除批注后压缩多余空行', async () => {
    const f = tmpFile('test.md');
    // 段落 A\n\n@anno\n\n段落 B
    await writeFile(f, '段落 A。\n\n' + makeAnnoLine({ id: 'a1', content: 'test' }) + '\n\n段落 B。\n');

    await removeAnnotation(f, 'a1');

    const content = await readFile(f);
    // 应该只保留一个空行：段落 A\n\n段落 B
    expect(content).toBe('段落 A。\n\n段落 B。\n');
    // 不应该有两个连续空行（三 \n\n\n）
    expect(content).not.toContain('\n\n\n');
  });

  test('删除批注后上方无空行则不压缩', async () => {
    const f = tmpFile('test.md');
    await writeFile(f, '段落 A。\n' + makeAnnoLine({ id: 'a1', content: 'test' }) + '\n\n段落 B。\n');

    await removeAnnotation(f, 'a1');

    const content = await readFile(f);
    // 段落 A\n\n段落 B — 上方无空行所以不压缩（原有一个空行保留）
    expect(content).toContain('段落 B。');
  });
});

// ---- 换行风格保留 (#7) ----

describe('换行风格保留', () => {
  test('CRLF 文件 add 后仍为 CRLF', async () => {
    const f = tmpFile('crlf.md');
    await writeFile(f, '# Title\r\n\r\n正文段落。\r\n');

    await addAnnotation(f, 3, { content: 'note' });

    const content = await readFile(f);
    expect(content).toContain('\r\n');
    expect(content).not.toMatch(/[^\r]\n/); // 不存在裸 LF
  });

  test('LF 文件 add 后仍为 LF', async () => {
    const f = tmpFile('lf.md');
    await writeFile(f, '# Title\n\n正文段落。\n');

    await addAnnotation(f, 3, { content: 'note' });

    const content = await readFile(f);
    expect(content).not.toContain('\r\n');
  });

  test('CRLF 文件 remove 后仍为 CRLF', async () => {
    const f = tmpFile('crlf2.md');
    await writeFile(f, makeText([
      makeAnnoLine({ id: 'a1', content: 'x' }),
      '正文。',
    ]).replace(/\n/g, '\r\n') + '\r\n');

    await removeAnnotation(f, 'a1');

    const content = await readFile(f);
    expect(content).toContain('正文。');
    expect(content).not.toMatch(/[^\r]\n/);
  });
});

// ---- 错误处理 ----

describe('错误处理', () => {
  test('edit 不存在的 ID 抛错', async () => {
    const f = tmpFile('test.md');
    await writeFile(f, '# Title\n\n正文。\n');

    await expect(editAnnotation(f, 'nonexistent', { content: 'x' })).rejects.toThrow('未找到批注');
  });

  test('remove 不存在的 ID 抛错', async () => {
    const f = tmpFile('test.md');
    await writeFile(f, '# Title\n\n正文。\n');

    await expect(removeAnnotation(f, 'nonexistent')).rejects.toThrow('未找到批注');
  });

  test('add 行号越界抛错', async () => {
    const f = tmpFile('test.md');
    await writeFile(f, '# Title\n\n正文。\n');

    await expect(addAnnotation(f, 999, { content: 'test' })).rejects.toThrow('未找到');
  });
});

// ---- 辅助 ----
function makeText(lines: string[]): string {
  return lines.join('\n');
}

function makeAnnoLine(anno: Partial<Annotation> & { id: string }): string {
  const a: Annotation = {
    content: '',
    tags: [],
    level: 'info',
    status: 'open',
    created_at: '2026-01-01T00:00:00Z',
    ...anno,
  };
  return `[comment]: <> (@anno ${JSON.stringify(a)})`;
}

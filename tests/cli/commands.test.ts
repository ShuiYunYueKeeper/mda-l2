import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanCommand } from '../../src/cli/commands/scan';
import { addCommand } from '../../src/cli/commands/add';
import { editCommand } from '../../src/cli/commands/edit';
import { Annotation } from '../../src/core/model';

let tmpDir: string;
let stdout: string;
let stderr: string;
let stdoutSpy: jest.SpyInstance;
let stderrSpy: jest.SpyInstance;
let exitSpy: jest.SpyInstance;

class ExitError extends Error {
  constructor(public code: number) {
    super('process.exit:' + code);
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-cli-test-'));
  stdout = '';
  stderr = '';
  stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((s: any) => {
    stdout += s;
    return true;
  });
  stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((s: any) => {
    stderr += s;
    return true;
  });
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code ?? 0);
  }) as any);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  exitSpy.mockRestore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

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

function writeMd(name: string, lines: string[]): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, lines.join('\n') + '\n', 'utf-8');
  return p;
}

describe('scan — 单文件', () => {
  test('设置 file 字段并输出段落摘要 (#4 #5)', () => {
    const f = writeMd('a.md', [
      makeAnnoLine({ id: 'a1', content: '需要复核此处' }),
      '这是被批注的段落正文。',
    ]);

    scanCommand(f, { format: 'json' });
    const rows = JSON.parse(stdout) as Annotation[];
    expect(rows).toHaveLength(1);
    expect(rows[0].file).toBe(f);

    // 表格输出含段落摘要
    stdout = '';
    scanCommand(f, {});
    expect(stdout).toContain('段落摘要');
    expect(stdout).toContain('这是被批注的段落正文');
    expect(stdout).toContain('需要复核此处');
  });
});

describe('scan — 目录', () => {
  test('每行显示真实文件路径而非目录 (#4)', () => {
    writeMd('one.md', [makeAnnoLine({ id: 'a1', content: 'c1' }), '段落一。']);
    writeMd('two.md', [makeAnnoLine({ id: 'a2', content: 'c2' }), '段落二。']);

    scanCommand(tmpDir, { format: 'json', recursive: true });
    const rows = JSON.parse(stdout) as Annotation[];
    const files = rows.map(r => path.basename(r.file ?? '')).sort();
    expect(files).toEqual(['one.md', 'two.md']);
  });
});

describe('scan — 过滤值校验', () => {
  test('非法 --level 退出码 1', () => {
    const f = writeMd('a.md', [makeAnnoLine({ id: 'a1', content: 'c' }), '正文。']);
    expect(() => scanCommand(f, { level: 'bogus' })).toThrow(ExitError);
    expect(stderr).toContain('无效级别');
  });

  test('非法 --status 退出码 1', () => {
    const f = writeMd('a.md', [makeAnnoLine({ id: 'a1', content: 'c' }), '正文。']);
    expect(() => scanCommand(f, { status: 'bogus' })).toThrow(ExitError);
    expect(stderr).toContain('无效状态');
  });
});

describe('add — 校验与回环', () => {
  test('非法 --level 不写文件并退出 (#3)', async () => {
    const f = writeMd('a.md', ['# 标题', '', '正文段落。']);
    const before = fs.readFileSync(f, 'utf-8');
    await expect(addCommand(f, '3', 'note', { level: 'bogus' })).rejects.toThrow(ExitError);
    expect(stderr).toContain('无效级别');
    expect(fs.readFileSync(f, 'utf-8')).toBe(before);
  });

  test('合法添加后可被 scan 重新解析', async () => {
    const f = writeMd('a.md', ['# 标题', '', '正文段落。']);
    await addCommand(f, '3', '新批注', { level: 'major', tags: 'bug,ui' });
    const id = stdout.trim();
    expect(id).toBeTruthy();

    stdout = '';
    scanCommand(f, { format: 'json' });
    const rows = JSON.parse(stdout) as Annotation[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].level).toBe('major');
    expect(rows[0].tags).toEqual(['bug', 'ui']);
  });
});

describe('edit — 校验', () => {
  test('非法 --status 退出 (#3)', async () => {
    const f = writeMd('a.md', [makeAnnoLine({ id: 'a1', content: 'c' }), '正文。']);
    await expect(editCommand(f, 'a1', { status: 'bogus' })).rejects.toThrow(ExitError);
    expect(stderr).toContain('无效状态');
  });

  test('合法编辑后批注仍可解析', async () => {
    const f = writeMd('a.md', [makeAnnoLine({ id: 'a1', content: 'old' }), '正文。']);
    await editCommand(f, 'a1', { status: 'resolved', content: 'new' });

    stdout = '';
    scanCommand(f, { format: 'json' });
    const rows = JSON.parse(stdout) as Annotation[];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('resolved');
    expect(rows[0].content).toBe('new');
  });
});

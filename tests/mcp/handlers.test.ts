import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectAnnotations } from '../../src/cli/scan-service';
import {
  handleMdaAdd,
  handleMdaEdit,
  handleMdaExportReviewPrompt,
  handleMdaReadFile,
  handleMdaRemove,
  handleMdaScan,
  scanAnnotationsForTest,
} from '../../src/mcp/handlers';
import { isPathInsideRoot } from '../../src/mcp/workspace';

describe('MCP handlers', () => {
  let tmpDir: string;
  let sampleFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-mcp-'));
    sampleFile = path.join(tmpDir, 'doc.md');
    fs.writeFileSync(
      sampleFile,
      '# Title\n\nParagraph one.\n\nParagraph two.\n',
      'utf-8',
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('mda_scan matches CLI collectAnnotations JSON', async () => {
    const add = await handleMdaAdd(
      { workspace: tmpDir },
      { file: 'doc.md', line: 3, content: 'scan test', level: 'major' },
    );
    const added = JSON.parse(add.content[0].text).annotation as { id: string };

    const cli = collectAnnotations(sampleFile);
    const mcpText = (await handleMdaScan({ workspace: tmpDir }, { path: 'doc.md' })).content[0].text;
    const mcp = JSON.parse(mcpText);

    expect(mcp).toHaveLength(cli.length);
    expect(mcp.find((a: { id: string }) => a.id === added.id)?.content).toBe('scan test');
    expect(cli.find(a => a.id === added.id)?.content).toBe('scan test');
  });

  test('mda_read_file returns content and scanResult', () => {
    const res = handleMdaReadFile({ workspace: tmpDir }, { file: 'doc.md' });
    const data = JSON.parse(res.content[0].text);
    expect(data.content).toContain('# Title');
    expect(data.scanResult.paragraphs.length).toBeGreaterThan(0);
  });

  test('mda_export_review_prompt includes annotation summary', async () => {
    await handleMdaAdd(
      { workspace: tmpDir },
      { file: 'doc.md', line: 3, content: 'review me', level: 'critical' },
    );
    const res = handleMdaExportReviewPrompt({ workspace: tmpDir }, { files: ['doc.md'] });
    const data = JSON.parse(res.content[0].text);
    expect(data.prompt).toContain('review me');
    expect(data.prompt).toContain('doc.md');
  });

  test('mda_remove deletes annotation', async () => {
    const add = await handleMdaAdd(
      { workspace: tmpDir },
      { file: 'doc.md', line: 3, content: 'to remove', level: 'info' },
    );
    const id = JSON.parse(add.content[0].text).annotation.id as string;
    await handleMdaRemove({ workspace: tmpDir }, { file: 'doc.md', id });
    const after = scanAnnotationsForTest(tmpDir, 'doc.md');
    expect(after.find(a => a.id === id)).toBeUndefined();
  });

  test('rejects paths outside workspace', async () => {
    const outside = path.join(os.tmpdir(), 'outside-mda.md');
    fs.writeFileSync(outside, '# x\n', 'utf-8');
    try {
      await expect(
        handleMdaScan({ workspace: tmpDir }, { path: outside }),
      ).rejects.toThrow(/工作区/);
    } finally {
      fs.unlinkSync(outside);
    }
  });

  test('mda_edit updates annotation', async () => {
    const add = await handleMdaAdd(
      { workspace: tmpDir },
      { file: 'doc.md', line: 3, content: 'original', level: 'minor' },
    );
    const id = JSON.parse(add.content[0].text).annotation.id as string;
    const edited = await handleMdaEdit(
      { workspace: tmpDir },
      { file: 'doc.md', id, content: 'updated', status: 'resolved' },
    );
    const anno = JSON.parse(edited.content[0].text).annotation;
    expect(anno.content).toBe('updated');
    expect(anno.status).toBe('resolved');
  });

  test('mda_scan filters by level', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A\n\nPara A\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'b.md'), '# B\n\nPara B\n', 'utf-8');
    await handleMdaAdd(
      { workspace: tmpDir },
      { file: 'a.md', line: 3, content: 'major one', level: 'major' },
    );
    await handleMdaAdd(
      { workspace: tmpDir },
      { file: 'b.md', line: 3, content: 'info one', level: 'info' },
    );
    const res = await handleMdaScan({ workspace: tmpDir }, { path: '.', recursive: true, level: 'major' });
    const list = JSON.parse(res.content[0].text);
    expect(list.every((a: { level: string }) => a.level === 'major')).toBe(true);
    expect(list.some((a: { content: string }) => a.content === 'major one')).toBe(true);
  });

  test('isPathInsideRoot handles nested paths', () => {
    const child = path.join(tmpDir, 'sub', 'a.md');
    expect(isPathInsideRoot(tmpDir, child)).toBe(true);
    expect(isPathInsideRoot(tmpDir, path.join(os.tmpdir(), 'other.md'))).toBe(false);
  });
});

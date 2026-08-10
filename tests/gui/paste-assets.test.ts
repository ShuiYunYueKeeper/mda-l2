/**
 * paste-assets：hash 去重与目录解析
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pasteAssets = require(path.join(__dirname, '../../src/gui/main/paste-assets.js'));

describe('paste-assets', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mda-paste-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  test('writeDedupedPasteAsset 同内容复用路径（文档同目录）', async () => {
    const docDir = path.join(tmpDir, 'doc');
    await fs.promises.mkdir(docDir, { recursive: true });
    const baseFile = path.join(docDir, 'note.md');
    const bytes = Buffer.from('same-image-bytes');
    const first = await pasteAssets.writeDedupedPasteAsset(baseFile, bytes, '.png', { mode: 'doc' });
    const second = await pasteAssets.writeDedupedPasteAsset(baseFile, bytes, '.png', { mode: 'doc' });
    expect(first.relativePath).toBe(second.relativePath);
    expect(first.markdownHref).toBe(first.relativePath);
    expect(second.deduped).toBe(true);
    const assetsDir = path.join(docDir, 'assets');
    const names = await fs.promises.readdir(assetsDir);
    expect(names.filter((n) => n.startsWith('paste-'))).toHaveLength(1);
    expect(names[0]).toMatch(/^paste-[a-f0-9]{16}\.png$/);
    expect(first.relativePath).toBe('./assets/' + names[0]);
  });

  test('工作区模式：子目录文档共用 workspace/assets', async () => {
    const ws = path.join(tmpDir, 'ws');
    const docDir = path.join(ws, 'docs');
    await fs.promises.mkdir(docDir, { recursive: true });
    const baseFile = path.join(docDir, 'note.md');
    const bytes = Buffer.from('workspace-image');
    const r = await pasteAssets.writeDedupedPasteAsset(baseFile, bytes, '.png', {
      mode: 'workspace',
      workspaceRoot: ws,
    });
    expect(fs.existsSync(path.join(ws, 'assets', path.basename(r.filePath)))).toBe(true);
    expect(r.markdownHref).toBe('../assets/' + path.basename(r.filePath));
  });

  test('自定义模式：写入指定目录', async () => {
    const custom = path.join(tmpDir, 'shared-assets');
    const docDir = path.join(tmpDir, 'anywhere');
    await fs.promises.mkdir(docDir, { recursive: true });
    const baseFile = path.join(docDir, 'note.md');
    const bytes = Buffer.from('custom-dir-image');
    const r = await pasteAssets.writeDedupedPasteAsset(baseFile, bytes, '.png', {
      mode: 'custom',
      customDir: custom,
    });
    expect(fs.existsSync(path.join(custom, path.basename(r.filePath)))).toBe(true);
    expect(r.markdownHref).toBe('../shared-assets/' + path.basename(r.filePath));
  });

  test('formatPasteAssetHref 统一 ./ 前缀与正斜杠', () => {
    const docDir = path.join(tmpDir, 'doc');
    const abs = path.join(docDir, 'assets', 'paste-abc123def4567890.png');
    expect(pasteAssets.formatPasteAssetHref(docDir, abs)).toBe(
      './assets/paste-abc123def4567890.png'
    );
  });
});

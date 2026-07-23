import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const fileOps = require('../../src/gui/main/file-ops');

describe('GUI workspace file operations', () => {
  test('rejects copy through symlink/junction outside workspace', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-gui-workspace-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-gui-outside-'));
    const link = path.join(workspace, 'outside-link');
    try {
      fs.writeFileSync(path.join(outside, 'secret.md'), '# outside\n', 'utf-8');
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
      const result = fileOps.copyFileToDir(
        path.join(link, 'secret.md'),
        workspace,
        workspace,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('工作区');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

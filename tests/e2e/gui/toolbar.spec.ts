import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');
const SAMPLE = path.join(ROOT, 'samples/demo.md');
const LIST_SAMPLE = path.join(ROOT, 'samples/list-heading.md');

const EXPECTED_CMDS = [
  'undo',
  'redo',
  'clear-format',
  'bold',
  'italic',
  'find',
  'save',
  'insert-open',
  'ai',
  'copy-preview',
  'export-open',
];

test.describe('GUI edit toolbar', () => {
  test('opens sample doc and renders Lucide toolbar', async () => {
    // 独立 userData：main.js 有单实例锁，本机已开着的 MDA 会让本次实例直接退出
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-e2e-'));
    const app = await electron.launch({
      args: [ELECTRON_MAIN, `--user-data-dir=${userDataDir}`, SAMPLE],
      env: {
        ...process.env,
        MDA_LANG: 'zh',
        MDA_CM6: '1',
      },
    });

    try {
      const window = await app.firstWindow();
      await window.setViewportSize({ width: 1280, height: 800 });

      const slot = window.locator('#cm-edit-toolbar-slot');
      const toolbar = slot.locator('.mda-cm-edit-toolbar');
      await expect(toolbar).toBeVisible({ timeout: 45_000 });

      const cmds = await toolbar.locator('[data-cmd]').evaluateAll((els) =>
        els
          .map((el) => el.getAttribute('data-cmd'))
          .filter((cmd): cmd is string => !!cmd)
      );
      for (const cmd of EXPECTED_CMDS) {
        expect(cmds).toContain(cmd);
      }

      // 除「插入」按钮用 + 字形外，其余按钮都是 Lucide svg：
      // undo/redo/clear-format + 五个行内 + 三个列表 + save/copy-preview/export/find/comment + ai
      const iconCount = await toolbar.locator('.mda-cm-tb-icon svg').count();
      expect(iconCount).toBe(17);

      const firstSvg = toolbar.locator('.mda-cm-tb-icon svg').first();
      await expect(firstSvg).toHaveAttribute('viewBox', '0 0 24 24');
      await expect(firstSvg).toHaveAttribute('stroke', 'currentColor');

      await expect(slot).toHaveScreenshot('toolbar-slot.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      });
    } finally {
      await app.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  // 首次编辑会把文件名旁的「未保存」圆点显出来；若圆点是追加上去的，
  // 文件名标签变宽 → 中间 flex:1 的工具栏槽位被挤窄 → 居中按钮整排平移。
  test('点击列表按钮不改变工具栏几何（不抖）', async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-e2e-'));
    // 用例会改文档，写进仓库样张不合适：拷一份到临时目录再打开
    const docPath = path.join(userDataDir, 'toolbar-jitter.md');
    fs.writeFileSync(docPath, fs.readFileSync(LIST_SAMPLE, 'utf8'), 'utf8');
    const app = await electron.launch({
      // 需要一个普通正文行落点：标题行上任务列表按钮是置灰的
      args: [ELECTRON_MAIN, `--user-data-dir=${userDataDir}`, docPath],
      env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
    });

    let window: Awaited<ReturnType<typeof app.firstWindow>> | null = null;
    try {
      window = await app.firstWindow();
      await window.setViewportSize({ width: 1024, height: 760 });
      const content = window.locator('.mda-cm6-host .cm-content');
      await expect(content).toBeVisible({ timeout: 45_000 });

      const geom = () =>
        window.evaluate(() => {
          const bar = document.querySelector('.mda-cm-edit-toolbar') as HTMLElement;
          const ul = document.querySelector('[data-cmd="ul"]') as HTMLElement;
          const fname = document.getElementById('tb-filename') as HTMLElement;
          return {
            barW: Math.round(bar.getBoundingClientRect().width),
            ulLeft: Math.round(ul.getBoundingClientRect().left),
            fnameW: Math.round(fname.getBoundingClientRect().width),
          };
        });

      // 列表按钮属于 NEEDS_EDITOR_ACTIVATION，先点进正文激活工具栏
      await content.locator('.cm-line', { hasText: '正文段落' }).first().click();
      await expect(window.locator('[data-cmd="task"]')).toBeEnabled({ timeout: 15_000 });

      const before = await geom();
      for (const cmd of ['ul', 'ol', 'task']) {
        await window.locator(`[data-cmd="${cmd}"]`).click();
        await window.waitForTimeout(250);
        expect(await geom()).toEqual(before);
      }
    } finally {
      // 留着未保存修改会让关窗弹确认框，app.close() 就挂住了
      if (window) {
        await window.keyboard.press('Control+s').catch(() => undefined);
        await window.waitForTimeout(600);
      }
      await app.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});

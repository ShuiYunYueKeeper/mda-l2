/**
 * 格内加粗叠套：删除线 / 下划线 / 斜体须真正套样式，不得把 ~~ ~ * 当可见字露出。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-cell-nest-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, '| 列 A |\n| --- |\n| **~~能打开~~、能看懂** |\n', 'utf8');
  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1200, height: 800 });
  await win.locator('table').first().waitFor({ state: 'visible', timeout: 60_000 });
  await win.waitForTimeout(800);
});

test.afterAll(async () => {
  if (app) await app.close();
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }
});

async function resetCell(md: string) {
  await win.evaluate((t) => {
    const view = (window as any).MDAEditor.findEditorView();
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: '| 列 A |\n| --- |\n| ' + t + ' |\n',
      },
    });
  }, md);
  await win.waitForTimeout(400);
}

test('E-CELL-NEST-1 加粗+删除线：格内可见无 ~~，有 strike 节点', async () => {
  await resetCell('**~~能打开~~、能看懂**');
  const cell = win.locator('td').first();
  await expect(cell).toHaveText('能打开、能看懂');
  const info = await cell.evaluate((el) => ({
    text: el.textContent,
    strong: !!el.querySelector('.mda-cm-strong'),
    strike: !!el.querySelector('.mda-cm-strike'),
  }));
  expect(info.text).not.toContain('~');
  expect(info.strong).toBe(true);
  expect(info.strike).toBe(true);
});

test('E-CELL-NEST-2 加粗+下划线+删除线：~~~ 双线都在', async () => {
  await resetCell('**~~~能批注~~~**');
  const cell = win.locator('td').first();
  await expect(cell).toHaveText('能批注');
  const info = await cell.evaluate((el) => ({
    text: el.textContent,
    under: !!el.querySelector('.mda-cm-underline'),
    strike: !!el.querySelector('.mda-cm-strike'),
  }));
  expect(info.text).not.toContain('~');
  expect(info.under).toBe(true);
  expect(info.strike).toBe(true);
});

test('E-CELL-NEST-3 加粗+斜体：两层 class 都在', async () => {
  await resetCell('***能打开***');
  const cell = win.locator('td').first();
  await expect(cell).toHaveText('能打开');
  const info = await cell.evaluate((el) => ({
    em: !!el.querySelector('.mda-cm-em'),
    strong: !!el.querySelector('.mda-cm-strong'),
  }));
  expect(info.em).toBe(true);
  expect(info.strong).toBe(true);
});

test('E-CELL-NEST-4 格内选字点删除线：源码叠套且可见无泄漏', async () => {
  await resetCell('**能打开、能看懂**');
  const cell = win.locator('td').first();
  await cell.click();
  await win.waitForTimeout(200);
  await win.evaluate(() => {
    const td = document.querySelector('td');
    if (!td) throw new Error('no td');
    const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const i = (node.nodeValue || '').indexOf('能打开');
      if (i >= 0) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 3);
        const sel = window.getSelection();
        sel!.removeAllRanges();
        sel!.addRange(range);
        return;
      }
    }
    throw new Error('needle missing');
  });
  await win.locator('.mda-cm-edit-toolbar [data-cmd="strike"]').click();
  await win.waitForTimeout(300);
  await expect(cell).toHaveText('能打开、能看懂');
  const leak = await cell.evaluate((el) => (el.textContent || '').includes('~'));
  expect(leak).toBe(false);
  await win.locator('.cm-line').first().click();
  await win.waitForTimeout(300);
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  const src = fs.readFileSync(file, 'utf8');
  expect(src).toMatch(/\*\*~~能打开~~、能看懂\*\*/);
});

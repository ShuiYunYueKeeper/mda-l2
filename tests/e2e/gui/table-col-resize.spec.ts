/**
 * 表格列宽拖拽松手后不得「粘鼠标」：
 * body 上的 resizing class / col-resize 光标必须清掉，且后续 mousemove 不再改列宽。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const TABLE = ['| 列 A | 列 B | 列 C |', '| --- | --- | --- |', '| a1 | b1 | c1 |'].join('\n');
const DOC = '# Resize\n\n' + TABLE + '\n';

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-tbl-resize-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, DOC, 'utf8');
  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1400, height: 900 });
  await win.locator('.cm-content').waitFor({ state: 'visible', timeout: 60_000 });
  await win.locator('table').first().waitFor({ state: 'visible', timeout: 60_000 });
  await win.waitForTimeout(800);
});

test.afterAll(async () => {
  if (win) {
    await win.keyboard.press('Control+s').catch(() => undefined);
    await win.waitForTimeout(400);
  }
  if (app) await app.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function col0Width(): Promise<number> {
  return win.locator('thead th').first().evaluate((el) => el.getBoundingClientRect().width);
}

test('列宽拖拽松手后清除 resizing 且不再跟鼠标', async () => {
  const stage = win.locator('.mda-cm-table-stage').first();
  await stage.hover();
  await win.waitForTimeout(200);

  // 测试环境强制可点：生产靠 stage:hover 打开 pointer-events
  await win.evaluate(() => {
    document.querySelectorAll('.mda-cm-table-col-resize-handle').forEach((h) => {
      (h as HTMLElement).style.pointerEvents = 'auto';
    });
  });

  const handle = win.locator('.mda-cm-table-col-resize-handle').first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  const before = await col0Width();
  // 「+」在手柄顶部；落在中下部，避免点到 add-btn 被吞
  const cx = box.x + box.width / 2;
  const cy = box.y + Math.max(box.height * 0.55, 60);

  await win.mouse.move(cx, cy);
  await win.mouse.down();
  // 拖拽过程中也应保持 resizing class（证明已进入拖拽态）
  await expect(win.locator('body.mda-cm-table-resizing-col')).toHaveCount(1, { timeout: 2000 });
  await win.mouse.move(cx + 120, cy, { steps: 12 });
  await win.mouse.up();
  await win.waitForTimeout(250);

  await expect(win.locator('body.mda-cm-table-resizing')).toHaveCount(0);
  await expect(win.locator('body.mda-cm-table-resizing-col')).toHaveCount(0);

  const afterDrag = await col0Width();
  expect(afterDrag).toBeGreaterThan(before + 30);

  await win.mouse.move(cx + 280, cy, { steps: 12 });
  await win.waitForTimeout(150);
  const afterMove = await col0Width();
  expect(Math.abs(afterMove - afterDrag)).toBeLessThan(2);
});

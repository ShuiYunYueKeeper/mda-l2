/**
 * HTML 文档只读打开回归：
 * - 以启动参数直接打开 .html，整页在 sandbox iframe 内渲染（保留内嵌 CSS / 本地图片）；
 * - 脚本被 sandbox 阻止、不执行；
 * - Markdown 专属入口（编辑、加批注、清空批注、大纲）在 HTML 文档下禁用/隐藏；
 * - 再打开 Markdown 时恢复编辑面，不残留 HTML 视图。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const PAGE = [
  '<!doctype html>',
  '<html><head><meta charset="utf-8"><title>只读预览</title>',
  '<style>body{font-family:sans-serif} h1{color:rgb(12, 34, 56)}</style>',
  '</head><body>',
  '<h1>HTML 标题</h1>',
  '<img id="pic" src="./pic.svg" width="40" height="40" alt="pic">',
  '<p>正文段落</p>',
  '<script>document.body.dataset.ran = "1";</script>',
  '</body></html>',
  '',
].join('\n');

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">' +
  '<rect width="40" height="40" fill="#17556b"/></svg>';

const MARKDOWN = '# Markdown 文档\n\n切回 Markdown 后应恢复编辑面。\n';

let app: ElectronApplication;
let win: Page;
let dir: string;
let htmlFile: string;
let mdFile: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-html-doc-'));
  htmlFile = path.join(dir, 'page.html');
  mdFile = path.join(dir, 'doc.md');
  fs.writeFileSync(htmlFile, PAGE, 'utf8');
  fs.writeFileSync(path.join(dir, 'pic.svg'), SVG, 'utf8');
  fs.writeFileSync(mdFile, MARKDOWN, 'utf8');
  const env = { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' } as Record<string, string>;
  // 本机若注入 ELECTRON_RUN_AS_NODE，Electron 会退化成 Node 进程
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, htmlFile],
    env,
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1400, height: 900 });
  await win.locator('#html-doc-frame').waitFor({ state: 'visible', timeout: 60_000 });
  await win.waitForTimeout(600);
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

test('HTML 整页渲染：内嵌 CSS、本地图片保留，脚本被禁用', async () => {
  const frame = win.frameLocator('#html-doc-frame');
  await expect(frame.locator('h1')).toHaveText('HTML 标题');
  const color = await frame.locator('h1').evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(12, 34, 56)');
  const naturalWidth = await frame
    .locator('#pic')
    .evaluate((el) => (el as HTMLImageElement).naturalWidth);
  expect(naturalWidth).toBe(40);
  const ran = await frame.locator('body').evaluate((el) => (el as HTMLElement).dataset.ran || '');
  expect(ran).toBe('');
  await expect(win.locator('#preview-content')).toBeHidden();
  await expect(win.locator('#html-doc-view')).toBeVisible();
});

test('Markdown 专属入口在 HTML 文档下禁用或隐藏', async () => {
  await expect(win.locator('#tb-edit')).toBeDisabled();
  await expect(win.locator('#btn-add')).toBeDisabled();
  await expect(win.locator('#btn-clear-all')).toBeDisabled();
  await expect(win.locator('#outline-host')).toBeHidden();
});

test('切回 Markdown 恢复编辑面并收起 HTML 视图', async () => {
  await app.evaluate(({ BrowserWindow }, p) => {
    BrowserWindow.getAllWindows()[0].webContents.send('file-opened', p);
  }, mdFile);
  await win.locator('.cm-content').waitFor({ state: 'visible', timeout: 60_000 });
  await expect(win.locator('#html-doc-view')).toBeHidden();
  await expect(win.locator('#tb-edit')).toBeEnabled();
  await expect(win.locator('#tb-filename')).toHaveAttribute('data-filename', 'doc.md');
});

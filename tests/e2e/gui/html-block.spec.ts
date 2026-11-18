/**
 * 原生 HTML 块回归：GitHub 风格的居中头部（`<p align="center">`/`<h1>`/徽章 `<img>`）与
 * `<details>` 折叠块，在 CM6 预览模式必须渲染成真元素，而不是逐行显示源码。
 * 同时对「块内 Markdown 照常排版」「危险标签/脚本被清洗」「源码态可改」做端到端守护。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

// 内联 SVG 图标走 data:（CSP 已放行 data:），避免 e2e 依赖外网徽章
const ICON =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#17556b"/></svg>',
    'utf8'
  ).toString('base64');

const DOC = [
  '<p align="center">',
  `<img src="${ICON}" alt="图标" width="64" height="64" />`,
  '</p>',
  '',
  '<h1 align="center">测试标题</h1>',
  '<p align="center"><strong>副标题一行</strong></p>',
  '',
  '分隔段落。',
  '',
  '<details>',
  '<summary><strong>展开：小节</strong></summary>',
  '',
  '### 内部标题',
  '',
  '内部 **加粗** 段落',
  '',
  '</details>',
  '',
  '结尾普通段落。',
  '',
].join('\n');

const DANGER_DOC = ['<div>前置<script>window.__mdaX = 1</script>可见文字</div>', ''].join('\n');

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-html-block-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, DOC, 'utf8');
  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1400, height: 900 });
  await win.locator('.cm-content').waitFor({ state: 'visible', timeout: 60_000 });
  await win.locator('.mda-cm-html-block').first().waitFor({ state: 'visible', timeout: 60_000 });
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

async function resetDoc(text: string) {
  await win.evaluate((t) => {
    const view = (window as any).MDAEditor.findEditorView();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
  }, text);
  await win.waitForTimeout(600);
}

test('居中头部渲染成真元素且图标加载成功', async () => {
  const header = win.locator('.mda-cm-html-block').first();
  await expect(header.locator('h1[align="center"]')).toHaveText('测试标题');
  await expect(header.locator('p[align="center"] strong')).toHaveText('副标题一行');
  const img = header.locator('img[alt="图标"]');
  await expect(img).toHaveCount(1);
  expect(await img.evaluate((el: any) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test('HTML 源码不再泄漏成正文文字', async () => {
  const text = await win.locator('.cm-content').innerText();
  expect(text).not.toContain('<p align');
  expect(text).not.toContain('<h1 align');
  expect(text).not.toContain('<details>');
  expect(text).not.toContain('</summary>');
  expect(text).not.toContain('<img src=');
});

test('details 折叠块：块内 Markdown 照常排版且可展开', async () => {
  const block = win.locator('.mda-cm-html-block').nth(1);
  const details = block.locator('details');
  await expect(details.locator('summary')).toContainText('展开：小节');
  // 块内 Markdown（### 标题 / **加粗**）由 renderMarkdown 渲染，不是字面源码
  await expect(details.locator('h3')).toHaveText('内部标题');
  await expect(details.locator('strong').last()).toHaveText('加粗');
  await details.locator('summary').click();
  await expect(details).toHaveJSProperty('open', true);
});

test('危险标签被清洗：script 既不执行也不留文字', async () => {
  await resetDoc(DANGER_DOC);
  const block = win.locator('.mda-cm-html-block').first();
  await expect(block).toContainText('前置可见文字');
  await expect(block.locator('script')).toHaveCount(0);
  expect(await win.evaluate(() => (window as any).__mdaX)).toBeUndefined();
});

test('「代码」按钮切源码态，Esc 回到渲染态', async () => {
  await resetDoc(DOC);
  const block = win.locator('.mda-cm-html-block').first();
  await block.locator('[data-action="source"]').click();
  const input = block.locator('.mda-cm-html-source-input');
  await expect(input).toBeVisible();
  await expect(input).toContainText('<h1 align="center">测试标题</h1>');
  await input.press('Escape');
  await expect(input).toBeHidden();
  await expect(block.locator('h1[align="center"]')).toHaveText('测试标题');
});

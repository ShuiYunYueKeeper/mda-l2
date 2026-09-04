/**
 * 格内「顿号紧贴开定界符」取消后连续输入 —— 独立窗口，避免矩阵用例改脏文档后 Ctrl+R 不可靠。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');
const PUNCT_CELL = '含 ~下划线~**、加粗**、*斜体*。';
const DOC = ['# T', '', '| 列 A |', '| --- |', '| ' + PUNCT_CELL + ' |', ''].join('\n');
const PINYIN_CESHI = "ce'shi";

let app: ElectronApplication;
let win: Page;
let cdp: any;
let dir: string;
let file: string;

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-cellpunct-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, DOC, 'utf8');
  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1600, height: 900 });
  await win.locator('table').first().waitFor({ state: 'visible', timeout: 60_000 });
  await win.waitForTimeout(1200);
  cdp = await win.context().newCDPSession(win);
});

test.afterAll(async () => {
  if (app) await app.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function cellSource() {
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(450);
  const line = fs.readFileSync(file, 'utf8').split('\n').find((x) => x.indexOf('| 含 ') === 0) || '';
  return line.replace(/^\|\s/, '').replace(/\s\|$/, '');
}

async function imeType(text: string, pinyin: string) {
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  for (let i = 1; i <= pinyin.length; i++) {
    await cdp.send('Input.imeSetComposition', {
      text: pinyin.slice(0, i),
      selectionStart: i,
      selectionEnd: i,
    });
    await win.waitForTimeout(30);
  }
  await cdp.send('Input.insertText', { text });
  await win.waitForTimeout(450);
}

test('E-CELL-8 取消样式后连续输入两次：格内文字保持无样式、工具栏不弹回', async () => {
  const p = await win.locator('td').first().evaluate((cell) => {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const i = (n.nodeValue || '').indexOf('加粗');
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      const rect = r.getBoundingClientRect();
      return { x: rect.left + 1, y: rect.top + rect.height / 2 };
    }
    return null;
  });
  await win.mouse.click(p!.x, p!.y);
  await win.waitForTimeout(350);
  const btn = win.locator('.mda-cm-edit-toolbar [data-cmd="bold"]');
  expect(await btn.getAttribute('aria-pressed')).toBe('true');
  await btn.click();
  await win.waitForTimeout(350);
  expect(await btn.getAttribute('aria-pressed')).toBe('false');

  await imeType('测试', PINYIN_CESHI);
  expect(await btn.getAttribute('aria-pressed')).toBe('false');
  expect(await cellSource()).toBe('含 ~下划线~、测试**加粗**、*斜体*。');

  await imeType('你好', "ni'hao");
  expect(await btn.getAttribute('aria-pressed')).toBe('false');
  const src = await cellSource();
  expect(src).toBe('含 ~下划线~、测试你好**加粗**、*斜体*。');
  expect(src).not.toMatch(/\*\*\*\*/);
});

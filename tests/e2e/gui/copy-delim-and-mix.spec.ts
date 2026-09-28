/**
 * 预览态真实交互：
 * 1) 只选可见加粗字拷到单元格 / 正文其他处，定界符不丢
 * 2) 单元格加粗拷回正文，定界符不丢
 * 3) 加粗段再叠下划线+删除线，可见正文无泄漏
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const BODY = '前文 **加粗样例** 后文';
const TABLE = ['| 列 A |', '| --- |', '| 空格 |'].join('\n');
const DOC = BODY + '\n\n' + TABLE + '\n';

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-copy-mix-'));
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
  await win.waitForTimeout(1200);
});

test.afterAll(async () => {
  if (win) {
    try {
      await win.keyboard.press('Control+s');
      await win.waitForTimeout(400);
    } catch (_) {
      /* ignore */
    }
  }
  if (app) await app.close();
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }
});

async function resetDoc(text: string = DOC) {
  await win.evaluate((t) => {
    const view = (window as any).MDAEditor.findEditorView();
    if (!view) throw new Error('no cm view');
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: t },
    });
  }, text);
  await win.waitForTimeout(500);
}

async function source() {
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  return fs.readFileSync(file, 'utf8');
}

/** 只选可见文字（不含隐藏定界符）——贴近用户预览拖选 */
async function selectVisible(needle: string) {
  await win.evaluate((seg) => {
    const view = (window as any).MDAEditor.findEditorView();
    if (!view) throw new Error('no cm view');
    const doc = view.state.doc.toString();
    const from = doc.indexOf(seg);
    if (from < 0) throw new Error('needle not found: ' + seg);
    view.dispatch({ selection: { anchor: from, head: from + seg.length } });
    view.focus();
  }, needle);
  await win.waitForTimeout(150);
}

/** 取拷贝切片（产品路径）；系统剪贴板在 Electron e2e 下不可靠，粘贴另走辅助函数 */
async function copySelectionAsMarkdown() {
  return win.evaluate(() => {
    const api = (window as any).MDAEditor;
    const view = api.findEditorView();
    const slice = api.sliceSelectionForClipboard(view.state);
    if (!slice || !slice.text) throw new Error('empty clipboard slice');
    return slice.text;
  });
}

async function pasteMarkdownAtCaret(text: string) {
  await win.evaluate((t) => {
    const view = (window as any).MDAEditor.findEditorView();
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: t },
      selection: { anchor: Math.min(sel.from, sel.to) + t.length },
    });
    view.focus();
  }, text);
}

async function pasteMarkdownIntoActiveCell(text: string) {
  await win.evaluate((t) => {
    const el = document.activeElement as HTMLElement | null;
    const cell = el && el.closest ? (el.closest('td,th') as HTMLElement | null) : null;
    if (!cell) throw new Error('no active table cell');
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(cell);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    cell.dispatchEvent(ev);
  }, text);
}

async function docText() {
  return win.evaluate(() => {
    const view = (window as any).MDAEditor.findEditorView();
    return view.state.doc.toString();
  });
}

test('E-COPY-1 预览选可见加粗字拷到单元格：定界符保留', async () => {
  await resetDoc();
  await selectVisible('加粗样例');
  const clip = await copySelectionAsMarkdown();
  expect(clip).toBe('**加粗样例**');

  const cell = win.locator('td').first();
  await cell.click();
  await win.waitForTimeout(300);
  await pasteMarkdownIntoActiveCell(clip);
  await win.waitForTimeout(200);
  expect(await cell.innerText()).toBe('加粗样例');
  await win.locator('.cm-line').first().click();
  await win.waitForTimeout(300);

  const src = await source();
  expect(src.split('\n').some((l) => /\|.*\*\*加粗样例\*\*.*\|/.test(l))).toBe(true);
});

test('E-COPY-1b 预览选可见加粗字拷到正文别处：定界符保留', async () => {
  await resetDoc('前文 **加粗样例** 后文 落点\n');
  await selectVisible('加粗样例');
  const clip = await copySelectionAsMarkdown();
  expect(clip).toBe('**加粗样例**');

  await win.evaluate(() => {
    const view = (window as any).MDAEditor.findEditorView();
    const doc = view.state.doc.toString();
    const at = doc.indexOf('落点');
    view.dispatch({ selection: { anchor: at, head: at + 2 } });
    view.focus();
  });
  await win.waitForTimeout(150);
  await pasteMarkdownAtCaret(clip);
  await win.waitForTimeout(200);

  const doc = await docText();
  expect(doc).toContain('**加粗样例**');
  expect(doc).toMatch(/后文 \*\*加粗样例\*\*/);
});

test('E-COPY-2 单元格含定界符拷回正文：定界符保留', async () => {
  await resetDoc('前文 落点 后文\n\n| 列 A |\n| --- |\n| **格内加粗** |\n');

  const cell = win.locator('td', { hasText: '格内加粗' }).first();
  await cell.click();
  await win.waitForTimeout(300);
  const clip = await win.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const cellEl = el && el.closest ? (el.closest('td,th') as HTMLElement | null) : null;
    if (!cellEl) throw new Error('no cell');
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(cellEl);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const dt = new DataTransfer();
    const ev = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: dt });
    cellEl.dispatchEvent(ev);
    const out = dt.getData('text/plain');
    if (!out) throw new Error('empty cell copy');
    return out;
  });
  expect(clip).toBe('**格内加粗**');

  await win.evaluate(() => {
    const view = (window as any).MDAEditor.findEditorView();
    if (!view) throw new Error('no cm view');
    const doc = view.state.doc.toString();
    const at = doc.indexOf('落点');
    view.dispatch({ selection: { anchor: at, head: at + 2 } });
    view.focus();
  });
  await win.waitForTimeout(150);
  await pasteMarkdownAtCaret(clip);
  await win.waitForTimeout(200);

  const src = await source();
  expect(src.split('\n')[0]).toMatch(/\*\*格内加粗\*\*/);
});

test('E-MIX-1 同一段同时下划线与删除线', async () => {
  await resetDoc('测试文字\n');
  await selectVisible('测试文字');
  await win.locator('.mda-cm-edit-toolbar [data-cmd="underline"]').click();
  await win.waitForTimeout(250);
  await selectVisible('测试文字');
  await win.locator('.mda-cm-edit-toolbar [data-cmd="strike"]').click();
  await win.waitForTimeout(250);

  const doc = (await docText()).replace(/\n$/, '');
  expect(doc).toBe('~~~测试文字~~~');
});

test('E-MIX-2 加粗段再叠下划线与删除线，可见无泄漏定界符', async () => {
  await resetDoc('**测试文字**\n');
  await selectVisible('测试文字');
  await win.locator('.mda-cm-edit-toolbar [data-cmd="underline"]').click();
  await win.waitForTimeout(250);
  let doc = await docText();
  expect(doc).toContain('**~测试文字~**');

  await selectVisible('测试文字');
  await win.locator('.mda-cm-edit-toolbar [data-cmd="strike"]').click();
  await win.waitForTimeout(250);

  doc = (await docText()).replace(/\n$/, '');
  expect(doc).toBe('**~~~测试文字~~~**');

  const vis = await win.evaluate(() => {
    const view = (window as any).MDAEditor.findEditorView();
    const root = view.dom.querySelector('.cm-content');
    return (root && (root as HTMLElement).innerText) || '';
  });
  expect(vis.replace(/\s/g, '')).toContain('测试文字');
  expect(vis).not.toMatch(/\*\*/);
});

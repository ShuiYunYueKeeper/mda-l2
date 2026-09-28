/**
 * README 加粗段回归：部分拷贝、删除线、下划线+删除线叠套、贴入单元格即时渲染。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const BOLD = '能打开、能看懂、能改几句、能批注、能导出，并能交给 Agent';
const LINE = `是：**${BOLD}**。`;
const DOC = LINE + '\n\n| 列 A |\n| --- |\n| 空格 |\n';

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-readme-bold-'));
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

async function resetDoc() {
  await win.evaluate((t) => {
    const view = (window as any).MDAEditor.findEditorView();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
  }, DOC);
  await win.waitForTimeout(400);
}

async function selectVisible(needle: string) {
  await win.evaluate((seg) => {
    const view = (window as any).MDAEditor.findEditorView();
    const doc = view.state.doc.toString();
    const from = doc.indexOf(seg);
    if (from < 0) throw new Error('missing ' + seg);
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

async function source() {
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  return fs.readFileSync(file, 'utf8');
}

test('E-RB-1 拷贝加粗段内「能打开」到正文/单元格，保留加粗', async () => {
  await resetDoc();
  await selectVisible('能打开');
  const clip = await copySelectionAsMarkdown();
  expect(clip).toBe('**能打开**');

  await win.evaluate(() => {
    const view = (window as any).MDAEditor.findEditorView();
    const doc = view.state.doc.toString();
    const at = doc.indexOf('。');
    if (at < 0) throw new Error('missing period');
    // 落在句号之后，避免 hide-mark 把光标吸进闭定界符内侧
    view.dispatch({ selection: { anchor: at + 1, head: at + 1 } });
    view.focus();
  });
  await win.waitForTimeout(100);
  await pasteMarkdownAtCaret(clip);
  await win.waitForTimeout(200);
  expect(await docText()).toMatch(/Agent\*\*。\*\*能打开\*\*/);

  await resetDoc();
  await selectVisible('能打开');
  const clip2 = await copySelectionAsMarkdown();
  expect(clip2).toBe('**能打开**');
  const cell = win.locator('td').first();
  await cell.click();
  await win.waitForTimeout(300);
  await pasteMarkdownIntoActiveCell(clip2);
  await win.waitForTimeout(200);
  const cellText = await cell.innerText();
  expect(cellText).toBe('能打开');
  expect(cellText).not.toContain('**');
  await win.locator('.cm-line').first().click();
  await win.waitForTimeout(300);
  const src = await source();
  expect(src.split('\n').some((l) => /\|.*\*\*能打开\*\*.*\|/.test(l))).toBe(true);
});

test('E-RB-2 选「能打开」点删除线：不拆坏整段加粗', async () => {
  await resetDoc();
  await selectVisible('能打开');
  await win.locator('.mda-cm-edit-toolbar [data-cmd="strike"]').click();
  await win.waitForTimeout(300);
  const doc = await docText();
  expect(doc).toContain('**~~能打开~~、能看懂');
  expect(doc).toMatch(/\*\*~~能打开~~、能看懂、能改几句、能批注、能导出，并能交给 Agent\*\*/);
  expect(doc).not.toMatch(/~~\*\*/);
});

test('E-RB-3 选「能批注」下划线再删除线，再取消下划线不毁定界符', async () => {
  await resetDoc();
  await selectVisible('能批注');
  await win.locator('.mda-cm-edit-toolbar [data-cmd="underline"]').click();
  await win.waitForTimeout(250);
  expect(await docText()).toContain('、~能批注~、');

  await selectVisible('能批注');
  await win.locator('.mda-cm-edit-toolbar [data-cmd="strike"]').click();
  await win.waitForTimeout(250);
  let doc = await docText();
  expect(doc).toContain('、~~~能批注~~~、');
  // 可见层应带删除线类（与下划线并存）
  const hasStrike = await win.evaluate(() => {
    const el = document.querySelector('.mda-cm6-host .mda-cm-strike');
    return !!(el && (el.textContent || '').indexOf('能批注') >= 0);
  });
  expect(hasStrike).toBe(true);

  await selectVisible('能批注');
  await win.locator('.mda-cm-edit-toolbar [data-cmd="underline"]').click();
  await win.waitForTimeout(250);
  doc = await docText();
  expect(doc).toContain('、~~能批注~~、');
  expect(doc).toMatch(/\*\*能打开、能看懂、能改几句、~~能批注~~、能导出，并能交给 Agent\*\*/);
  expect(doc).not.toMatch(/\*\*\*|~~~~/);
});

test('E-RB-4 整段加粗拷到单元格：立刻渲染，不长时间露源码', async () => {
  await resetDoc();
  await selectVisible(BOLD);
  const clip = await copySelectionAsMarkdown();
  expect(clip).toBe(`**${BOLD}**`);
  const cell = win.locator('td').first();
  await cell.click();
  await win.waitForTimeout(300);
  await pasteMarkdownIntoActiveCell(clip);
  await win.waitForTimeout(150);
  const cellText = await cell.innerText();
  expect(cellText).toBe(BOLD);
  expect(cellText).not.toContain('**');
  const strong = await cell.locator('.mda-cm-strong, .mda-cm-table-inline.mda-cm-strong').count();
  expect(strong).toBeGreaterThan(0);
});

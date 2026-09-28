/**
 * README 句：选中部分加粗文字后点工具栏加粗。
 * 选区必须钉在用户选中的可见文字上，不得随融合/让位撑成整句。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const TAIL = '能打开、能看懂、能改几句、能批注、能导出，并能交给 Agent';
const ORIG = `是：**${TAIL}**`;
const UNBOLD_OPEN = `是：能打开、**${TAIL.slice(4)}**`;

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-boldpunct-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, ORIG + '\n', 'utf8');
  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1400, height: 900 });
  await win.locator('.cm-content').waitFor({ state: 'visible', timeout: 60_000 });
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
  await win.evaluate((text) => {
    const view = (window as any).MDAEditor.findEditorView();
    if (!view) throw new Error('no cm view');
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    });
  }, ORIG);
  await win.waitForTimeout(400);
}

async function selectNeedle(needle: string) {
  await selectFromTo(needle, needle);
}

/** 可见选区「是：能打开」在源码里被 `**` 切开，按起止子串定位。 */
async function selectFromTo(start: string, end: string) {
  await win.evaluate(([a, b]) => {
    const view = (window as any).MDAEditor.findEditorView();
    if (!view) throw new Error('no cm view');
    const doc = view.state.doc.toString();
    const from = doc.indexOf(a);
    const to = doc.indexOf(b, from) + b.length;
    if (from < 0 || to < b.length) throw new Error('range not in doc: ' + a + ' … ' + b);
    view.dispatch({ selection: { anchor: from, head: to } });
    view.focus();
  }, [start, end] as [string, string]);
  await win.waitForTimeout(150);
}

async function clickBold() {
  const btn = win.locator('.mda-cm-edit-toolbar [data-cmd="bold"]');
  await expect(btn).toBeVisible();
  await btn.click();
  await win.waitForTimeout(250);
}

async function docAndSel() {
  return win.evaluate(() => {
    const view = (window as any).MDAEditor.findEditorView();
    if (!view) throw new Error('no cm view');
    const { from, to } = view.state.selection.main;
    return {
      doc: view.state.doc.toString().replace(/\n$/, ''),
      sel: view.state.doc.sliceString(from, to),
    };
  });
}

test('E-BOLD-1 选「能打开」取消再加粗：融回原段，选区仍是能打开', async () => {
  await resetDoc();
  await selectNeedle('能打开');
  await clickBold();
  expect(await docAndSel()).toEqual({ doc: UNBOLD_OPEN, sel: '能打开' });
  await clickBold();
  expect(await docAndSel()).toEqual({ doc: ORIG, sel: '能打开' });
});

test('E-BOLD-2 选「能打开、」取消再加粗：选区不得撑成整句', async () => {
  await resetDoc();
  await selectNeedle('能打开、');
  await clickBold();
  expect(await docAndSel()).toEqual({ doc: UNBOLD_OPEN, sel: '能打开、' });
  await clickBold();
  expect(await docAndSel()).toEqual({ doc: ORIG, sel: '能打开、' });
});

test('E-BOLD-3 选「、能看懂」取消再加粗：选区钉在顿号+能看懂', async () => {
  await resetDoc();
  await selectNeedle('、能看懂');
  await clickBold();
  expect(await docAndSel()).toEqual({
    doc: '是：**能打开**、能看懂、**能改几句、能批注、能导出，并能交给 Agent**',
    sel: '、能看懂',
  });
  await clickBold();
  expect(await docAndSel()).toEqual({ doc: ORIG, sel: '、能看懂' });
});

test('E-BOLD-4 选「是：能打开」加粗：选区不得吞进后半句', async () => {
  await resetDoc();
  await selectFromTo('是：', '能打开');
  await clickBold();
  const got = await docAndSel();
  expect(got, JSON.stringify(got)).toEqual({
    doc: `**是：${TAIL}**`,
    sel: '是：能打开',
  });
});

/**
 * 表格单元格编辑的真机回归。
 *
 * 必须在真实 Electron 里跑：单元格是 widget 内的 contenteditable，内容先落在 DOM 上，
 * 靠 blur 或结构变更时的 readParsedFromDom 才写回 CM6。而「添加行」的 `+` 按钮在
 * mousedown 里 preventDefault（不夺焦、不触发 blur），所以这条路径只能由结构变更自己
 * 把 DOM 读回来 —— 模型层测不到。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const TABLE = ['| 列 A | 列 B |', '| --- | --- |', '| 单元格 1 | 单元格 2 |'].join('\n');
const DOC = '# T\n\n' + TABLE + '\n';


let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-table-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, DOC, 'utf8');
  app = await electron.launch({
    // 独立 user-data-dir：否则单实例锁会让本次启动直接退出（见 AGENTS.md §9.6b）
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
  // 留着未保存的格内编辑会让关窗弹出确认框，app.close() 就挂住了
  if (win) {
    await win.keyboard.press('Control+s').catch(() => undefined);
    await win.waitForTimeout(600);
  }
  if (app) await app.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function source() {
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(600);
  return fs.readFileSync(file, 'utf8');
}

/** 焦点留在单元格里时 Ctrl+Z 由格内消化，撤不到 CM6 的历史上 */
async function focusOutsideTable() {
  await win.locator('.cm-line').first().click();
  await win.waitForTimeout(300);
}

async function resetDoc() {
  await focusOutsideTable();
  for (let i = 0; i < 20; i++) {
    if ((await source()) === DOC) return;
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(250);
  }
  expect(await source()).toBe(DOC);
}

/** 在指定单元格末尾追加文字（点进去 → End → 打字） */
async function appendInCell(text: string, cellText: string) {
  const cell = win.locator('td', { hasText: cellText }).first();
  await cell.click();
  await win.waitForTimeout(300);
  await win.keyboard.press('End');
  await win.keyboard.type(text, { delay: 40 });
  await win.waitForTimeout(300);
}

test('E-TBL-1 编辑单元格后点「添加行」不丢内容', async () => {
  await resetDoc();
  await appendInCell('改了', '单元格 1');

  // 行调整线上的 `+`：mousedown 里 preventDefault，不会让单元格失焦
  const addRow = win.locator('.mda-cm-table-row-resize-handle .mda-cm-table-add-btn').last();
  await addRow.scrollIntoViewIfNeeded();
  await addRow.click({ force: true });
  await win.waitForTimeout(600);

  const src = await source();
  expect(src).toContain('单元格 1改了');
  // 行确实加上了：表体从 1 行变 2 行
  expect(src.split('\n').filter((l) => l.indexOf('|') === 0).length).toBe(4);
});

test('E-TBL-2 编辑单元格后点「添加列」不丢内容', async () => {
  await resetDoc();
  await appendInCell('改了', '单元格 1');

  const addCol = win.locator('.mda-cm-table-col-resize-handle .mda-cm-table-add-btn').last();
  await addCol.scrollIntoViewIfNeeded();
  await addCol.click({ force: true });
  await win.waitForTimeout(600);

  expect(await source()).toContain('单元格 1改了');
});

/** 点进格子并把整格可见文字选中（Ctrl+A 会选到整篇文档，只能用 Home/Shift+End） */
async function selectWholeCell(cellText: string) {
  const cell = win.locator('td', { hasText: cellText }).first();
  await cell.click();
  await win.waitForTimeout(300);
  await win.keyboard.press('Home');
  await win.keyboard.press('Shift+End');
  await win.waitForTimeout(200);
}

test('E-TBL-4 样式段内改字不被渲染快照吞掉', async () => {
  await resetDoc();
  await selectWholeCell('单元格 1');
  await win.keyboard.press('Control+b');
  await win.waitForTimeout(400);
  expect(await source()).toContain('**单元格 1**');

  await appendInCell('改了', '单元格 1');
  expect(await source()).toContain('**单元格 1改了**');
});

test('E-TBL-5 段头按 Ctrl+B 是取消而非再包一层', async () => {
  await resetDoc();
  await selectWholeCell('单元格 1');
  await win.keyboard.press('Control+b');
  await win.waitForTimeout(400);

  const cell = win.locator('td', { hasText: '单元格 1' }).first();
  await cell.click();
  await win.waitForTimeout(300);
  await win.keyboard.press('Home');
  await win.waitForTimeout(300);
  // 段头输入会并入加粗段，所以此处本就该显示为加粗态（与正文同义）
  expect(await boldPressed()).toBe('true');

  await win.keyboard.press('Control+b');
  await win.waitForTimeout(300);
  expect(await boldPressed()).toBe('false');
  await win.keyboard.type('X', { delay: 60 });
  await win.waitForTimeout(400);

  const src = await source();
  expect(src).toContain('X**单元格 1**');
  expect(src).not.toContain('****');
});

test('E-TBL-7 无选区按 Ctrl+B 只武装待输入格式，不写入空定界符对', async () => {
  await resetDoc();
  const cell = win.locator('td', { hasText: '单元格 1' }).first();
  await cell.click();
  await win.waitForTimeout(300);
  await win.keyboard.press('End');
  await win.keyboard.press('Control+b');
  await win.waitForTimeout(400);

  // 旧行为会立刻往格里塞 `**<零宽空格>**`
  const html = await cell.innerHTML();
  expect(html).not.toContain('\u200b');
  expect(await source()).toBe(DOC);

  await win.keyboard.type('X', { delay: 60 });
  await win.waitForTimeout(400);
  expect(await source()).toContain('单元格 1**X**');
});

/** 工具栏按钮的选中态（与正文同一套 is-active/aria-pressed） */
async function boldPressed() {
  return win.locator('.mda-cm-edit-toolbar [data-cmd="bold"]').getAttribute('aria-pressed');
}

test('E-TBL-8 点进格内加粗文字，工具栏与格外一样高亮', async () => {
  await resetDoc();
  await selectWholeCell('单元格 1');
  await win.keyboard.press('Control+b');
  await win.waitForTimeout(400);

  // 点进加粗段中间：光标处有样式 → 按钮应亮
  const cell = win.locator('td', { hasText: '单元格 1' }).first();
  await cell.click();
  await win.waitForTimeout(300);
  await win.keyboard.press('Home');
  await win.keyboard.press('ArrowRight');
  await win.waitForTimeout(400);
  expect(await boldPressed()).toBe('true');

  // 点进无样式的相邻格：按钮应灭（旧实现两处都灭，故本用例能拦住回归）
  await win.locator('td', { hasText: '单元格 2' }).first().click();
  await win.waitForTimeout(400);
  expect(await boldPressed()).toBe('false');
});

test('E-TBL-9 格内光标移出样式段后按钮跟着灭', async () => {
  await resetDoc();
  await selectWholeCell('单元格 1');
  await win.keyboard.press('Control+b');
  await win.waitForTimeout(400);
  // 尾后输入默认延续加粗，须先按 Ctrl+B 关掉待输入格式才能得到无样式尾巴
  await win.keyboard.press('End');
  await win.keyboard.press('Control+b');
  await win.waitForTimeout(200);
  await win.keyboard.type('尾巴', { delay: 40 });
  await win.waitForTimeout(500);
  expect(await source()).toContain('**单元格 1**尾巴');

  await win.keyboard.press('Home');
  await win.keyboard.press('ArrowRight');
  await win.waitForTimeout(400);
  expect(await boldPressed()).toBe('true');

  await win.keyboard.press('End');
  await win.waitForTimeout(400);
  expect(await boldPressed()).toBe('false');
});

test('E-TBL-10 保存不把光标踢出单元格', async () => {
  await resetDoc();
  await appendInCell('改了', '单元格 1');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(700);

  // flush 会把格内 DOM 写回文档、widget 随之重建；不复位光标就掉回 body
  const where = await win.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    return ae ? ae.tagName : null;
  });
  expect(where).toBe('TD');

  // 焦点确实还能接着打字
  await win.keyboard.type('X', { delay: 60 });
  await win.waitForTimeout(400);
  expect(await source()).toContain('单元格 1改了X');
});

test('E-TBL-11 点工具栏按钮不丢格内光标', async () => {
  await resetDoc();
  const cell = win.locator('td', { hasText: '单元格 1' }).first();
  await cell.click();
  await win.waitForTimeout(300);
  await win.keyboard.press('End');
  await win.waitForTimeout(200);

  // 无选区时点加粗：表格的 document mousedown 曾把这当成「点到表外」，blur 掉单元格
  await win.locator('.mda-cm-edit-toolbar [data-cmd="bold"]').click();
  await win.waitForTimeout(500);

  const where = await win.evaluate(() => {
    const sel = window.getSelection();
    const td = document.querySelector('td');
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    return {
      active: document.activeElement ? (document.activeElement as HTMLElement).tagName : null,
      inCell: !!(range && td && td.contains(range.startContainer)),
    };
  });
  expect(where.active).toBe('TD');
  expect(where.inCell).toBe(true);

  // 光标还在原处，武装的加粗能直接接着用
  await win.keyboard.type('X', { delay: 60 });
  await win.waitForTimeout(400);
  expect(await source()).toContain('单元格 1**X**');
});

test('E-TBL-6 部分取消样式时拆分，不留裸定界符', async () => {
  await resetDoc();
  await selectWholeCell('单元格 1');
  await win.keyboard.press('Control+b');
  await win.waitForTimeout(400);

  const cell = win.locator('td', { hasText: '单元格 1' }).first();
  await cell.click();
  await win.waitForTimeout(300);
  await win.keyboard.press('Home');
  await win.keyboard.press('Shift+ArrowRight');
  await win.keyboard.press('Control+b');
  await win.waitForTimeout(400);

  const src = await source();
  expect(src).toContain('单**元格 1**');
  expect(src).not.toContain('****');
});
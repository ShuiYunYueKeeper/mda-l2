/**
 * 格内行内格式的验证矩阵：与正文（inline-delimiter-edit.spec.ts）同规格，
 * 覆盖头前 / 文中 / 末尾 × 输入法中文 / 工具栏切换 / 四向选区 / 删除 / 右键。
 *
 * 必须在真机跑：单元格是 widget 内的 contenteditable，没有 CM6 文档可依托，
 * 落点、组字、DOM 重写这三段只有真实 Electron + CDP 才能复现。曾经的两个缺陷都只在这里暴露：
 *   ① 组字首击被当成正式输入接管，拼音首字母残留（`**加**c测试**粗**`）；
 *   ② 段头输入落在样式段外（`测试**加粗**`），与正文的融合语义不一致。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const CELL = '含 ~下划线~、**加粗**、*斜体*、~~删除线~~、`行内代码`。';
const DOC = ['# T', '', '| 列 A |', '| --- |', '| ' + CELL + ' |', ''].join('\n');
const PINYIN_CESHI = "ce'shi";

type Seg = { seg: string; cmd: string; open: string; close: string };
const BOLD: Seg = { seg: '加粗', cmd: 'bold', open: '**', close: '**' };
const ITALIC: Seg = { seg: '斜体', cmd: 'italic', open: '*', close: '*' };
const STRIKE: Seg = { seg: '删除线', cmd: 'strike', open: '~~', close: '~~' };
const CODE: Seg = { seg: '行内代码', cmd: 'code', open: '`', close: '`' };
const UNDER: Seg = { seg: '下划线', cmd: 'underline', open: '~', close: '~' };

/** 把期望写成「整格里替换掉该段」 */
function cellWith(s: Seg, replacement: string) {
  return CELL.replace(s.open + s.seg + s.close, replacement);
}

let app: ElectronApplication;
let win: Page;
let cdp: any;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-cellmx-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, DOC, 'utf8');
  app = await electron.launch({
    // 独立 user-data-dir：否则单实例锁会让本次启动直接退出（见 AGENTS.md §9.6b）
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1600, height: 900 });
  await win.locator('.cm-content').waitFor({ state: 'visible', timeout: 60_000 });
  await win.locator('table').first().waitFor({ state: 'visible', timeout: 60_000 });
  await win.waitForTimeout(1200);
  cdp = await win.context().newCDPSession(win);
});

test.afterAll(async () => {
  // 留着未保存的格内编辑会让关窗弹确认框，app.close() 就挂住了
  if (win) {
    await win.locator('.cm-line').first().click().catch(() => undefined);
    await win.keyboard.press('Control+s').catch(() => undefined);
    await win.waitForTimeout(600);
  }
  if (app) await app.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** 段内某个字的落点：头=首字左缘，中=次字左缘，尾=末字右缘 */
async function pointOf(segment: string, where: 'head' | 'mid' | 'tail') {
  const p = await win.locator('td').first().evaluate(
    (cell, [seg, w]) => {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const i = (n.nodeValue || '').indexOf(seg);
        if (i < 0) continue;
        const r = document.createRange();
        const at = w === 'head' ? i : w === 'mid' ? i + 1 : i + seg.length - 1;
        r.setStart(n, at);
        r.setEnd(n, at + 1);
        const rect = r.getBoundingClientRect();
        return { x: w === 'tail' ? rect.right - 1 : rect.left + 1, y: rect.top + rect.height / 2 };
      }
      return null;
    },
    [segment, where]
  );
  if (!p) throw new Error('单元格里找不到片段 ' + segment);
  return p;
}

async function clickAt(where: 'head' | 'mid' | 'tail', segment: string) {
  const p = await pointOf(segment, where);
  await win.mouse.click(p.x, p.y);
  await win.waitForTimeout(300);
}

const pressed = (cmd: string) =>
  win.locator(`.mda-cm-edit-toolbar [data-cmd="${cmd}"]`).getAttribute('aria-pressed');

async function clickTool(cmd: string) {
  await win.locator(`.mda-cm-edit-toolbar [data-cmd="${cmd}"]`).click();
  await win.waitForTimeout(350);
}

async function cellSource() {
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(450);
  const line = fs.readFileSync(file, 'utf8').split('\n').find((x) => x.indexOf('| 含 ') === 0) || '';
  return line.replace(/^\|\s/, '').replace(/\s\|$/, '');
}

async function resetDoc() {
  // 焦点留在格内时 Ctrl+Z 由格内消化，撤不到 CM6 历史
  await win.locator('.cm-line').first().click();
  await win.waitForTimeout(200);
  for (let i = 0; i < 30; i++) {
    if ((await cellSource()) === CELL) return;
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(150);
  }
  expect(await cellSource()).toBe(CELL);
}

/** 真实中文输入法：组字阶段落进 DOM 的是拼音，上屏时才整体换成汉字（见 AGENTS.md §9.4l5b） */
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

async function dragSelect(
  segment: string,
  from: 'head' | 'mid' | 'tail',
  to: 'head' | 'mid' | 'tail'
) {
  const a = await pointOf(segment, from);
  const b = await pointOf(segment, to);
  await win.mouse.move(a.x, a.y);
  await win.mouse.down();
  await win.mouse.move(b.x, b.y, { steps: 8 });
  await win.mouse.up();
  await win.waitForTimeout(300);
}

test('E-CELL-1 输入法中文落在头前/文中/末尾都并入样式段', async () => {
  for (const s of [BOLD, CODE, UNDER]) {
    const cases: [('head' | 'mid' | 'tail'), string][] = [
      ['head', s.open + '测试' + s.seg + s.close],
      ['mid', s.open + s.seg[0] + '测试' + s.seg.slice(1) + s.close],
      ['tail', s.open + s.seg + '测试' + s.close],
    ];
    for (const [where, want] of cases) {
      await resetDoc();
      await clickAt(where, s.seg);
      await imeType('测试', PINYIN_CESHI);
      // 拼音残留会在这里现形（曾经是 `c测试`）
      expect(await cellSource(), `${s.seg}/${where}`).toBe(cellWith(s, want));
    }
  }
});

test('E-CELL-2 工具栏一次点击即切换，取消后输入落在样式外', async () => {
  for (const s of [BOLD, ITALIC, STRIKE, CODE, UNDER]) {
    const cases: [('head' | 'mid' | 'tail'), string][] = [
      ['head', '测试' + s.open + s.seg + s.close],
      // 段中取消要拆成两段，而不是留裸定界符
      ['mid', s.open + s.seg[0] + s.close + '测试' + s.open + s.seg.slice(1) + s.close],
      ['tail', s.open + s.seg + s.close + '测试'],
    ];
    for (const [where, want] of cases) {
      await resetDoc();
      await clickAt(where, s.seg);
      expect(await pressed(s.cmd), `${s.seg}/${where} 点文字后`).toBe('true');
      await clickTool(s.cmd);
      expect(await pressed(s.cmd), `${s.seg}/${where} 点一次工具后`).toBe('false');
      await imeType('测试', PINYIN_CESHI);
      expect(await cellSource(), `${s.seg}/${where}`).toBe(cellWith(s, want));
    }
  }
});

test('E-CELL-3 四向拖选后删除不留裸定界符', async () => {
  const dirs: [string, 'head' | 'mid' | 'tail', 'head' | 'mid' | 'tail', (s: Seg) => string][] = [
    ['头→中', 'head', 'mid', (s) => s.open + s.seg.slice(1) + s.close],
    ['中→头', 'mid', 'head', (s) => s.open + s.seg.slice(1) + s.close],
    ['中→尾', 'mid', 'tail', (s) => s.open + s.seg[0] + s.close],
    ['尾→中', 'tail', 'mid', (s) => s.open + s.seg[0] + s.close],
  ];
  for (const s of [BOLD, STRIKE]) {
    for (const [label, a, b, want] of dirs) {
      await resetDoc();
      await dragSelect(s.seg, a, b);
      await win.keyboard.press('Delete');
      await win.waitForTimeout(350);
      expect(await cellSource(), `${s.seg}/${label}`).toBe(cellWith(s, want(s)));
    }
  }
});

test('E-CELL-4 选区部分取消样式时拆分', async () => {
  for (const s of [BOLD, STRIKE, CODE]) {
    await resetDoc();
    await dragSelect(s.seg, 'head', 'mid');
    await clickTool(s.cmd);
    expect(await cellSource(), s.seg).toBe(
      cellWith(s, s.seg[0] + s.open + s.seg.slice(1) + s.close)
    );
  }
});

test('E-CELL-5 删除选区后紧接着输入中文', async () => {
  await resetDoc();
  await dragSelect(BOLD.seg, 'head', 'mid');
  await win.keyboard.press('Delete');
  await win.waitForTimeout(300);
  await imeType('测试', PINYIN_CESHI);
  expect(await cellSource()).toBe(cellWith(BOLD, '**测试粗**'));
});

test('E-CELL-6 同格连续操作不串味', async () => {
  await resetDoc();
  // 先在行内代码段里取消一次，再去下划线段头前输入：待输入格式串味会插出反引号
  await clickAt('mid', CODE.seg);
  await clickTool(CODE.cmd);
  await clickAt('head', UNDER.seg);
  await imeType('测试', PINYIN_CESHI);
  expect(await cellSource()).toBe(CELL.replace('~下划线~', '~测试下划线~'));
});

test('E-CELL-7 右键弹表格菜单且不丢格内选区', async () => {
  await resetDoc();
  const p = await pointOf(BOLD.seg, 'mid');
  await win.mouse.click(p.x, p.y);
  await win.waitForTimeout(250);
  await win.mouse.click(p.x, p.y, { button: 'right' });
  await win.waitForTimeout(500);
  const info = await win.evaluate(() => {
    const m = document.querySelector('.mda-context-menu');
    const sel = window.getSelection();
    const td = document.querySelector('td');
    return {
      items: m
        ? Array.from(m.querySelectorAll('.mda-menu-item')).map((e) => (e.textContent || '').trim())
        : [],
      inCell: !!(sel && sel.rangeCount && td && td.contains(sel.getRangeAt(0).startContainer)),
    };
  });
  expect(info.items.length).toBeGreaterThanOrEqual(3);
  expect(info.inCell).toBe(true);
  await win.keyboard.press('Escape');
  await win.waitForTimeout(250);
});

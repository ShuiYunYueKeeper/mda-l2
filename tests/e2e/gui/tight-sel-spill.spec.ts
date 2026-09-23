/**
 * 长文档靠后、上方有块 widget 时，跨行紧致选区不得铺满整行。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const TARGET =
  '批注的**枚举值、识别正则、级别配色与严重度**统一外置到 `src/config/annotation-schema.json`，\n' +
  '作为单一可配置真相；`@mda/core` 与 GUI 均从中派生（GUI 经 preload 暴露 `levelColors`/`levelSeverity`）。\n';

const DOC =
  '# Sel spill\n\n' +
  '```mermaid\ngraph TD\n  A-->B\n```\n\n' +
  '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\n' +
  '## 规则配置\n\n' +
  TARGET;

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-sel-spill-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, DOC, 'utf8');
  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1100, height: 800 });
  await win.locator('.cm-content').waitFor({ state: 'visible', timeout: 60_000 });
  await win.locator('.cm-line', { hasText: '统一外置' }).first().waitFor({ state: 'visible', timeout: 60_000 });
  await win.waitForTimeout(1500);
});

test.afterAll(async () => {
  if (app) await app.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** 在可见 DOM 文字上拖选（不依赖 EditorView 句柄） */
async function dragSelect(startText: string, endText: string) {
  const pts = await win.evaluate(
    ({ startText, endText }) => {
      const root = document.querySelector('.cm-content');
      if (!root) return null;

      function pointFor(s: string, atEnd: boolean) {
        const w = document.createTreeWalker(root!, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = w.nextNode())) {
          const val = n.nodeValue || '';
          const i = val.indexOf(s);
          if (i < 0) continue;
          const range = document.createRange();
          if (atEnd) {
            range.setStart(n, i + s.length - 1);
            range.setEnd(n, i + s.length);
          } else {
            range.setStart(n, i);
            range.setEnd(n, i + 1);
          }
          const r = range.getBoundingClientRect();
          if (r.width < 0.5 && r.height < 0.5) continue;
          (n.parentElement as HTMLElement | null)?.scrollIntoView({ block: 'center' });
          const r2 = range.getBoundingClientRect();
          return {
            x: atEnd ? r2.right - 1 : r2.left + 1,
            y: (r2.top + r2.bottom) / 2,
          };
        }
        return null;
      }

      return { a: pointFor(startText, false), b: pointFor(endText, true) };
    },
    { startText, endText }
  );

  expect(pts).toBeTruthy();
  expect(pts!.a).toBeTruthy();
  expect(pts!.b).toBeTruthy();
  await win.mouse.move(pts!.a!.x, pts!.a!.y);
  await win.mouse.down();
  await win.mouse.move(pts!.b!.x, pts!.b!.y, { steps: 20 });
  await win.mouse.up();
  await win.waitForTimeout(200);
}

test('块 widget 下方跨行选区高亮不铺满整行', async () => {
  await dragSelect('统一外', '与 GUI 均');

  const info = await win.evaluate(() => {
    const marks = Array.from(document.querySelectorAll('.mda-cm-tight-sel')).map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, top: r.top, right: r.right };
    });
    const lines = Array.from(document.querySelectorAll('.cm-line')).filter((el) =>
      (el.textContent || '').includes('统一外置') || (el.textContent || '').includes('与 GUI 均')
    );
    const lineW = Math.max(0, ...lines.map((el) => el.getBoundingClientRect().width));
    return { marks, lineW };
  });

  expect(info.marks.length).toBeGreaterThan(0);
  for (const m of info.marks) {
    expect(m.w).toBeGreaterThan(8);
    if (info.lineW > 100) {
      expect(m.w).toBeLessThan(info.lineW * 0.92);
    }
  }
  const widest = Math.max(...info.marks.map((m) => m.w));
  expect(widest).toBeLessThan(480);
});

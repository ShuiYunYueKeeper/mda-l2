/**
 * README 两处回车回归：标题行末 / 纯加粗行末。
 * - ## 目录结构 末尾 Enter：大纲高亮不丢、不闪（始终有 .active）
 * - **CLI 模式：** 末尾 Enter：不得拆成 **text\\n**
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-enter-'));
  file = path.join(dir, 'readme-slice.md');
  // 精简复现：对齐 README L10 标题与 L102 纯加粗
  fs.writeFileSync(
    file,
    '# MDA\n\n## 目录结构\n\n正文一段。\n\n### 3. 启动\n\n**CLI 模式：**\n\n```bash\necho ok\n```\n',
    'utf8'
  );
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
  if (app) await app.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function clickLineEnd(needle: string) {
  await win.locator('.cm-content').evaluate((root, text) => {
    const lines = Array.from(root.querySelectorAll('.cm-line')) as HTMLElement[];
    const el = lines.find((l) => (l.textContent || '').includes(text));
    if (!el) throw new Error('line not found: ' + text);
    const rect = el.getBoundingClientRect();
    // 点行末可见区域右侧内侧
    const x = rect.right - 4;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y) || el;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
  }, needle);
  await win.waitForTimeout(200);
}

test('标题「目录结构」行末回车：大纲高亮切到该节', async () => {
  const outlineLink = win.locator('.mda-outline-link', { hasText: '目录结构' });
  await expect(outlineLink).toBeVisible({ timeout: 15_000 });
  await outlineLink.click();
  await win.waitForTimeout(300);
  await expect(outlineLink).toHaveClass(/active/);

  await clickLineEnd('目录结构');
  await win.keyboard.press('Enter');
  // 光标已在「目录结构」下的空行 → 大纲必须高亮「目录结构」，不能钉在上级 H1
  await expect
    .poll(async () => {
      return win.evaluate(() => {
        const a = document.querySelector('.mda-outline-link.active');
        return a ? (a.textContent || '').trim() : '';
      });
    }, { timeout: 2000 })
    .toBe('目录结构');

  // debounce 重建后仍正确，且采样期间始终有高亮
  const samples: boolean[] = [];
  for (let i = 0; i < 12; i++) {
    samples.push(
      await win.evaluate(() => {
        const a = document.querySelector('.mda-outline-link.active');
        return !!(a && (a.textContent || '').trim() === '目录结构');
      })
    );
    await win.waitForTimeout(40);
  }
  await win.waitForTimeout(350);
  samples.push(
    await win.evaluate(() => {
      const a = document.querySelector('.mda-outline-link.active');
      return !!(a && (a.textContent || '').trim() === '目录结构');
    })
  );
  expect(samples.every(Boolean), 'outline must stay on 目录结构').toBe(true);
});

test('纯加粗「CLI 模式」行末回车：不拆定界符', async () => {
  await clickLineEnd('CLI 模式');
  await win.keyboard.press('Enter');
  await win.waitForTimeout(400);
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(600);
  const text = fs.readFileSync(file, 'utf8');
  expect(text).not.toMatch(/\*\*[^\n*]*\n\*\*/);
  expect(text).toMatch(/\*\*CLI 模式：\*\*\n/);
});

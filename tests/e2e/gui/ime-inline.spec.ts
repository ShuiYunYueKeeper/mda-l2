import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const LINE = '含 ~下划线~、**加粗**、*斜体*、~~删除线~~、`行内代码`。';

/** 光标落在某个可见片段的左缘 / 右缘，模拟用户点击。 */
type Edge = 'head' | 'tail';

async function run(edge: Edge, visible: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-ime-'));
  const file = path.join(dir, 'ime.md');
  fs.writeFileSync(file, '# T\n\n' + LINE + '\n', 'utf8');

  // 独立 userData：否则本机已开着的 MDA 会因单实例锁让本次实例直接退出
  const app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'udata')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  try {
    const window = await app.firstWindow();
    await window.setViewportSize({ width: 1280, height: 800 });
    await expect(window.locator('.cm-content')).toBeVisible({ timeout: 45_000 });
    await window.waitForTimeout(1500);

    // 找到渲染后包含该可见文本的最内层元素，点它的左/右边缘
    const target = window.locator('.cm-content').getByText(visible, { exact: true }).first();
    await expect(target).toBeVisible({ timeout: 20_000 });
    const box = (await target.boundingBox())!;
    await window.mouse.click(
      edge === 'head' ? box.x + 1 : box.x + box.width - 1,
      box.y + box.height / 2
    );
    await window.waitForTimeout(400);

    // 真实输入法：组字 + 上屏
    const cdp = await window.context().newCDPSession(window);
    await cdp.send('Input.imeSetComposition', {
      text: 'ce',
      selectionStart: 2,
      selectionEnd: 2,
    });
    await window.waitForTimeout(200);
    await cdp.send('Input.imeSetComposition', {
      text: '测试',
      selectionStart: 2,
      selectionEnd: 2,
    });
    await window.waitForTimeout(200);
    await cdp.send('Input.insertText', { text: '测试' });
    await window.waitForTimeout(800);

    const doc = await window.locator('.cm-content').evaluate((el) => el.textContent || '');
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(1200);
    const saved = fs.readFileSync(file, 'utf8');
    return { visibleDoc: doc, saved };
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const CASES: [string, string][] = [
  ['下划线', '下划线'],
  ['加粗', '加粗'],
  ['斜体', '斜体'],
  ['删除线', '删除线'],
  ['行内代码', '行内代码'],
];

test.describe('IME 行内定界符（真实 Electron）', () => {
  for (const [name, visible] of CASES) {
    for (const edge of ['head', 'tail'] as Edge[]) {
      test(`${name} ${edge === 'head' ? '头前' : '尾部'}输入汉字不产生裸定界符`, async () => {
        const r = await run(edge, visible);
        // eslint-disable-next-line no-console
        console.log(`\n[${name}/${edge}]\n  可见=${r.visibleDoc}\n  源码=${JSON.stringify(r.saved)}`);
        const line = r.saved.split('\n').find((l) => l.indexOf('含 ') === 0) || '';
        expect(line).toContain('测试');
        expect(r.visibleDoc).not.toMatch(/[*~`]/);
      });
    }
  }
});

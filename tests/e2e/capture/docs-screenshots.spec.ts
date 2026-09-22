/**
 * 交付截图批量采集（README / 操作说明书 / 软著材料用）。
 *
 * 默认跳过：会写仓库文件且耗时，不应混进常规 e2e。
 * 采集：`$env:MDA_CAPTURE='1'; npx playwright test tests/e2e/capture/docs-screenshots.spec.ts`
 *
 * 刻意不设 MDA_CM6：首个用例同时充当「默认即预览编辑」的回归验证。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');
const DOC = path.join(ROOT, 'samples/review-demo.md');
const OUT_DIR = path.join(ROOT, 'docs/screenshots/v3');

const VIEWPORT = { width: 1440, height: 900 };

test.skip(!process.env.MDA_CAPTURE, '仅在 MDA_CAPTURE=1 时采集交付截图');
test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let win: Page;
let userDataDir: string;
let workDoc: string;

async function shot(name: string) {
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

async function shotOf(selector: string, name: string) {
  await win.waitForTimeout(300);
  await win.locator(selector).screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

/**
 * 把光标放到某个可见文字上（预览模式下点的是渲染结果）。
 * CM6 只渲染视口附近的行，滚到别处后目标行根本不在 DOM 里，
 * 所以先按 dir 把文档滚到头/尾再找。
 */
async function clickText(text: string, nth = 0, dir: 'top' | 'bottom' = 'top') {
  await win.locator('#cm-editor-host .cm-content').click({ position: { x: 20, y: 20 } });
  await win.keyboard.press(dir === 'top' ? 'Control+Home' : 'Control+End');
  await win.waitForTimeout(500);
  const line = win.locator('.cm-line', { hasText: text }).nth(nth);
  await line.scrollIntoViewIfNeeded({ timeout: 8_000 });
  await line.click();
  await win.waitForTimeout(200);
}

async function scrollDocTo(dir: 'top' | 'bottom') {
  await win.locator('#cm-editor-host .cm-content').click({ position: { x: 20, y: 20 } });
  await win.keyboard.press(dir === 'top' ? 'Control+Home' : 'Control+End');
  await win.waitForTimeout(700);
}

/**
 * 补充场景的采集不应阻塞整套：serial 模式下任一失败会让后续用例全部不执行，
 * 少一张图远比断掉采集划算，所以这些场景失败只告警。
 */
async function optional(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.warn(`[capture] 跳过「${label}」: ${(e as Error).message.split('\n')[0]}`);
  }
}

/** 设置 / 帮助只挂在原生菜单上，Playwright 点不到菜单栏，改从主进程补发 IPC */
async function sendMenuIpc(channel: string) {
  await app.evaluate(({ BrowserWindow }, ch) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) w.webContents.send(ch);
  }, channel);
  await win.waitForTimeout(700);
}

async function closeDialog(selector: string) {
  if (await win.locator(selector).isVisible().catch(() => false)) {
    await win.keyboard.press('Escape');
    await win.waitForTimeout(400);
  }
}

test.beforeAll(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // main.js 有单实例锁：不给独立 userData，本机开着的 MDA 会让被测实例秒退
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-capture-'));

  // 用例会编辑文档，拷一份到临时工作区，避免把截图过程写回仓库样张。
  // 顺带多拷几个样例，文件侧栏才有树可看。
  const wsDir = path.join(userDataDir, 'workspace');
  fs.mkdirSync(path.join(wsDir, 'samples'), { recursive: true });
  workDoc = path.join(wsDir, 'review-demo.md');
  fs.writeFileSync(workDoc, fs.readFileSync(DOC, 'utf8'), 'utf8');
  for (const name of ['annotated-demo.md', 'katex.md', 'mermaid.md', 'all-blocks.md']) {
    fs.copyFileSync(path.join(ROOT, 'samples', name), path.join(wsDir, 'samples', name));
  }
  // 工作区根由 main 进程在启动时读取；预置后 #tb-files 才是可用状态
  fs.writeFileSync(
    path.join(userDataDir, 'workspace-prefs.json'),
    JSON.stringify({ root: wsDir, rememberSession: true, rememberLayout: false }, null, 2),
    'utf8',
  );

  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${userDataDir}`, workDoc],
    env: { ...process.env, MDA_LANG: 'zh' },
  });
  win = await app.firstWindow();
  await win.setViewportSize(VIEWPORT);
  await expect(win.locator('.mda-cm-edit-toolbar')).toBeVisible({ timeout: 45_000 });
  await win.waitForTimeout(1500); // 等 Mermaid / KaTeX 首轮渲染落定
});

test.afterAll(async () => {
  if (app) await app.close();
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
});

test('01 默认即预览编辑', async () => {
  const cls = await win.evaluate(() => document.body.className);
  expect(cls).toContain('mda-cm6-active');
  expect(cls).toContain('mda-cm6-mode-preview');
  await expect(win.locator('#cm-editor-host .cm-content')).toBeVisible();
  await shot('01-preview-edit');
});

test('02 批注栏：级别色条与状态筛选', async () => {
  await win.locator('#tb-panel').click();
  await expect(win.locator('#panel-pane')).toBeVisible();
  await expect(win.locator('#anno-list .anno-item').first()).toBeVisible();
  await shot('02-anno-panel');
  await shotOf('#panel-pane', '02b-anno-panel-detail');
});

test('03 选区批注：正文锚点高亮', async () => {
  await win.locator('#anno-list .anno-item').nth(2).click();
  await shot('03-anno-selection');
});

test('04 工具栏提示：名称 + 快捷键 + 作用位置', async () => {
  await win.locator('.mda-cm-edit-toolbar [data-cmd="bold"]').hover();
  await win.waitForTimeout(900);
  await shot('04-toolbar-tip');
});

test('05 插入菜单', async () => {
  await win.locator('.mda-cm-edit-toolbar [data-cmd="insert-open"]').click();
  await win.waitForTimeout(500);
  await shot('05-insert-menu');
  await win.keyboard.press('Escape');
});

test('06 查找：命中代码块与表格内的文字', async () => {
  await win.keyboard.press('Control+f');
  await expect(win.locator('#find-replace-bar')).toBeVisible();
  await win.locator('#fr-find').fill('定界符');
  await win.waitForTimeout(800);
  await shot('06-find-highlight');
});

test('07 替换：全部替换一次撤销', async () => {
  await win.locator('#fr-find').fill('定界符');
  await win.waitForTimeout(500);
  await shot('07-replace-bar');
  await win.locator('#fr-close').click();
  await win.waitForTimeout(300);
});

test('08 表格：单元格内编辑', async () => {
  const cell = win.locator('.mda-cm-table td').first();
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await win.waitForTimeout(400);
  await shot('08-table-edit');
});

test('09 代码块与流程图 widget', async () => {
  await win.locator('.mda-cm-mermaid-block').first().scrollIntoViewIfNeeded();
  await win.waitForTimeout(600);
  await shot('09-mermaid-code');
});

test('10 大纲：标题树与当前章节', async () => {
  await win.locator('.mda-outline-panel').scrollIntoViewIfNeeded();
  await clickText('3.1');
  await shot('10-outline');
});

test('11 源码模式：Ctrl+E', async () => {
  await win.locator('#tb-edit').click();
  await win.waitForTimeout(700);
  await shot('11-source-mode');
  await win.locator('#tb-edit').click();
  await win.waitForTimeout(500);
});

test('12 文件侧栏', async () => {
  await win.locator('#tb-files').click();
  await win.waitForTimeout(700);
  await shot('12-file-sidebar');
  await win.locator('#tb-files').click();
  await win.waitForTimeout(400);
});

test('13 深色主题', async () => {
  await win.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await win.waitForTimeout(800);
  await shot('13-dark-mode');
  await win.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await win.waitForTimeout(500);
});

test('14 工具栏特写', async () => {
  await shotOf('.mda-cm-edit-toolbar', '14-toolbar-closeup');
});

test('15 段落样式下拉', async () => {
  await optional('段落样式下拉', async () => {
    await clickText('背景');
    await win.locator('.mda-cm-tb-paragraph').first().click();
    await win.waitForTimeout(500);
    await shot('15-paragraph-select');
    await win.keyboard.press('Escape');
    await win.waitForTimeout(300);
  });
});

test('16 批注编辑对话框', async () => {
  await optional('批注编辑对话框', async () => {
    if (!(await win.locator('#panel-pane').isVisible())) await win.locator('#tb-panel').click();
    await clickText('传统 Markdown');
    await win.locator('#btn-add').click();
    await expect(win.locator('#edit-dialog')).toBeVisible({ timeout: 8_000 });
    await win.locator('#ed-content').fill('建议在此处补充与同类工具的对比表格。');
    await win.locator('#ed-tags').fill('文档,定位');
    await win.waitForTimeout(400);
    await shot('16-anno-dialog');
    await shotOf('#edit-dialog', '16b-anno-dialog-detail');
    await win.locator('#ed-cancel').click();
    await win.waitForTimeout(400);
  });
});

test('17 批注筛选区', async () => {
  await optional('批注筛选区', async () => {
    await shotOf('#panel-pane', '17-anno-filters');
  });
});

test('18 清空全部批注确认', async () => {
  await optional('清空批注确认', async () => {
    await win.locator('#btn-clear-all').click();
    await win.waitForTimeout(700);
    await shot('18-clear-annos-confirm');
    await win.keyboard.press('Escape');
    await win.waitForTimeout(400);
  });
});

test('19 设置对话框', async () => {
  await optional('设置对话框', async () => {
    await sendMenuIpc('menu-settings');
    await expect(win.locator('#settings-dialog')).toBeVisible({ timeout: 10_000 });
    await shot('19-settings');
    await shotOf('#settings-dialog', '19b-settings-detail');
    await closeDialog('#settings-dialog');
  });
});

test('20 帮助：功能与快捷键', async () => {
  await optional('帮助对话框', async () => {
    await sendMenuIpc('menu-show-help');
    await expect(win.locator('#help-dialog')).toBeVisible({ timeout: 10_000 });
    await shot('20-help');
    await shotOf('#help-dialog', '20b-help-detail');
    await closeDialog('#help-dialog');
  });
});

test('21 代码块就地编辑', async () => {
  await optional('代码块编辑', async () => {
    const code = win.locator('.mda-cm-code-block').first();
    await code.scrollIntoViewIfNeeded();
    await code.click();
    await win.waitForTimeout(600);
    await shot('21-code-edit');
  });
});

test('22 数学公式渲染', async () => {
  await optional('数学公式', async () => {
    await scrollDocTo('bottom');
    const katex = win.locator('.katex').first();
    await katex.scrollIntoViewIfNeeded({ timeout: 8_000 });
    await win.waitForTimeout(600);
    await shot('22-katex');
  });
});

test('23 跳转到行', async () => {
  await optional('跳转到行', async () => {
    await win.keyboard.press('Control+g');
    await win.waitForTimeout(700);
    await shot('23-goto-line');
    await win.keyboard.press('Escape');
    await win.waitForTimeout(300);
  });
});

test('24 大纲收起', async () => {
  await optional('大纲收起', async () => {
    // 收起按钮只在 hover 大纲区时出现（分隔线默认隐藏，见 AGENTS §9.4j）
    await win.locator('#outline-host').hover();
    await win.waitForTimeout(600);
    await win.locator('#outline-float-toggle').click({ timeout: 8_000 });
    await win.waitForTimeout(700);
    await shot('24-outline-collapsed');
    await win.locator('#outline-expand-rail').click({ timeout: 8_000 });
    await win.waitForTimeout(400);
  });
});

test('25 深色 + 源码模式', async () => {
  await optional('深色源码', async () => {
    await win.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await win.locator('#tb-edit').click();
    await win.waitForTimeout(800);
    await shot('25-dark-source');
    await win.locator('#tb-edit').click();
    await win.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await win.waitForTimeout(600);
  });
});

/**
 * 原生 HTML 块回归：GitHub 风格的居中头部（`<p align="center">`/`<h1>`/徽章 `<img>`）与
 * `<details>` 折叠块，在 CM6 预览模式必须渲染成真元素，而不是逐行显示源码。
 * 同时对「块内 Markdown 照常排版」「危险标签/脚本被清洗」「源码态可改」做端到端守护。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

// 内联 SVG 图标走 data:（CSP 已放行 data:），避免 e2e 依赖外网徽章
const ICON =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#17556b"/></svg>',
    'utf8'
  ).toString('base64');

const DOC = [
  '<p align="center">',
  `<img src="${ICON}" alt="图标" width="64" height="64" />`,
  '</p>',
  '',
  '<h1 align="center">测试标题</h1>',
  '<p align="center"><strong>副标题一行</strong></p>',
  '',
  '分隔段落。',
  '',
  '<details>',
  '<summary><strong>展开：小节</strong></summary>',
  '',
  '### 内部标题',
  '',
  '内部 **加粗** 段落',
  '',
  '</details>',
  '',
  '结尾普通段落。',
  '',
].join('\n');

const DANGER_DOC = ['<div>前置<script>window.__mdaX = 1</script>可见文字</div>', ''].join('\n');

// 高过视口的卡片（走「克隆 + 内联样式 + 图片内联」回退导出），带一张图：
// HTML 序列化器会把 <img> 写成未闭合标签，SVG 解析会直接失败（「复制失败」回归）。
function tallDoc(): string {
  const parts = ['<div align="center">', '', `![示意图](${ICON})`, ''];
  for (let i = 1; i <= 40; i++) {
    parts.push(`## 第 ${i} 节`);
    parts.push('');
    parts.push(`正文段落 ${i}，含**加粗**与 \`代码\`。`);
    parts.push('');
  }
  parts.push('</div>', '', '后续正文。', '');
  return parts.join('\n');
}

/** 手柄 →「复制为」→「复制为图片」，返回成功 toast 文案（失败会弹「复制失败」对话框） */
async function copyBlockAsImage(page: Page, blockIndex = 0): Promise<{ toast: string; modal: string }> {
  const block = page.locator('.mda-cm-html-block').nth(blockIndex);
  const frame = block.locator('.mda-cm-html-frame');
  await frame.scrollIntoViewIfNeeded();
  const fb = await frame.boundingBox();
  expect(fb).toBeTruthy();
  await page.mouse.move(fb!.x + fb!.width / 2, fb!.y + 20);
  await page.waitForTimeout(300);
  const hb = await frame.locator('.mda-cm-block-drag-handle').first().boundingBox();
  expect(hb).toBeTruthy();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const menu = page.locator('#mda-block-handle-menu');
  await menu.waitFor({ state: 'visible', timeout: 5000 });
  await menu.locator('.mda-menu-has-sub').filter({ hasText: '复制为' }).first().hover();
  const item = page.locator('.mda-block-handle-submenu [data-act="image"]').first();
  await item.waitFor({ state: 'visible', timeout: 5000 });

  const readToast = async () =>
    page.evaluate(() => {
      const el = document.querySelector('.mda-toast, #mda-toast');
      return el ? el.textContent || '' : '';
    });
  const beforeToast = await readToast();
  await item.click({ force: true });

  let toast = beforeToast;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(100);
    const next = await readToast();
    if (next && next !== beforeToast) {
      toast = next;
      break;
    }
  }
  const modal = await page.evaluate(() => {
    const el = document.querySelector('.modal-overlay');
    return el ? (el as HTMLElement).innerText || '' : '';
  });
  return { toast, modal };
}

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-html-block-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, DOC, 'utf8');
  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1400, height: 900 });
  await win.locator('.cm-content').waitFor({ state: 'visible', timeout: 60_000 });
  await win.locator('.mda-cm-html-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await win.waitForTimeout(800);
});

// 用例会把文档改脏（源码态编辑 / 插入块），关窗时主进程会挂「未保存」确认框，
// 直接 await app.close() 可能一直等到 worker teardown 超时 —— 改为主进程直接 exit(0)。
test.afterAll(async () => {
  if (app) {
    try {
      await app.evaluate(({ app: electronApp }) => {
        electronApp.exit(0);
      });
    } catch (_) {
      /* ignore */
    }
    try {
      app.process().kill();
    } catch (_) {
      /* ignore */
    }
  }
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }
});

async function resetDoc(text: string) {
  await win.evaluate((t) => {
    const view = (window as any).MDAEditor.findEditorView();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
  }, text);
  await win.waitForTimeout(600);
}

/** 进入源码态：widget 可能因 eq() 复用而保留上次的源码态，先看是否已可见 */
async function openSource(block: import('@playwright/test').Locator) {
  const input = block.locator('.mda-cm-html-source-input');
  if (!(await input.isVisible())) await block.locator('[data-action="source"]').click();
  await expect(input).toBeVisible();
  await win.waitForTimeout(200);
  return input;
}

test('居中头部渲染成真元素且图标加载成功', async () => {
  const header = win.locator('.mda-cm-html-block').first();
  await expect(header.locator('h1[align="center"]')).toHaveText('测试标题');
  await expect(header.locator('p[align="center"] strong')).toHaveText('副标题一行');
  const img = header.locator('img[alt="图标"]');
  await expect(img).toHaveCount(1);
  expect(await img.evaluate((el: any) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test('HTML 源码不再泄漏成正文文字', async () => {
  const text = await win.locator('.cm-content').innerText();
  expect(text).not.toContain('<p align');
  expect(text).not.toContain('<h1 align');
  expect(text).not.toContain('<details>');
  expect(text).not.toContain('</summary>');
  expect(text).not.toContain('<img src=');
});

test('details 折叠块：块内 Markdown 照常排版且可展开', async () => {
  const block = win.locator('.mda-cm-html-block').nth(1);
  const details = block.locator('details');
  await expect(details.locator('summary')).toContainText('展开：小节');
  // 块内 Markdown（### 标题 / **加粗**）由 renderMarkdown 渲染，不是字面源码
  await expect(details.locator('h3')).toHaveText('内部标题');
  await expect(details.locator('strong').last()).toHaveText('加粗');
  await details.locator('summary').click();
  await expect(details).toHaveJSProperty('open', true);
});

test('危险标签被清洗：script 既不执行也不留文字', async () => {
  await resetDoc(DANGER_DOC);
  const block = win.locator('.mda-cm-html-block').first();
  await expect(block).toContainText('前置可见文字');
  await expect(block.locator('script')).toHaveCount(0);
  expect(await win.evaluate(() => (window as any).__mdaX)).toBeUndefined();
});

test('「代码」按钮切源码态，Esc 回到渲染态', async () => {
  await resetDoc(DOC);
  const block = win.locator('.mda-cm-html-block').first();
  await block.locator('[data-action="source"]').click();
  const input = block.locator('.mda-cm-html-source-input');
  await expect(input).toBeVisible();
  await expect(input).toContainText('<h1 align="center">测试标题</h1>');
  await input.press('Escape');
  await expect(input).toBeHidden();
  await expect(block.locator('h1[align="center"]')).toHaveText('测试标题');
});

test('块内双击不切源码态（仍是预览渲染）', async () => {
  await resetDoc(DOC);
  const block = win.locator('.mda-cm-html-block').first();
  const title = block.locator('h1[align="center"]');
  await title.dblclick();
  await win.waitForTimeout(400);
  // 源码框不出现、渲染元素仍在、整篇仍是预览模式
  await expect(block.locator('.mda-cm-html-source-input')).toBeHidden();
  await expect(title).toBeVisible();
  expect(await win.evaluate(() => document.body.className)).toContain('mda-cm6-mode-preview');
  // 双击后仍可经「代码」按钮进源码态
  await block.locator('[data-action="source"]').click();
  await expect(block.locator('.mda-cm-html-source-input')).toBeVisible();
});

test('源码态可拖选文字，选区可见（不被预览模式透明化）', async () => {
  await resetDoc(DOC);
  const block = win.locator('.mda-cm-html-block').first();
  const input = await openSource(block);

  const box = await input.boundingBox();
  expect(box).toBeTruthy();
  await win.mouse.move(box!.x + 10, box!.y + 12);
  await win.mouse.down();
  await win.mouse.move(box!.x + 260, box!.y + 12, { steps: 10 });
  const picked = await win.evaluate(() => String(window.getSelection() || ''));
  await win.mouse.up();
  // 拖选真的选中了源码文字
  expect(picked.length).toBeGreaterThan(0);
  expect(picked).not.toContain('测试标题'); // 选的是源码框里的行，不是正文渲染内容
  // ::selection 不是透明（预览模式默认把 cm-content 内的选区刷成透明）
  const bg = await input.evaluate((el) => getComputedStyle(el, '::selection').backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg).not.toBe('transparent');
});

test('源码框内 Ctrl+A 只框选源码，不触发整篇全选', async () => {
  await resetDoc(DOC);
  const block = win.locator('.mda-cm-html-block').first();
  const input = await openSource(block);
  await input.click();
  await win.keyboard.press('Control+a');
  await win.waitForTimeout(150);
  const picked = await win.evaluate(() => String(window.getSelection() || ''));
  expect(picked).toContain('<h1 align="center">');
  expect(picked).toContain('副标题一行');
  // 只框住本块源码，没把后面 details 块也圈进来
  expect(picked).not.toContain('</details>');
  // 文档选区没有被拉成整篇（CM6 文档选区仍应是折叠的）
  expect(
    await win.evaluate(() => {
      const view = (window as any).MDAEditor.findEditorView();
      const sel = view.state.selection.main;
      return sel.empty;
    })
  ).toBe(true);
});

test('源码态选区右键：复制/剪切可用（不置灰）', async () => {
  await resetDoc(DOC);
  const block = win.locator('.mda-cm-html-block').first();
  const input = await openSource(block);
  await input.click();
  await win.keyboard.press('Control+a');
  await win.waitForTimeout(150);
  const box = await input.boundingBox();
  expect(box).toBeTruthy();
  await win.mouse.click(box!.x + 80, box!.y + 14, { button: 'right' });
  const menu = win.locator('.mda-cm-context-menu');
  await menu.waitFor({ state: 'visible', timeout: 5000 });
  const rowDisabled = (label: string) =>
    menu
      .locator('.mda-menu-item')
      .filter({ hasText: label })
      .first()
      .evaluate(
        (el) => el.classList.contains('disabled') || el.classList.contains('mda-menu-item-disabled')
      );
  expect(await rowDisabled('复制')).toBe(false);
  expect(await rowDisabled('剪切')).toBe(false);
  // 真的能复制（弹「拷贝成功」）
  await menu.locator('.mda-menu-item').filter({ hasText: '复制' }).first().click();
  await win.waitForTimeout(300);
  const toast = await win.evaluate(() => {
    const el = document.querySelector('.mda-toast, #mda-toast');
    return el ? el.textContent || '' : '';
  });
  expect(toast).toContain('拷贝');
});

test('块手柄「复制为图片」导出成功（不再报复制失败）', async () => {
  await resetDoc(DOC);
  const { toast, modal } = await copyBlockAsImage(win);
  expect(modal).not.toContain('复制失败');
  expect(toast).toContain('已复制图片');
});

test('高过视口的卡片（走回退导出）带图片也能复制为图片', async () => {
  await resetDoc(tallDoc());
  const block = win.locator('.mda-cm-html-block').first();
  await block.waitFor({ state: 'visible', timeout: 8000 });
  // 确认这次确实超出视口（否则跑的是实时截图路径，覆盖不到回退分支）
  const box = await block.locator('.mda-cm-html-frame').boundingBox();
  const vh = await win.evaluate(() => window.innerHeight);
  expect(box!.height).toBeGreaterThan(vh);
  const { toast, modal } = await copyBlockAsImage(win);
  expect(modal).not.toContain('复制失败');
  expect(toast).toContain('已复制图片');
});

test('插入菜单可新建 HTML 块，落点直接进源码态', async () => {
  await resetDoc('第一段。\n\n');
  // 光标放到文末空行（用编辑器状态直接定位，避免依赖窗口键盘焦点）
  await win.evaluate(() => {
    const view = (window as any).MDAEditor.findEditorView();
    const pos = view.state.doc.length;
    view.dispatch({ selection: { anchor: pos, head: pos } });
  });
  await win.waitForTimeout(200);
  // 工具栏「插入」→「HTML 块」
  await win.locator('[data-cmd="insert-open"]').click();
  const menu = win.locator('#mda-toolbar-insert-menu');
  await menu.waitFor({ state: 'visible', timeout: 5000 });
  await menu.locator('[data-act="html"]').click();
  const block = win.locator('.mda-cm-html-block').first();
  await block.waitFor({ state: 'visible', timeout: 8000 });
  await win.waitForTimeout(400);
  const input = block.locator('.mda-cm-html-source-input');
  await expect(input).toBeVisible();
  // 焦点直接在源码框，用户可立即输入
  expect(await input.evaluate((el) => document.activeElement === el)).toBe(true);
  // 改成真内容后失焦 → 渲染出 strong
  await input.evaluate((el) => {
    el.textContent = '<div align="center">\n\n**插入测试**\n\n</div>';
  });
  await win.locator('.cm-content').click({ position: { x: 5, y: 5 } });
  await win.waitForTimeout(600);
  await expect(block.locator('.mda-cm-html-render strong')).toHaveText('插入测试');
});

test('紧贴卡片下方的文字与代码块不被卡片吞掉', async () => {
  // 卡片闭合标签后只有一个换行（没有空行）——CommonMark 仍把后面几行算进同一个
  // HTMLBlock，若整块替换会把这些内容吞进卡片（文字跑到卡片末尾、代码块被吃掉）
  await resetDoc(
    [
      '<div align="center">',
      '',
      '# 居中标题',
      '',
      '</div>',
      // 紧贴闭合标签、没有空行
      '后面的文字',
      '',
      '```',
      'code-line',
      '```',
      '',
    ].join('\n')
  );
  const block = win.locator('.mda-cm-html-block').first();
  await expect(block.locator('h1')).toHaveText('居中标题');
  await expect(block).not.toContainText('后面的文字');
  await expect(block).not.toContainText('code-line');
  // 文字仍是正文、围栏仍是独立的代码块 widget
  await expect(win.locator('.cm-content')).toContainText('后面的文字');
  const code = win.locator('.mda-cm-code-block').first();
  await code.waitFor({ state: 'visible', timeout: 8000 });
  await expect(code.locator('.mda-cm-code-input')).toContainText('code-line');
});

test('文末没有换行时，卡片下方插入代码块不会粘在同一行', async () => {
  // 文档末端没有换行：插入点正好在文档末尾，若不先补 '\n'，围栏会粘在 `</div>` 同一行，
  // 结果既不是块（被卡片吞掉）也显示不出代码块。
  await resetDoc('<div align="center">\n\n# 居中标题\n\n</div>');
  const frame = win.locator('.mda-cm-html-frame').first();
  await frame.scrollIntoViewIfNeeded();
  const fb = await frame.boundingBox();
  expect(fb).toBeTruthy();
  await win.mouse.move(fb!.x + fb!.width / 2, fb!.y + 20);
  await win.waitForTimeout(300);
  const handle = frame.locator('.mda-cm-block-drag-handle').first();
  const hb = await handle.boundingBox();
  expect(hb).toBeTruthy();
  await win.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await win.mouse.down();
  await win.mouse.up();
  const menu = win.locator('#mda-block-handle-menu');
  await menu.waitFor({ state: 'visible', timeout: 5000 });
  await menu.locator('.mda-menu-has-sub').filter({ hasText: '下方插入' }).first().hover();
  const item = win.locator('.mda-block-handle-submenu [data-act="code"]').first();
  await item.waitFor({ state: 'visible', timeout: 5000 });
  await item.click({ force: true });
  await win.waitForTimeout(600);

  const doc = await win.evaluate(() => {
    const view = (window as any).MDAEditor.findEditorView();
    return view ? view.state.doc.toString() : '';
  });
  // 围栏另起一行，且卡片只到 `</div>` 为止
  expect(doc).toContain('</div>\n```');
  expect(doc).not.toContain('</div>```');
  const block = win.locator('.mda-cm-html-block').first();
  await expect(block).not.toContainText('```');
  const code = win.locator('.mda-cm-code-block').first();
  await code.waitFor({ state: 'visible', timeout: 8000 });
});

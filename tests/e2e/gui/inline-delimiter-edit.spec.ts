/**
 * 行内定界符编辑的真机回归：连续插入（头前 / 尾部）与四向选区删除。
 *
 * 必须在真实 Electron 里跑：模型层单测覆盖不到 IME 上屏、点击落点校准、
 * 以及 pending 格式在**连续多次操作**之间的状态残留（曾导致下一段插出别的定界符）。
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const LINE = '含 ~下划线~、**加粗**、*斜体*、~~删除线~~、`行内代码`。';
const SEGS = ['下划线', '加粗', '斜体', '删除线', '行内代码'];
/** 顿号紧贴开定界符：拆分取消曾产出 CommonMark 无法独立渲染的残段 */
const PUNCT_LINE = '含 ~下划线~**、加粗**、*斜体*、~~删除线~~。';
const PUNCT_PREFIX = '含 ~下划线~**、';

/**
 * 直接取 samples/all-blocks.md 的验收行原文，避免测试文本与样例漂移。
 * 该行里加粗的开定界符落在顿号**之前**（`**、加粗**`），所以「加粗头前」实际落在
 * 内容内部，其余四段才是真正的头外插入；末尾还带链接。这条路径与干净文本不同，必须覆盖。
 */
const REAL_PREFIX = '在头前插入汉字：';
const REAL_LINE = (() => {
  const sample = fs.readFileSync(path.join(ROOT, 'samples/all-blocks.md'), 'utf8');
  const line = sample.split(/\r?\n/).find((l) => l.indexOf(REAL_PREFIX) === 0);
  if (!line) throw new Error('samples/all-blocks.md 里找不到「' + REAL_PREFIX + '」行');
  return line;
})();

/** 每段头前插入「测试」后的期望结果：段名在该行内唯一，逐段替换即可 */
const REAL_EXPECTED = SEGS.reduce(
  (acc, seg) => acc.replace(seg, '测试' + seg),
  REAL_LINE
);

/** 预览可见文本里出现任何定界符字符，就说明有定界符泄漏 */
const STRAY_RE = /[*~`]/;

let app: ElectronApplication;
let win: Page;
let cdp: Awaited<ReturnType<Page['context']>['newCDPSession']> extends never ? never : any;
let dir: string;
let file: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-inline-'));
  file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, '# T\n\n' + LINE + '\n\n' + REAL_LINE + '\n\n' + PUNCT_LINE + '\n', 'utf8');
  app = await electron.launch({
    // 独立 user-data-dir：否则单实例锁会让本次启动直接退出（见 AGENTS.md §9.6）
    args: [ELECTRON_MAIN, `--user-data-dir=${path.join(dir, 'u')}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1400, height: 900 });
  await win.locator('.cm-content').waitFor({ state: 'visible', timeout: 60_000 });
  await win.waitForTimeout(1500);
  cdp = await win.context().newCDPSession(win);
});

test.afterAll(async () => {
  if (app) await app.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function sourceOf(prefix: string) {
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return lines.find((l) => l.indexOf(prefix) === 0) || '';
}

async function source() {
  return sourceOf('含 ');
}

/**
 * 片段首字符左缘的视口坐标 —— 用户理解的「头前」。
 * 必须锁定**样式 span 内**的文本节点：`getByText` 或全量文本查找会命中行首正文
 * （例如在 `选区删除测试：` 里找到「删除」），点到完全不相干的位置。
 */
async function headPointOf(segment: string, linePrefix: string) {
  const p = await win.locator('.cm-content').evaluate(
    (root, [seg, prefix]) => {
      const line = Array.prototype.find.call(
        root.querySelectorAll('.cm-line'),
        (el: Element) => (el.textContent || '').indexOf(prefix) === 0
      ) as Element | undefined;
      if (!line) return null;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const cls = (n.parentElement && n.parentElement.className) || '';
        if (cls.indexOf('mda-cm-') !== 0) continue;
        const i = (n.nodeValue || '').indexOf(seg);
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 1);
        const rect = r.getBoundingClientRect();
        return { x: rect.left + 1, y: rect.top + rect.height / 2 };
      }
      return null;
    },
    [segment, linePrefix]
  );
  if (!p) throw new Error(`在「${linePrefix}」行找不到样式片段 ${segment}`);
  return p;
}

async function visibleBody() {
  const text = await win.locator('.cm-content').evaluate((el) => el.textContent || '');
  const idx = text.indexOf('含 ');
  return idx < 0 ? text : text.slice(idx);
}

async function boxOf(segment: string) {
  const loc = win.locator('.cm-content').getByText(segment, { exact: true }).first();
  await loc.waitFor({ state: 'visible', timeout: 10_000 });
  return (await loc.boundingBox())!;
}

/**
 * 走 CDP 模拟一次真实中文输入法：组字阶段落进文档的是**拼音字母**（含分隔用的 `'`），
 * 上屏时才整体替换成汉字。用最终汉字当组字文本会绕开拼音残留清理这条路径，
 * 实测中正是它掩盖了「头前上屏多出一对定界符」的缺陷。
 */
async function imeType(text: string, pinyin: string) {
  for (let i = 1; i <= pinyin.length; i++) {
    await cdp.send('Input.imeSetComposition', {
      text: pinyin.slice(0, i),
      selectionStart: i,
      selectionEnd: i,
    });
    await win.waitForTimeout(60);
  }
  await win.waitForTimeout(120);
  await cdp.send('Input.insertText', { text });
  await win.waitForTimeout(500);
}

/** 「测试」的真实拼音串，含输入法自动插入的音节分隔符 */
const PINYIN_CESHI = "ce'shi";

async function dragSelect(x1: number, y1: number, x2: number, y2: number) {
  await win.mouse.move(x1, y1);
  await win.mouse.down();
  await win.waitForTimeout(120);
  await win.mouse.move((x1 + x2) / 2, (y1 + y2) / 2);
  await win.waitForTimeout(80);
  await win.mouse.move(x2, y2);
  await win.waitForTimeout(120);
  await win.mouse.up();
  await win.waitForTimeout(300);
}

/** 连续撤销回到初始文本；跨用例复用同一个窗口，正是为了暴露状态残留 */
async function resetDoc() {
  for (let i = 0; i < 16; i++) {
    if ((await source()) === LINE && (await sourceOf(REAL_PREFIX)) === REAL_LINE) return;
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(150);
  }
  expect(await source()).toBe(LINE);
  expect(await sourceOf(REAL_PREFIX)).toBe(REAL_LINE);
}

test('E-INL-1 同一行连续在各段头前用输入法插入汉字', async () => {
  await resetDoc();
  for (const seg of SEGS) {
    const p = await headPointOf(seg, '含 ');
    await win.mouse.click(p.x, p.y);
    await win.waitForTimeout(300);
    await imeType('测试', PINYIN_CESHI);
    expect(await visibleBody()).not.toMatch(STRAY_RE);
  }
  expect(await source()).toBe(
    '含 ~测试下划线~、**测试加粗**、*测试斜体*、~~测试删除线~~、`测试行内代码`。'
  );
});

test('E-INL-1b samples/all-blocks.md 验收行上连续头前插入', async () => {
  await resetDoc();
  for (const seg of SEGS) {
    const p = await headPointOf(seg, REAL_PREFIX);
    await win.mouse.click(p.x, p.y);
    await win.waitForTimeout(300);
    await imeType('测试', PINYIN_CESHI);
    expect(await visibleBody()).not.toMatch(STRAY_RE);
  }
  expect(await sourceOf(REAL_PREFIX)).toBe(REAL_EXPECTED);
});

test('E-INL-2 同一行连续在各段尾部用输入法插入汉字', async () => {
  await resetDoc();
  for (const seg of SEGS) {
    const b = await boxOf(seg);
    await win.mouse.click(b.x + b.width - 1, b.y + b.height / 2);
    await win.waitForTimeout(300);
    await imeType('测试', PINYIN_CESHI);
    expect(await visibleBody()).not.toMatch(STRAY_RE);
  }
  expect(await source()).toBe(
    '含 ~下划线测试~、**加粗测试**、*斜体测试*、~~删除线测试~~、`行内代码测试`。'
  );
});

const DIRECTIONS: [string, (b: DOMRect) => [number, number, number, number]][] = [
  ['头→中', (b) => [b.x + 1, b.y + b.height / 2, b.x + b.width / 2, b.y + b.height / 2]],
  ['中→头', (b) => [b.x + b.width / 2, b.y + b.height / 2, b.x + 1, b.y + b.height / 2]],
  ['中→尾', (b) => [b.x + b.width / 2, b.y + b.height / 2, b.x + b.width - 1, b.y + b.height / 2]],
  ['尾→中', (b) => [b.x + b.width - 1, b.y + b.height / 2, b.x + b.width / 2, b.y + b.height / 2]],
];

for (const [dirName, mk] of DIRECTIONS) {
  test(`E-INL-3 ${dirName} 拖选后删除不破坏定界符`, async () => {
    for (const seg of SEGS) {
      await resetDoc();
      const b = await boxOf(seg);
      const [x1, y1, x2, y2] = mk(b as unknown as DOMRect);
      await dragSelect(x1, y1, x2, y2);
      await win.keyboard.press('Delete');
      await win.waitForTimeout(400);

      const vis = await visibleBody();
      const src = await source();
      // 可见文本不得出现裸定界符
      expect(`${dirName}/${seg} 可见=${vis}`).not.toMatch(STRAY_RE);
      // 删了字但样式段仍成对存在（未被整段吞掉、也没剩下半对）。
      // 末尾句号不做断言：拖到可见右缘时落点可能越过闭定界符把句号一并选中，那是正确行为。
      expect(src).not.toBe(LINE);
      expect(src).toMatch(/^含 ~[^~*`]+~、\*\*[^*`~]+\*\*、\*[^*`~]+\*、~~[^~*`]+~~、`[^`]+`/);
    }
  });
}

async function clickLineStart(prefix: string) {
  const p = await win.locator('.cm-content').evaluate((root, pre) => {
    const line = Array.prototype.find.call(
      root.querySelectorAll('.cm-line'),
      (el: Element) => (el.textContent || '').indexOf(pre) === 0
    ) as Element;
    const r = line.getBoundingClientRect();
    return { x: r.left + 3, y: r.top + r.height / 2 };
  }, prefix);
  await win.mouse.click(p.x, p.y);
  await win.waitForTimeout(250);
}

const TOOLBAR_CMD: Record<string, string> = {
  下划线: 'underline',
  加粗: 'bold',
  斜体: 'italic',
  删除线: 'strike',
  行内代码: 'code',
};

/**
 * 段头/段尾这两个落点在屏幕上与「定界符外侧」重合，早先规划器在这里只挪光标不改标记，
 * 用户看到的就是「点了没反应，要点两次才切换」。
 */
test('E-INL-4 段头/段尾点击后，工具栏一次点击即切换', async () => {
  for (const seg of SEGS) {
    const cmd = TOOLBAR_CMD[seg];
    const btn = win.locator(`.mda-cm-edit-toolbar [data-cmd="${cmd}"]`);
    for (const where of ['head', 'tail'] as const) {
      await resetDoc();
      // 先落到纯文本处，清掉上一轮遗留的待输入覆盖态
      await clickLineStart('含 ');
      if (where === 'head') {
        const p = await headPointOf(seg, '含 ');
        await win.mouse.click(p.x, p.y);
      } else {
        const b = await boxOf(seg);
        await win.mouse.click(b.x + b.width - 1, b.y + b.height / 2);
      }
      await win.waitForTimeout(350);
      expect(await btn.getAttribute('aria-pressed'), `${seg}/${where} 点文字后`).toBe('true');

      await btn.click();
      await win.waitForTimeout(350);
      expect(await btn.getAttribute('aria-pressed'), `${seg}/${where} 点一次工具后`).toBe('false');
    }
  }
});

test('E-INL-5 取消样式后连续输入两次：文字保持无样式、工具栏不弹回', async () => {
  if ((await sourceOf(PUNCT_PREFIX)) !== PUNCT_LINE) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const i = lines.findIndex((l) => l.indexOf(PUNCT_PREFIX) === 0);
    if (i >= 0) lines[i] = PUNCT_LINE;
    else lines.push(PUNCT_LINE);
    fs.writeFileSync(file, lines.join('\n'));
    await win.keyboard.press('Control+r');
    await win.waitForTimeout(1200);
  }

  const p = await headPointOf('加粗', PUNCT_PREFIX);
  await win.mouse.click(p.x, p.y);
  await win.waitForTimeout(350);
  const btn = win.locator('.mda-cm-edit-toolbar [data-cmd="bold"]');
  expect(await btn.getAttribute('aria-pressed')).toBe('true');
  await btn.click();
  await win.waitForTimeout(350);
  expect(await btn.getAttribute('aria-pressed')).toBe('false');

  await imeType('测试', PINYIN_CESHI);
  expect(await btn.getAttribute('aria-pressed')).toBe('false');
  expect(await sourceOf(PUNCT_PREFIX)).toBe(
    PUNCT_PREFIX + '测试**加粗**、*斜体*、~~删除线~~。'
  );

  await imeType('你好', "ni'hao");
  expect(await btn.getAttribute('aria-pressed')).toBe('false');
  const src = await sourceOf(PUNCT_PREFIX);
  expect(src).toBe(PUNCT_PREFIX + '测试你好**加粗**、*斜体*、~~删除线~~。');
  expect(src).not.toMatch(/\*\*\*\*/);
});

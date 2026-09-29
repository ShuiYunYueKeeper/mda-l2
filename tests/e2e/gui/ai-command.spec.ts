/**
 * - 请求里不得出现批注（@anno）
 * - 润色 → 审阅 → 采纳：只替换正文，批注行逐字节保留；一次撤销完整回退
 * - Esc 放弃：文档不变
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { AddressInfo } from 'net';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');

const ANNO = '[comment]: <> (@anno {"id":"11111111-1111-4111-8111-111111111111","content":"secret-review-note","tags":[],"level":"info","status":"open","created_at":"2026-01-01T00:00:00.000Z"})';
const DOC = '# 标题\n\n' + ANNO + '\n这是一段需要润色的文字。\n\n末段。\n';
const REPLY = '这是一段润色后的文字。';

let app: ElectronApplication;
let win: Page;
let dir: string;
let file: string;
let server: http.Server;
const requests: any[] = [];

test.describe.configure({ mode: 'serial' });

function startFakeAi(): Promise<number> {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (!req.url || !req.url.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      try { requests.push(JSON.parse(body)); } catch (_) { requests.push(null); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const parts = [REPLY.slice(0, 4), REPLY.slice(4, 8), REPLY.slice(8)];
      let i = 0;
      const tick = () => {
        if (i < parts.length) {
          res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: parts[i] } }] }) + '\n\n');
          i += 1;
          setTimeout(tick, 60);
        } else {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      };
      tick();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

test.beforeAll(async () => {
  const port = await startFakeAi();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-ai-'));
  const userData = path.join(dir, 'u');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, 'ai-settings.json'), JSON.stringify({
    version: 2,
    provider: 'custom',
    providerEnabled: true,
    providers: {
      custom: {
        baseUrl: `http://127.0.0.1:${port}/v1`,
        models: [{ id: 'fake-model', enabled: true, source: 'manual' }],
        defaultModelId: 'fake-model',
        apiKeyEnc: { enc: 'b64', data: Buffer.from('sk-test', 'utf8').toString('base64') },
      },
    },
    prefs: { outputLang: 'auto', longTextConfirmChars: 20000 },
  }), 'utf8');
  file = path.join(dir, 'ai.md');
  fs.writeFileSync(file, DOC, 'utf8');
  app = await electron.launch({
    args: [ELECTRON_MAIN, `--user-data-dir=${userData}`, file],
    env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
  });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1400, height: 900 });
  await win.locator('.cm-content').waitFor({ state: 'visible', timeout: 60_000 });
  await win.waitForTimeout(1200);
});

test.afterAll(async () => {
  if (app) await app.close();
  if (server) server.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function clickInLine(needle: string) {
  await win.locator('.cm-content').evaluate((root, text) => {
    const lines = Array.from(root.querySelectorAll('.cm-line')) as HTMLElement[];
    const el = lines.find((l) => (l.textContent || '').includes(text));
    if (!el) throw new Error('line not found: ' + text);
    const rect = el.getBoundingClientRect();
    const x = rect.left + 30;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y) || el;
    const o = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    target.dispatchEvent(new MouseEvent('mousedown', o));
    target.dispatchEvent(new MouseEvent('mouseup', o));
    target.dispatchEvent(new MouseEvent('click', o));
  }, needle);
  await win.waitForTimeout(200);
}

async function menuAi(action: string) {
  await app.evaluate(({ BrowserWindow }, a) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu-ai-action', a);
  }, action);
}

test('润色：请求不含批注；采纳只替换正文、保留批注行；一次撤销回退', async () => {
  await clickInLine('需要润色');
  await menuAi('polish');

  const panel = win.locator('.mda-ai-panel[data-status="review"]');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.locator('.mda-ai-del').first()).toHaveText('需要');
  await expect(panel.locator('.mda-ai-ins').first()).toHaveText('后');

  expect(requests.length).toBeGreaterThan(0);
  const last = requests[requests.length - 1];
  const userText = (last.messages || []).filter((m: any) => m.role !== 'system').map((m: any) => m.content).join('\n');
  expect(userText).toContain('这是一段需要润色的文字。');
  expect(userText).not.toContain('@anno');
  expect(userText).not.toContain('secret-review-note');
  expect(last.model).toBe('fake-model');

  await panel.locator('[data-act="accept"]').click();
  await expect(win.locator('.mda-ai-panel')).toBeHidden();

  await win.keyboard.press('Control+s');
  await win.waitForTimeout(600);
  const saved = fs.readFileSync(file, 'utf8');
  expect(saved).toBe('# 标题\n\n' + ANNO + '\n' + REPLY + '\n\n末段。\n');

  await win.locator('.cm-content').focus();
  await win.keyboard.press('Control+z');
  await win.waitForTimeout(300);
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(600);
  expect(fs.readFileSync(file, 'utf8')).toBe(DOC);
});

test('Esc 放弃：文档不变、面板关闭', async () => {
  await clickInLine('末段');
  await menuAi('polish');
  const panel = win.locator('.mda-ai-panel[data-status="review"]');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await win.keyboard.press('Escape');
  await expect(win.locator('.mda-ai-panel')).toBeHidden();
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(600);
  expect(fs.readFileSync(file, 'utf8')).toBe(DOC);
});

test('解释：只读卡片，含复制 / 插入到下方 / 转为批注，文档不变', async () => {
  await clickInLine('需要润色');
  await menuAi('explain');
  const card = win.locator('.mda-ai-panel[data-status="read"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('.mda-ai-read')).toContainText('润色后');
  await expect(card.locator('[data-act="to-anno"]')).toBeVisible();
  await win.screenshot({ path: path.join(ROOT, 'test-results', 'ai-read-card.png') });
  await card.locator('[data-act="close"]').last().click();
  await expect(win.locator('.mda-ai-panel')).toBeHidden();
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(600);
  expect(fs.readFileSync(file, 'utf8')).toBe(DOC);
});

test('设置 → AI：显示已存模型，Key 不回显', async () => {
  await menuAi('settings');
  const pane = win.locator('[data-pane-panel="ai"]');
  await expect(pane).toBeVisible({ timeout: 10_000 });
  await expect(pane.locator('.mda-ai-model-row')).toContainText('fake-model');
  await expect(pane.locator('#settings-ai-key')).toHaveValue('');
  await expect(win.locator('#settings-ai-default-model')).toHaveValue('fake-model');
  await win.screenshot({ path: path.join(ROOT, 'test-results', 'ai-settings-pane.png') });
  await win.locator('#settings-cancel').click();
  await expect(win.locator('#settings-dialog')).toHaveCount(0);
});

test('命令条：Ctrl+J 菜单打开，输入框获焦', async () => {
  await clickInLine('末段');
  await menuAi('command-bar');
  const panel = win.locator('.mda-ai-panel[data-status="input"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator('[data-role="instruction"]')).toBeFocused();
  await win.keyboard.press('Escape');
  await expect(win.locator('.mda-ai-panel')).toBeHidden();
});

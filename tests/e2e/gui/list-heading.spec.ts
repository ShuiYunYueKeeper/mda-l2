/**
 * 列表 + 标题共存的渲染回归：
 * - `- ## 标题` / `1. ## 标题` 仍套用标题行高（Decoration.line 必须锚在行首）
 * - 列表符号字号跟随标题级别（符号在标题 span 之外，需单独跟随）
 * - 任务项只出复选框，不再多画一个圆点
 */
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(__dirname, '../../..');
const ELECTRON_MAIN = path.join(ROOT, 'dist/gui/main.js');
const SAMPLE = path.join(ROOT, 'samples/list-heading.md');

test.describe('列表项内标题渲染', () => {
  test('行高/字号跟随标题级别，任务项无多余圆点', async () => {
    // 独立 userData：main.js 有单实例锁，本机开着的 MDA 会让本次实例直接退出
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-e2e-'));
    const app = await electron.launch({
      args: [ELECTRON_MAIN, `--user-data-dir=${userDataDir}`, SAMPLE],
      env: { ...process.env, MDA_LANG: 'zh', MDA_CM6: '1' },
    });

    try {
      const window = await app.firstWindow();
      await window.setViewportSize({ width: 1280, height: 900 });
      const content = window.locator('.mda-cm6-host .cm-content');
      await expect(content).toBeVisible({ timeout: 45_000 });
      await expect(content.locator('.cm-line.mda-cm-h2-line').first()).toBeVisible();

      const info = await content.evaluate((root) => {
        const lines = Array.from(root.querySelectorAll('.cm-line')) as HTMLElement[];
        const find = (needle: string) =>
          lines.find((el) => (el.textContent || '').includes(needle)) || null;
        const describe = (el: HTMLElement | null) => {
          if (!el) return null;
          const cs = getComputedStyle(el);
          const heading = el.querySelector('.mda-cm-h2') as HTMLElement | null;
          const marker = el.querySelector('.mda-cm-bullet, .mda-cm-list-mark') as HTMLElement | null;
          return {
            classes: el.className,
            lineHeight: cs.lineHeight,
            headingFontSize: heading ? getComputedStyle(heading).fontSize : null,
            markerFontSize: marker ? getComputedStyle(marker).fontSize : null,
            bulletCount: el.querySelectorAll('.mda-cm-bullet').length,
            taskCount: el.querySelectorAll('.mda-cm-task').length,
          };
        };
        return {
          plain: describe(find('普通二级标题')),
          bullet: describe(find('无序列表里的二级标题')),
          ordered: describe(find('有序列表里的二级标题')),
          task: describe(find('任务项一')),
        };
      });

      expect(info.plain).toBeTruthy();
      expect(info.bullet).toBeTruthy();
      expect(info.ordered).toBeTruthy();
      expect(info.task).toBeTruthy();

      // 标题行高不因外层列表而丢失
      expect(info.bullet!.classes).toContain('mda-cm-h2-line');
      expect(info.ordered!.classes).toContain('mda-cm-h2-line');
      expect(info.bullet!.lineHeight).toBe(info.plain!.lineHeight);
      expect(info.ordered!.lineHeight).toBe(info.plain!.lineHeight);

      // 列表符号与标题正文同字号
      expect(info.bullet!.markerFontSize).toBe(info.bullet!.headingFontSize);
      expect(info.ordered!.markerFontSize).toBe(info.ordered!.headingFontSize);

      // 任务项：只有复选框，没有圆点
      expect(info.task!.taskCount).toBe(1);
      expect(info.task!.bulletCount).toBe(0);
    } finally {
      await app.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});

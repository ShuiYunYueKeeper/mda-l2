/**
 * 长图全屏：不能按 50vh 把整张压进视口。
 * 715×15594 在 900×700 窗口里会被压成约 15×331，看起来发花。
 */
// @ts-nocheck
const zoom = require('../../src/gui/renderer/zoom-image.js');

describe('planLongImageLayout', () => {
  test('普通横图仍走原来的视口内适配', () => {
    expect(zoom.planLongImageLayout({
      nw: 1920, nh: 1080, viewportW: 1600, viewportH: 900, dpr: 1, scale: 1,
    })).toBeNull();
  });

  test('样图按设备像素 1:1 排版，而不是压成一条', () => {
    const plan = zoom.planLongImageLayout({
      nw: 715, nh: 15594, viewportW: 1920, viewportH: 1080, dpr: 1, scale: 1,
    });
    expect(plan).not.toBeNull();
    expect(plan.useTiles).toBe(true);
    expect(plan.cssW).toBe(715);
    expect(plan.contentH).toBe(15594);
    expect(plan.tiles.map((t) => t.sh)).toEqual([4096, 4096, 4096, 3306]);
    expect(plan.tiles.reduce((s, t) => s + t.sh, 0)).toBe(15594);
    expect(plan.cssHeights.reduce((s, h) => s + h, 0)).toBe(15594);
    // 打开时顶对齐，并且平移范围够得到底部
    expect(plan.initialTy).toBe((15594 - 1080) / 2);
    expect(plan.maxY).toBe(plan.initialTy);
    expect(plan.cssW).toBeGreaterThan(100);
  });

  test('高于一屏但未超纹理上限时不切分片', () => {
    const plan = zoom.planLongImageLayout({
      nw: 800, nh: 2400, viewportW: 1400, viewportH: 900, dpr: 1, scale: 1,
    });
    expect(plan.useTiles).toBe(false);
    expect(plan.tiles).toEqual([{ sy: 0, sh: 2400, sw: 800 }]);
    expect(plan.cssW).toBe(800);
    expect(plan.cssHeights).toEqual([2400]);
  });

  test('HiDPI 用 1/dpr 避免再被拉糊', () => {
    const plan = zoom.planLongImageLayout({
      nw: 715, nh: 15594, viewportW: 1920, viewportH: 1080, dpr: 2, scale: 1,
    });
    expect(plan.cssW).toBe(358);
    expect(plan.contentH).toBe(7797);
  });

  test('宽于视口时缩小到视口宽度', () => {
    const plan = zoom.planLongImageLayout({
      nw: 2000, nh: 8000, viewportW: 1000, viewportH: 800, dpr: 1, scale: 1,
    });
    expect(plan.cssW).toBe(Math.round(1000 * 0.92));
    expect(plan.contentH).toBeLessThan(8000);
  });

  test('用户放大后视口中心仍对着同一位置', () => {
    const before = zoom.planLongImageLayout({
      nw: 715, nh: 15594, viewportW: 1920, viewportH: 1080, dpr: 1, scale: 1,
    });
    const after = zoom.planLongImageLayout({
      nw: 715, nh: 15594, viewportW: 1920, viewportH: 1080, dpr: 1, scale: 2,
    });
    const ty = zoom.remapCenteredOffset(before.initialTy, before.contentH, after.contentH);
    const pointBefore = before.contentH / 2 - before.initialTy;
    const pointAfter = after.contentH / 2 - ty;
    expect(pointAfter / after.contentH).toBeCloseTo(pointBefore / before.contentH, 6);
    expect(zoom.remapCenteredOffset(40, 1000, 1000)).toBe(40);
  });
});

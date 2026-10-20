// @ts-nocheck
const wechat = require('../../src/gui/renderer/wechat-article.js');

describe('公众号剪贴板 HTML', () => {
  test('裸 URL 变成带颜色的链接，颜色写在内部 span 上', () => {
    const html = '<p style="color:#333;">Microsoft Store<br>https://apps.microsoft.com/detail/9nhcdvqk88vl?hl=zh-CN&amp;gl=HK</p>';
    const out = wechat.adaptWechatArticleHtml(html);
    expect(out).toContain('href="https://apps.microsoft.com/detail/9nhcdvqk88vl?hl=zh-CN&amp;gl=HK"');
    expect(out).toContain('<span style="' + wechat.LINK_STYLE + '">https://apps.microsoft.com/detail/9nhcdvqk88vl?hl=zh-CN&amp;gl=HK</span>');
    expect(out).toContain('color:' + wechat.LINK_COLOR);
  });

  test('链接文字本身是 URL 时不再套一层', () => {
    const html = '<p><a href="https://example.com/docs">https://example.com/docs</a></p>';
    const out = wechat.adaptWechatArticleHtml(html);
    expect(out.match(/<a\b/g)).toHaveLength(1);
    expect(out.match(/<span/g)).toHaveLength(1);
  });

  test('已有链接补上内部 span，不重复包裹', () => {
    const html = '<p><a href="https://github.com/ShuiYunYueKeeper/mda-l2/releases" style="color:#0969da;text-decoration:none;">发布页</a></p>';
    const once = wechat.adaptWechatArticleHtml(html);
    const twice = wechat.adaptWechatArticleHtml(once);
    expect(once.match(/<span/g)).toHaveLength(1);
    expect(twice.match(/<span/g)).toHaveLength(1);
    expect(once).toContain('>发布页</span>');
    expect(once).toContain('href="https://github.com/ShuiYunYueKeeper/mda-l2/releases"');
  });

  test('代码块里的 URL 保持字面文本', () => {
    const html = '<pre><code>see https://example.com/a</code></pre><p>https://example.com/b.</p>';
    const out = wechat.adaptWechatArticleHtml(html);
    expect(out).toContain('<code>see https://example.com/a</code>');
    expect(out).toContain('href="https://example.com/b"');
    expect(out).toContain('</a>.');
  });

  test('内容图改为通栏，并保留原图像素供自适应使用', () => {
    const html = '<img src="data:image/png;base64,abc" alt="截图" width="640" height="360" data-mda-display-width="640" data-mda-pixel-width="1920" data-mda-pixel-height="1080" style="width:640px;max-width:100%;height:auto;">';
    const out = wechat.adaptWechatArticleHtml(html);
    expect(out).not.toContain('data-mda-');
    expect(out).not.toContain('width:640px');
    expect(out).toContain('width="1920"');
    expect(out).toContain('height="1080"');
    expect(out).toContain('data-w="1920"');
    expect(out).toContain('data-ratio="0.5625"');
    expect(out).toContain('style="' + wechat.CONTENT_IMAGE_STYLE + '"');
    expect(out).toContain('src="data:image/png;base64,abc"');
  });

  test('内容图导出宽度固定为 1080，避免微信二次压缩', () => {
    expect(wechat.planWechatBitmapSize(2400, 1350)).toEqual({ width: 1080, height: 608 });
    expect(wechat.planWechatBitmapSize(640, 360)).toEqual({ width: 1080, height: 608 });
    expect(wechat.planWechatBitmapSize(1080, 1080)).toEqual({ width: 1080, height: 1080 });
    expect(wechat.planWechatBitmapSize(800, 420)).toEqual({ width: 1080, height: 567 });
    var tall = wechat.planWechatBitmapSize(1080, 20000);
    expect(tall.width * tall.height).toBeLessThanOrEqual(wechat.IMAGE_MAX_PIXELS);
  });

  test('公式图保持逻辑宽度，不被拉成通栏', () => {
    const html = '<img class="mda-formula-img mda-formula-img-block" src="data:image/png;base64,abc" alt="公式" data-mda-pixel-width="360" data-mda-pixel-height="80" style="display:block;margin:12px auto;width:180px;max-width:100%;height:auto;">';
    const out = wechat.adaptWechatArticleHtml(html);
    expect(out).toContain('width:180px');
    expect(out).not.toMatch(/(^|;|\s)width:100%/);
    expect(out).toContain('data-w="360"');
  });

  test('SVG 按 viewBox 比例栅格化，不保留 width=100%', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420" width="100%" height="100%"><text>成本</text></svg>';
    expect(wechat.svgIntrinsicSize(svg)).toEqual({ width: 800, height: 420 });
    const prepared = wechat.prepareSvgMarkupForRaster(svg, 1080, 567);
    expect(prepared).toContain('viewBox="0 0 800 420"');
    expect(prepared).toContain('width="1080"');
    expect(prepared).toContain('height="567"');
    expect(prepared).not.toContain('100%');
    const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
    expect(wechat.decodeSvgDataUrl(dataUrl)).toBe(svg);
  });
});

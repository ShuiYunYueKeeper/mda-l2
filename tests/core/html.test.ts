import { createMarkdownIt, renderMarkdown } from '../../src/core/renderer';
import { sanitizeHtml } from '../../src/core/html';

describe('原生 HTML 渲染（README 居中头部）', () => {
  const md = createMarkdownIt();

  test('居中 HTML 头部渲染成标签而不是转义文本', () => {
    const input = [
      '<p align="center">',
      '  <img src="./desktop/builder/app-icon-128.png" alt="图标" width="88" height="88" />',
      '</p>',
      '',
      '<h1 align="center">AI 小说创作工作台</h1>',
      '<p align="center"><strong>副标题</strong></p>',
    ].join('\n');
    const html = renderMarkdown(md, input);

    expect(html).not.toContain('&lt;p');
    expect(html).not.toContain('&lt;h1');
    expect(html).toContain('<p align="center">');
    expect(html).toContain('<h1 align="center">AI 小说创作工作台</h1>');
    expect(html).toContain('width="88"');
  });

  test('徽章行与链接保持可点击', () => {
    const input =
      '<p align="center">\n<a href="https://example.com/releases/latest"><img src="https://img.shields.io/badge/x-1-17556b?style=flat-square" alt="徽章" /></a>\n</p>';
    const html = renderMarkdown(md, input);

    expect(html).toContain('href="https://example.com/releases/latest"');
    expect(html).toContain('src="https://img.shields.io/badge/x-1-17556b?style=flat-square"');
    expect(html).toContain('alt="徽章"');
  });

  test('成形的 &amp; 实体不二次转义', () => {
    const html = sanitizeHtml('<img src="https://img.shields.io/x?style=flat-square&amp;label=a%20b" />');

    expect(html).toContain('&amp;label=');
    expect(html).not.toContain('&amp;amp;');
  });

  test('<details> 跨空行嵌套 Markdown 正文', () => {
    const input = ['<details>', '<summary>点开</summary>', '', '正文 **加粗**', '', '</details>', '', '后续段落'].join('\n');
    const html = renderMarkdown(md, input);

    expect(html).toContain('<details>');
    expect(html).toContain('<summary>点开</summary>');
    expect(html).toContain('<strong>加粗</strong>');
    expect(html).toContain('</details>');
    expect(html).toContain('后续段落');
  });

  test('围栏内的 HTML 样例仍按字面显示', () => {
    const html = renderMarkdown(md, '```\n<div align="center">样例</div>\n```');

    expect(html).toContain('&lt;div align=&quot;center&quot;&gt;');
    expect(html).not.toContain('<div align="center">');
  });
});

describe('HTML 清洗（XSS 防护）', () => {
  test('script 连内容一起丢弃', () => {
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script>')).toBe('<p>a</p>');
  });

  test('style 连内容一起丢弃', () => {
    expect(sanitizeHtml('<style>body{display:none}</style>ok')).toBe('ok');
  });

  test('事件处理器属性一律移除', () => {
    const html = sanitizeHtml('<img src="./a.png" onerror="alert(1)" onload="x()" width="80">');

    expect(html).toBe('<img src="./a.png" width="80" />');
    expect(html).not.toContain('onerror');
  });

  test('javascript: / data:text/html 协议移除，http(s)/相对路径保留', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="java\nscript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="data:text/html;base64,PHN2Zz4=">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toBe('<a href="https://example.com">x</a>');
    expect(sanitizeHtml('<a href="./LICENSE">x</a>')).toBe('<a href="./LICENSE">x</a>');
    expect(sanitizeHtml('<a href="#快速开始">x</a>')).toBe('<a href="#快速开始">x</a>');
    expect(sanitizeHtml('<a href="file:///C:/a.html">x</a>')).toBe('<a>x</a>');
  });

  test('data:image 只在 img/src 放行', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(sanitizeHtml(`<img src="${png}">`)).toContain('src="data:image/png');
    expect(sanitizeHtml(`<a href="${png}">x</a>`)).toBe('<a>x</a>');
  });

  test('iframe / svg / form 等嵌入与脚本容器连内容丢弃', () => {
    expect(sanitizeHtml('<iframe src="https://evil"></iframe>after')).toBe('after');
    expect(sanitizeHtml('<svg onload="alert(1)"><circle/></svg>tail')).toBe('tail');
    expect(sanitizeHtml('<form action="/x"><input name="a"></form>rest')).toBe('rest');
  });

  test('未知标签丢壳留文', () => {
    expect(sanitizeHtml('<custom-tag foo="1">text</custom-tag>')).toBe('text');
    expect(sanitizeHtml('<marquee>跑马灯</marquee>')).toBe('跑马灯');
  });

  test('注释 / doctype / 处理指令整体丢弃', () => {
    expect(sanitizeHtml('a<!-- 注释 -->b')).toBe('ab');
    expect(sanitizeHtml('<!DOCTYPE html><p>x</p>')).toBe('<p>x</p>');
  });

  test('style 属性不在白名单', () => {
    expect(sanitizeHtml('<p style="position:fixed;inset:0">x</p>')).toBe('<p>x</p>');
  });

  test('闭合标签单独成块时保留（<details> 跨空行场景）', () => {
    expect(sanitizeHtml('</details>')).toBe('</details>');
    expect(sanitizeHtml('</span>')).toBe('</span>');
    expect(sanitizeHtml('</script>')).toBe('');
  });

  test('普通文本与实体原样透传', () => {
    expect(sanitizeHtml('a < b &amp; c')).toBe('a < b &amp; c');
  });
});

describe('HTML 渲染不破坏批注不可见性', () => {
  const md = createMarkdownIt();

  test('HTML 块内的批注行不泄漏', () => {
    const input = [
      '<div align="center">',
      '[comment]: <> (@anno {"id":"x","content":"secret-note","tags":[],"level":"info","status":"open","created_at":"2026-01-01T00:00:00Z"})',
      '正文',
      '</div>',
    ].join('\n');
    const html = renderMarkdown(md, input);

    expect(html).not.toContain('@anno');
    expect(html).not.toContain('secret-note');
    expect(html).toContain('正文');
  });
});

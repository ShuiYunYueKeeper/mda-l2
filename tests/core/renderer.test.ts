import { createMarkdownIt, renderMarkdown } from '../../src/core/renderer';

describe('批注不可见性验证', () => {
  const md = createMarkdownIt();

  test('渲染后 HTML 中不包含 @anno 字符串', () => {
    const input = `[comment]: <> (@anno {"id":"x","content":"test","tags":[],"level":"info","status":"open","created_at":"2026-01-01T00:00:00Z"})
这是正文段落。`;
    const html = renderMarkdown(md, input);

    expect(html).not.toContain('@anno');
  });

  test('渲染后 HTML 中不包含批注字段值', () => {
    const input = `[comment]: <> (@anno {"id":"abc123","content":"review note","tags":["bug"],"level":"critical","status":"open","created_at":"2026-01-01T00:00:00Z"})
正文。`;
    const html = renderMarkdown(md, input);

    expect(html).not.toContain('"id":"abc123"');
    expect(html).not.toContain('"content":"review note"');
    expect(html).not.toContain('"level":"critical"');
  });

  test('去除批注行后渲染结果一致', () => {
    const withAnno = `[comment]: <> (@anno {"id":"x","content":"test","tags":[],"level":"info","status":"open","created_at":"2026-01-01T00:00:00Z"})
这是正文段落。`;
    const withoutAnno = '这是正文段落。';

    const htmlWith = renderMarkdown(md, withAnno);
    const htmlWithout = renderMarkdown(md, withoutAnno);

    // 去除空白差异后比较
    expect(htmlWith.trim()).toBe(htmlWithout.trim());
  });

  test('多个批注 + 多个段落均不泄露', () => {
    const input = `[comment]: <> (@anno {"id":"a1","content":"one","tags":["bug"],"level":"critical","status":"open","created_at":"2026-01-01T00:00:00Z"})
[comment]: <> (@anno {"id":"a2","content":"two","tags":["style"],"level":"minor","status":"open","created_at":"2026-01-01T00:00:00Z"})
段落 A。

段落 B 无批注。

[comment]: <> (@anno {"id":"a3","content":"three","tags":["review"],"level":"major","status":"resolved","created_at":"2026-01-01T00:00:00Z"})
段落 C。`;
    const html = renderMarkdown(md, input);

    expect(html).not.toContain('@anno');
    expect(html).not.toContain('"id":"a1"');
    expect(html).not.toContain('"id":"a2"');
    expect(html).not.toContain('"id":"a3"');
    expect(html).toContain('段落 A');
    expect(html).toContain('段落 B');
    expect(html).toContain('段落 C');
  });

  test('批注 JSON 含 HTML 标签时 content 中的文本不出现在渲染输出中', () => {
    // markdown-it 的 commonmark preset 会 HTML-escape content 中的特殊字符
    const input = `[comment]: <> (@anno {"id":"x","content":"script tag example","tags":[],"level":"info","status":"open","created_at":"2026-01-01T00:00:00Z"})
正文。`;
    const html = renderMarkdown(md, input);

    // @anno 行本身不应出现在 HTML 中
    expect(html).not.toContain('@anno');
    // 正文应正常渲染
    expect(html).toContain('正文');
  });
});

describe('图片 alt fallback', () => {
  const md = createMarkdownIt();

  test('自定义 image renderer 输出 fallback 结构', () => {
    const input = '![图片描述](invalid-path.png)';
    const html = renderMarkdown(md, input);

    expect(html).toContain('md-image-wrapper');
    expect(html).toContain('onerror');
    expect(html).toContain('md-image-alt');
    expect(html).toContain('图片描述');
  });
});

describe('level → color 映射', () => {
  test('导出颜色映射', () => {
    const { LEVEL_COLORS } = require('../../src/core/renderer');
    expect(LEVEL_COLORS.critical).toBe('#e74c3c');
    expect(LEVEL_COLORS.major).toBe('#e67e22');
    expect(LEVEL_COLORS.minor).toBe('#f1c40f');
    expect(LEVEL_COLORS.info).toBe('#95a5a6');
  });
});

describe('CommonMark 兼容', () => {
  const md = createMarkdownIt();

  test('标题 H1-H6', () => {
    const html = renderMarkdown(md, '# H1\n## H2\n### H3');
    expect(html).toContain('<h1>H1</h1>');
    expect(html).toContain('<h2>H2</h2>');
    expect(html).toContain('<h3>H3</h3>');
  });

  test('粗体斜体行内代码', () => {
    const html = renderMarkdown(md, '**bold** *italic* `code`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
  });

  test('列表', () => {
    const html = renderMarkdown(md, '- item1\n- item2\n\n1. first\n2. second');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>item1</li>');
    expect(html).toContain('<li>first</li>');
  });

  test('引用块', () => {
    const html = renderMarkdown(md, '> quoted text');
    expect(html).toContain('<blockquote>');
  });

  test('代码块', () => {
    const html = renderMarkdown(md, '```\ncode block\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code>code block');
  });

  test('水平线', () => {
    const html = renderMarkdown(md, '---');
    expect(html).toContain('<hr');
  });

  test('表格 (GFM)', () => {
    const html = renderMarkdown(md, '| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  test('链接', () => {
    const html = renderMarkdown(md, '[text](https://example.com)');
    expect(html).toContain('<a href="https://example.com">text</a>');
  });
});

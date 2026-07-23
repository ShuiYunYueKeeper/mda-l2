// @ts-nocheck
const MarkdownIt = require('markdown-it');
const katexPlugin = require('@vscode/markdown-it-katex').default;
const katex = require('katex');

function createMarkdown() {
  return new MarkdownIt().use(katexPlugin, {
    katex,
    throwOnError: false,
    trust: false,
  });
}

describe('GUI KaTeX rendering', () => {
  test('renders inline and display formulas with current KaTeX', () => {
    const md = createMarkdown();
    const inline = md.render('公式 $E = mc^2$。');
    const display = md.render('$$\n\\sum_{n=1}^{\\infty} \\frac{1}{n^2}\n$$');

    expect(inline).toContain('class="katex"');
    expect(display).toContain('class="katex-display"');
    expect(display).toContain('application/x-tex');
  });

  test('does not render formula syntax inside code fences', () => {
    const html = createMarkdown().render('```text\n$E = mc^2$\n```');
    expect(html).toContain('$E = mc^2$');
    expect(html).not.toContain('class="katex"');
  });

  test('trust false does not emit executable formula links', () => {
    const html = createMarkdown().render('$\\href{javascript:alert(1)}{x}$');
    expect(html).not.toMatch(/<a\b[^>]*href\s*=/i);
    expect(html).not.toMatch(/<script|onerror\s*=/i);
  });
});

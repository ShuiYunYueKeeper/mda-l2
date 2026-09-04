// @ts-nocheck
const { findUnderlineRanges } = require('../../../src/gui/renderer/editor/model/underline');
const { createMarkdownIt, renderMarkdown } = require('../../../src/core/renderer');

describe('underline ~text~', () => {
  test('findUnderlineRanges 识别单波浪线并排除 ~~', () => {
    const text = 'a~u~b ~~s~~ c~x~';
    const ranges = findUnderlineRanges(text, [{ from: 5, to: 11 }]);
    expect(ranges.map((r) => text.slice(r.from, r.to))).toEqual(['~u~', '~x~']);
  });

  test('renderMarkdown 将 ~text~ 渲染为 <u>', () => {
    const md = createMarkdownIt();
    const html = renderMarkdown(md, '见 ~下划线~ 与正文');
    expect(html).toContain('<u>下划线</u>');
    expect(html).not.toContain('~下划线~');
  });
});

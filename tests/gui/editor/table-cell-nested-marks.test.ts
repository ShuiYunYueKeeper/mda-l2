/**
 * 格内加粗叠套斜体/下划线/删除线：规划 + 可见偏移（DOM 见 e2e cell-nested-marks）。
 */
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  visibleToMarkdownOffset,
  markdownToVisibleOffset,
  findSyntaxInlineRanges,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/table-cell-content.js'
));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toggleInlineMarkInText } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/inline-string-ops.js'
));

describe('table cell nested inline marks (plan + offsets)', () => {
  test('findSyntaxInlineRanges 仍只暴露顶层；偏移跳过嵌套定界符', () => {
    expect(findSyntaxInlineRanges('**~~xy~~**').map((r: { type: string }) => r.type)).toEqual([
      'StrongEmphasis',
    ]);
    expect(visibleToMarkdownOffset('**~~xy~~**', 0)).toBe(4);
    expect(markdownToVisibleOffset('**~~xy~~**', 4)).toBe(0);
  });

  test('加粗段部分加删除线再下划线', () => {
    let md = '**能打开、能看懂**';
    let r = toggleInlineMarkInText(md, md.indexOf('能打开'), md.indexOf('能打开') + 3, 'strike');
    expect(r!.value).toBe('**~~能打开~~、能看懂**');
    md = r!.value;
    r = toggleInlineMarkInText(md, md.indexOf('能打开'), md.indexOf('能打开') + 3, 'underline');
    expect(r!.value).toBe('**~~~能打开~~~、能看懂**');
    expect(visibleToMarkdownOffset(r!.value, 0)).toBe(5);
    expect(markdownToVisibleOffset(r!.value, 5)).toBe(0);
  });

  test('加粗整段再叠斜体', () => {
    const r = toggleInlineMarkInText('**能打开**', 2, 5, 'italic');
    expect(r!.value).toBe('***能打开***');
    expect(visibleToMarkdownOffset(r!.value, 0)).toBe(3);
  });
});

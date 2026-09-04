/**
 * 表格单元格行内格式：可见偏移 ↔ Markdown 偏移
 */
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  visibleToMarkdownOffset,
  markdownToVisibleOffset,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/table-cell-content.js'
));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assist = require(path.join(__dirname, '../../../src/gui/renderer/editor-assist.js'));

describe('table cell inline format mapping', () => {
  test('plain 文本可见偏移与 Markdown 1:1', () => {
    const raw = 'hello';
    expect(visibleToMarkdownOffset(raw, 0)).toBe(0);
    expect(visibleToMarkdownOffset(raw, 5)).toBe(5);
    expect(markdownToVisibleOffset(raw, 2)).toBe(2);
  });

  test('加粗内容偏移跳过定界符', () => {
    const raw = '**ab**';
    expect(visibleToMarkdownOffset(raw, 0)).toBe(2);
    expect(visibleToMarkdownOffset(raw, 2)).toBe(4);
    expect(markdownToVisibleOffset(raw, 2)).toBe(0);
    expect(markdownToVisibleOffset(raw, 4)).toBe(2);
  });

  test('选区加粗后内层仍对应可见选区', () => {
    const md = 'hello world';
    const a = visibleToMarkdownOffset(md, 0);
    const b = visibleToMarkdownOffset(md, 5);
    const r = assist.toggleWrap(md, a, b, '**', '**');
    expect(r!.value).toBe('**hello** world');
    expect(r!.value.slice(r!.selectionStart, r!.selectionEnd)).toBe('hello');
    const visStart = markdownToVisibleOffset(r!.value, r!.selectionStart);
    const visEnd = markdownToVisibleOffset(r!.value, r!.selectionEnd);
    expect(visEnd - visStart).toBe(5);
    expect(visStart).toBe(0);
  });

  test('删除线映射（GFM）', () => {
    const raw = '~~xy~~';
    expect(visibleToMarkdownOffset(raw, 0)).toBe(2);
    expect(markdownToVisibleOffset(raw, 4)).toBe(2);
  });
});

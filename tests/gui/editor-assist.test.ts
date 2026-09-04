// @ts-nocheck
const assist = require('../../src/gui/renderer/editor-assist.js');
const { buildCodeFenceMask } = require('../../src/core/parser');

describe('editor-assist', () => {
  test('E33 wrapSelection bold with selection', () => {
    const r = assist.wrapSelection('hello world', 0, 5, '**', '**', 'text');
    expect(r!.value).toBe('**hello** world');
    expect(r!.selectionStart).toBe(2);
    expect(r!.selectionEnd).toBe(7);
  });

  test('E34 wrapSelection bold empty inserts placeholder', () => {
    const r = assist.wrapSelection('abc', 1, 1, '**', '**', 'text');
    expect(r!.value).toBe('a**text**bc');
    expect(r!.selectionStart).toBe(3);
    expect(r!.selectionEnd).toBe(7);
  });

  test('E35 toggleHeadingLevel up on plain line', () => {
    const text = 'Hello title';
    const r = assist.toggleHeadingLevel(text, 5, 1, null);
    expect(r!.value).toBe('# Hello title');
    expect(r!.selectionStart).toBe(5);
  });

  test('E36 toggleHeadingLevel down removes heading', () => {
    const text = '# Hello';
    const r = assist.toggleHeadingLevel(text, 0, -1, null);
    expect(r!.value).toBe('Hello');
  });

  test('E37 toggleHeadingLevel skips code fence', () => {
    const text = '```\n# not heading\n```';
    const mask = buildCodeFenceMask(text.split('\n'));
    const r = assist.toggleHeadingLevel(text, 5, 1, mask);
    expect(r).toBeNull();
  });

  test('E38 toggleLinePrefix unordered list', () => {
    const text = 'item one\nitem two';
    const r = assist.toggleLinePrefix(text, 0, text.length, '- ', null);
    expect(r!.value).toBe('- item one\n- item two');
  });

  test('E39 indentLines adds spaces', () => {
    const text = 'line1\nline2';
    const r = assist.indentLines(text, 0, text.length, 2, null);
    expect(r!.value).toBe('  line1\n  line2');
  });

  test('indentLines decrease strips leading spaces', () => {
    const r = assist.indentLines('  line1\n    line2', 0, 20, -2, null);
    expect(r!.value).toBe('line1\n  line2');
  });

  test('toggleWrap 空选区插入 ZWSP 而不插占位词', () => {
    const r = assist.toggleWrap('abc', 1, 1, '**', '**');
    expect(r!.value).toBe('a**\u200b**bc');
    expect(r!.selectionStart).toBe(3);
    expect(r!.selectionEnd).toBe(4);
  });

  test('toggleWrap 再点取消空定界符对（含 ZWSP）', () => {
    const r = assist.toggleWrap('a**\u200b**bc', 3, 3, '**', '**');
    expect(r!.value).toBe('abc');
    expect(r!.selectionStart).toBe(1);
  });

  test('toggleWrap 空白行加粗不是分割线', () => {
    const r = assist.toggleWrap('', 0, 0, '**', '**');
    expect(r!.value).toBe('**\u200b**');
    expect(/^\s*[*\-_]{3,}\s*$/.test(r!.value)).toBe(false);
  });

  test('toggleWrap 空白行斜体不是裸 **', () => {
    const r = assist.toggleWrap('', 0, 0, '*', '*');
    expect(r!.value).toBe('*\u200b*');
    expect(r!.value).not.toBe('**');
  });

  test('toggleWrap 选区已加粗则拆掉', () => {
    const r = assist.toggleWrap('**hello** world', 2, 7, '**', '**');
    expect(r!.value).toBe('hello world');
    expect(r!.selectionStart).toBe(0);
    expect(r!.selectionEnd).toBe(5);
  });

  test('toggleListType 互斥：无序切有序', () => {
    const r = assist.toggleListType('- a\n- b', 0, 7, 'ol', null);
    expect(r!.value).toBe('1. a\n1. b');
  });

  test('toggleListType 全是该类型则取消', () => {
    const r = assist.toggleListType('- a\n- b', 0, 7, 'ul', null);
    expect(r!.value).toBe('a\nb');
  });

  test('indentLines decrease strips list at column 0', () => {
    const r = assist.indentLines('- a\n- b', 0, 7, -2, null);
    expect(r!.value).toBe('a\nb');
  });

  test('clearFormats 选区去掉加粗和标题', () => {
    const text = '## **hello**';
    const r = assist.clearFormats(text, 0, text.length, null);
    expect(r!.value).toBe('hello');
  });

  test('clearFormats 空选不改已有文本', () => {
    expect(assist.clearFormats('## hello', 3, 3, null)).toBeNull();
    expect(assist.clearFormats('a****b', 3, 3, null)).toBeNull();
  });

  test('toggleUnderline 空选插入 ~ZWSP~', () => {
    const r = assist.toggleUnderline('abc', 1, 1);
    expect(r!.value).toBe('a~\u200b~bc');
    expect(r!.selectionStart).toBe(2);
    expect(r!.selectionEnd).toBe(3);
  });

  test('toggleUnderline 选区包裹与取消', () => {
    const wrapped = assist.toggleUnderline('hello', 0, 5);
    expect(wrapped!.value).toBe('~hello~');
    const unwrapped = assist.toggleUnderline(wrapped!.value, 0, wrapped!.value.length);
    expect(unwrapped!.value).toBe('hello');
  });

  test('toggleUnderline 不把 ~~删除线~~ 当成下划线拆掉', () => {
    const text = '~~strike~~';
    const r = assist.toggleUnderline(text, 0, text.length);
    expect(r!.value).toBe('~~~strike~~~');
  });

  test('applyOrToggleWrap 混合选区整段加粗', () => {
    const doc = '**ab** cd';
    const r = assist.applyOrToggleWrap(doc, 0, doc.length, '**', '**', false);
    expect(r!.value).toBe('**ab cd**');
  });

  test('applyOrToggleWrap 全选已加粗则取消', () => {
    const r = assist.applyOrToggleWrap('**hello**', 0, 9, '**', '**', true);
    expect(r!.value).toBe('hello');
  });

  test('applyOrToggleWrap 无选区返回 null', () => {
    expect(assist.applyOrToggleWrap('hello', 2, 2, '**', '**', false)).toBeNull();
  });

  test('toggleListType 空段落转为列表', () => {
    const r = assist.toggleListType('', 0, 0, 'ul', null);
    expect(r!.value).toBe('- ');
  });

  test('toggleListType 标题转为无序列表时保留标题', () => {
    const r = assist.toggleListType('# Title', 3, 3, 'ul', null);
    expect(r!.value).toBe('- # Title');
  });

  test('toggleListType 保留标题与行内加粗', () => {
    const r = assist.toggleListType('## **加粗**', 3, 3, 'ol', null);
    expect(r!.value).toBe('1. ## **加粗**');
  });

  test('toggleListType 取消列表后标题回来', () => {
    const r = assist.toggleListType('- ## Title', 5, 5, 'ul', null);
    expect(r!.value).toBe('## Title');
  });

  test('toggleListType 任务列表不能内嵌标题，降为正文', () => {
    const r = assist.toggleListType('## Title', 3, 3, 'task', null);
    expect(r!.value).toBe('- [ ] Title');
  });

  test('toggleListType 无序标题切任务列表也降为正文', () => {
    const r = assist.toggleListType('- ## Title', 5, 5, 'task', null);
    expect(r!.value).toBe('- [ ] Title');
  });

  test('setHeadingLevelRange 空段落设为标题', () => {
    const r = assist.setHeadingLevelRange('', 0, 0, 1, null);
    expect(r!.value).toBe('# ');
  });
});

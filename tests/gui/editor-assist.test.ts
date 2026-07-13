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
});

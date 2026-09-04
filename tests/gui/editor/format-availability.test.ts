// @ts-nocheck
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const {
  deriveFormatAvailability,
  isFormatCmdAvailable,
} = require('../../../src/gui/renderer/editor/state/format-availability');

function stateWith(doc, anchor, head) {
  return EditorState.create({
    doc: doc,
    selection: { anchor: anchor, head: head == null ? anchor : head },
    extensions: [markdown()],
  });
}

describe('format-availability 交互说明', () => {
  test('普通段落：加粗/斜体/列表均可用', () => {
    const st = stateWith('hello world', 0, 5);
    const a = deriveFormatAvailability(st);
    expect(isFormatCmdAvailable('bold', a)).toBe(true);
    expect(isFormatCmdAvailable('italic', a)).toBe(true);
    expect(isFormatCmdAvailable('ul', a)).toBe(true);
  });

  test('标题：加粗置灰，斜体/下划线/删除线可用', () => {
    const st = stateWith('# Title here', 2, 7);
    const a = deriveFormatAvailability(st);
    expect(a.inHeading).toBe(true);
    expect(isFormatCmdAvailable('bold', a)).toBe(false);
    expect(isFormatCmdAvailable('italic', a)).toBe(true);
    expect(isFormatCmdAvailable('underline', a)).toBe(true);
    expect(isFormatCmdAvailable('strike', a)).toBe(true);
    expect(isFormatCmdAvailable('ul', a)).toBe(true);
  });

  test('标题行末折叠光标：加粗置灰', () => {
    const doc = '# Title here';
    const st = stateWith(doc, doc.length, doc.length);
    const a = deriveFormatAvailability(st);
    expect(a.inHeading).toBe(true);
    expect(isFormatCmdAvailable('bold', a)).toBe(false);
    expect(isFormatCmdAvailable('italic', a)).toBe(true);
  });

  test('空白行不是「空格」特权：仍按普通上下文可用', () => {
    const st = stateWith('para\n\nnext', 5, 5);
    const a = deriveFormatAvailability(st);
    expect(isFormatCmdAvailable('bold', a)).toBe(true);
    expect(isFormatCmdAvailable('ul', a)).toBe(true);
  });

  test('列表行：字符格式仍可用（说明未要求置灰）', () => {
    const st = stateWith('- item', 2, 6);
    const a = deriveFormatAvailability(st);
    expect(isFormatCmdAvailable('bold', a)).toBe(true);
    expect(isFormatCmdAvailable('ul', a)).toBe(true);
  });

  test('围栏代码块内全部置灰', () => {
    const doc = '```\ncode\n```';
    const st = stateWith(doc, 4, 8);
    const a = deriveFormatAvailability(st);
    expect(a.mediaOrFence).toBe(true);
    expect(isFormatCmdAvailable('bold', a)).toBe(false);
    expect(isFormatCmdAvailable('italic', a)).toBe(false);
    expect(isFormatCmdAvailable('code', a)).toBe(false);
    expect(isFormatCmdAvailable('ul', a)).toBe(false);
  });

  test('混合列表类型：列表按钮仍可用（半激活由 toolbar state 负责）', () => {
    const st = stateWith('- a\n1. b', 0, 8);
    const a = deriveFormatAvailability(st);
    expect(isFormatCmdAvailable('ul', a)).toBe(true);
    expect(isFormatCmdAvailable('ol', a)).toBe(true);
  });

  test('标题行：无序/有序可用，任务列表置灰（GFM 无法内嵌标题）', () => {
    const st = stateWith('## Title', 4, 4);
    const a = deriveFormatAvailability(st);
    expect(isFormatCmdAvailable('ul', a)).toBe(true);
    expect(isFormatCmdAvailable('ol', a)).toBe(true);
    expect(isFormatCmdAvailable('task', a)).toBe(false);
  });

  test('列表项内标题：任务列表同样置灰', () => {
    const st = stateWith('- ## Title', 6, 6);
    const a = deriveFormatAvailability(st);
    expect(a.inHeading).toBe(true);
    expect(isFormatCmdAvailable('ul', a)).toBe(true);
    expect(isFormatCmdAvailable('task', a)).toBe(false);
  });

  test('普通列表项：任务列表可用', () => {
    const st = stateWith('- item', 3, 3);
    const a = deriveFormatAvailability(st);
    expect(isFormatCmdAvailable('task', a)).toBe(true);
  });
});

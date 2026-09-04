/**
 * 定界符感知的编辑操作：包裹/取消、删除、剪切粘贴、清除格式。
 * 判据统一为「预览可见文本里不得出现裸定界符」。
 */
import * as path from 'path';
import { EditorState, EditorSelection, ChangeSet } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const ops = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/inline-delimiter-ops.js'
));
const { createPendingInlineFormatExtension } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/pending-inline-format.js'
));
const {
  buildDecorationSpecs,
  collectSyntaxNodes,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/model/build-specs.js'));

function mdState(doc: string, from = 0, to = from) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(from, to),
    extensions: [markdown({ extensions: GFM }), ...createPendingInlineFormatExtension()],
  });
  ensureSyntaxTree(state, doc.length);
  return state;
}

function mockView(doc: string, from: number, to: number = from) {
  let s = mdState(doc, from, to);
  return {
    get state() {
      return s;
    },
    dispatch(...specs: Record<string, unknown>[]) {
      s = s.update(...(specs as never[])).state;
      ensureSyntaxTree(s, s.doc.length);
    },
    focus() {},
  };
}

/** 预览模式下实际可见的文本。 */
function visibleText(doc: string): string {
  const state = mdState(doc);
  const tree = ensureSyntaxTree(state, doc.length)!;
  const specs = buildDecorationSpecs(doc, collectSyntaxNodes(tree, doc), {});
  const hidden: { from: number; to: number }[] = [];
  for (const s of specs) {
    if (s.kind === 'hide-mark' || s.kind === 'hide-line') hidden.push({ from: s.from, to: s.to });
    if (s.kind === 'widget' && s.to > s.from) hidden.push({ from: s.from, to: s.to });
  }
  hidden.sort((a, b) => a.from - b.from);
  let out = '';
  let cur = 0;
  for (const h of hidden) {
    if (h.from > cur) out += doc.slice(cur, h.from);
    cur = Math.max(cur, h.to);
  }
  return out + doc.slice(cur);
}

function expectNoStrayDelimiter(doc: string) {
  expect(visibleText(doc)).not.toMatch(/[*~`]/);
}

describe('inline-delimiter-ops 定界符感知编辑', () => {
  test('E73 选区包裹与紧邻同类样式段融合', () => {
    const view = mockView('**加粗**尾巴', 4, 7);
    expect(ops.applyInlineMarkToSelection(view, 'bold')).toBe(true);
    const out = view.state.doc.toString();
    expect(out).toBe('**加粗尾**巴');
    expectNoStrayDelimiter(out);
  });

  test('E74 样式段内部分取消 → 拆分，两侧保留样式', () => {
    const view = mockView('**加粗文字**', 3, 5);
    expect(ops.applyInlineMarkToSelection(view, 'bold')).toBe(true);
    expect(view.state.doc.toString()).toBe('**加**粗文**字**');
    expectNoStrayDelimiter(view.state.doc.toString());
  });

  test('E75 跨行选区逐行包裹，空行不生成空定界符对', () => {
    const view = mockView('第一行\n\n第三行', 0, 8);
    ops.applyInlineMarkToSelection(view, 'bold');
    const out = view.state.doc.toString();
    expect(out).toBe('**第一行**\n\n**第三行**');
    expectNoStrayDelimiter(out);
  });

  test('E76 Backspace 跨过隐藏定界符删除可见字符', () => {
    // 光标在 `**粗**` 右侧（定界符之后），退格应删掉「粗」而不是定界符
    const view = mockView('AA**粗**BB', 7);
    expect(ops.handleInlineDelimiterBackspace(view)).toBe(true);
    const out = view.state.doc.toString();
    expect(out).toBe('AABB');
    expectNoStrayDelimiter(out);
  });

  test('E77 Delete 掏空样式段后整对定界符一并清除', () => {
    const view = mockView('AA**粗**BB', 2);
    expect(ops.handleInlineDelimiterDelete(view)).toBe(true);
    const out = view.state.doc.toString();
    expect(out).toBe('AABB');
    expectNoStrayDelimiter(out);
  });

  test('E78 剪切样式段内全部内容不留下裸定界符', () => {
    const view = mockView('**加粗**尾巴', 2, 4);
    ops.replaceRangeWithCleanup(view, 2, 4, '', 'delete.cut');
    const out = view.state.doc.toString();
    expect(out).toBe('尾巴');
    expectNoStrayDelimiter(out);
  });

  test('E79 粘贴替换样式段内容时保留该段样式', () => {
    const view = mockView('**加粗**尾巴', 2, 4);
    ops.replaceRangeWithCleanup(view, 2, 4, 'X', 'input.paste');
    const out = view.state.doc.toString();
    expect(out).toBe('**X**尾巴');
    expect(visibleText(out)).toBe('X尾巴');
  });

  test('E80 剪切端点落在定界符内部时自动外推', () => {
    const view = mockView('AA**BB**CC', 3, 9);
    ops.replaceRangeWithCleanup(view, 3, 9, '', 'delete.cut');
    const out = view.state.doc.toString();
    expect(out).toBe('AAC');
    expectNoStrayDelimiter(out);
  });

  test('E81 清除格式摘掉选区内全部标记', () => {
    const doc = 'AA**B**CC*D*EE';
    const state = mdState(doc, 0, doc.length);
    const plan = ops.planClearInlineMarks(state, 0, doc.length);
    const out = ChangeSet.of(plan.changes, doc.length).apply(state.doc).toString();
    expect(out).toBe('AABCCDEE');
  });

  test('E82 清除格式对部分选区做拆分而非整段清空', () => {
    const doc = 'AA**加粗文字**BB';
    const state = mdState(doc, 5, 7);
    const plan = ops.planClearInlineMarks(state, 5, 7);
    const out = ChangeSet.of(plan.changes, doc.length).apply(state.doc).toString();
    expect(out).toBe('AA**加**粗文**字**BB');
    expectNoStrayDelimiter(out);
  });

  test('E83 无行内标记时清除格式不产生变更', () => {
    const state = mdState('纯文本', 0, 3);
    expect(ops.planClearInlineMarks(state, 0, 3)).toBeNull();
  });
});

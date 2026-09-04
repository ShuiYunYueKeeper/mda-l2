import * as path from 'path';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const { applyInlineMarkToSelection } = require(path.join(
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

const LINE =
  '普通段落，含**加粗**、*斜体*、~~删除线~~、~下划线~，以及[链接](https://x.com)。';

function mdState(doc: string, from = 0, to = from) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(from, to),
    extensions: [markdown({ extensions: GFM }), ...createPendingInlineFormatExtension()],
  });
  ensureSyntaxTree(state, doc.length);
  return state;
}

function mockView(doc: string, from: number, to: number) {
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

/** 预览模式下实际可见的文本（去掉全部 hide-mark / widget 覆盖区）。 */
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

function wrap(doc: string, sel: string, mark: string) {
  const from = doc.indexOf(sel);
  expect(from).toBeGreaterThanOrEqual(0);
  const view = mockView(doc, from, from + sel.length);
  applyInlineMarkToSelection(view, mark);
  return view.state.doc.toString();
}

describe('format-commands 行内标记：混排选区走定界符融合', () => {
  test('E53 跨加粗/正文选区包裹后融合为单段，不残留定界符', () => {
    const out = wrap('**加粗**尾巴', '粗**尾', 'bold');
    expect(out).toBe('**加粗尾**巴');
    expect(visibleText(out)).toBe('加粗尾巴');
  });

  test('E54 跨两个不同标记的选区包裹后可见文本无裸定界符', () => {
    const out = wrap('**加粗**、*斜体*', '加粗**、*斜体', 'bold');
    expect(visibleText(out)).toBe('加粗、斜体');
    expect(visibleText(out)).not.toMatch(/[*~`]/);
  });

  test('E55 整行混排全选加粗只留一对外层定界符', () => {
    const out = wrap('AA**B**CC*D*EE', 'AA**B**CC*D*EE', 'bold');
    expect(out).toBe('**AABCC*D*EE**');
    expect(visibleText(out)).toBe('AABCCDEE');
  });

  test('E56 混排整行选区包裹后不破坏链接等结构', () => {
    const out = wrap(LINE, LINE, 'bold');
    expect(visibleText(out)).not.toMatch(/\*\*/);
    expect(out).toContain('[链接](https://x.com)');
  });

  test('E57 仅选中斜体词再次加斜体 = 取消，不留空定界符对', () => {
    const out = wrap(LINE, '斜体', 'italic');
    expect(out).toContain('、斜体、');
    expect(out).not.toContain('*斜体*');
    expect(visibleText(out)).not.toMatch(/[*~`]/);
  });

  test('E58 样式段内部分选区取消 → 拆分为两段，中间恢复正文', () => {
    const out = wrap('**加粗文字**', '粗文', 'bold');
    expect(out).toBe('**加**粗文**字**');
    expect(visibleText(out)).toBe('加粗文字');
  });

  test('E59 反复开关同一段回到原文', () => {
    let doc = 'AA文字BB';
    for (let i = 0; i < 4; i++) doc = wrap(doc, '文字', 'bold');
    expect(doc).toBe('AA文字BB');
  });
});

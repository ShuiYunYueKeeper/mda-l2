/**
 * 输入法组字上屏（compositionend）落在样式段头前 / 尾后时的定界符保护。
 *
 * 与键盘输入不同，IME 上屏时组字文本**已经**落在文档里，规划必须基于
 * 「摘掉组字污染区」的干净文档；否则合并区间会吞掉夹在中间的定界符。
 */
import * as path from 'path';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const {
  planCompositionEndReplace,
  createPendingInlineFormatExtension,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/pending-inline-format.js'
));
const { getInlineFlagsAtPos } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/inline-mark-context.js'
));
const {
  buildDecorationSpecs,
  collectSyntaxNodes,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/model/build-specs.js'));

function mdState(doc: string, pos = 0) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(pos),
    extensions: [markdown({ extensions: GFM }), ...createPendingInlineFormatExtension()],
  });
  ensureSyntaxTree(state, doc.length);
  return state;
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

/**
 * 模拟一次输入法上屏：光标停在 pos，组字期间 junk+data 已落入文档，
 * compositionend 时 data 位于光标左侧。
 */
function composeAt(doc: string, pos: number, data: string, junk = '') {
  const marks = getInlineFlagsAtPos(mdState(doc, pos), pos);
  const typed = junk + data;
  const polluted = doc.slice(0, pos) + typed + doc.slice(pos);
  const head = pos + typed.length;
  const state = mdState(polluted, head);
  const plan = planCompositionEndReplace(state, head, data, marks, pos);
  const out = plan ? polluted.slice(0, plan.from) + plan.insert + polluted.slice(plan.to) : polluted;
  return { plan, out, polluted };
}

const MARKS: [string, string][] = [
  ['加粗', '**'],
  ['斜体', '*'],
  ['下划线', '~'],
  ['删除线', '~~'],
  ['行内代码', '`'],
];

describe('IME 组字上屏的定界符保护', () => {
  describe.each(MARKS)('%s（%s）', (_name, delim) => {
    const doc = 'AA' + delim + '文字' + delim + 'BB';
    const contentFrom = 2 + delim.length;
    const contentTo = contentFrom + 2;
    const closeTo = contentTo + delim.length;

    test('E84 尾后上屏并入样式段，不吞掉闭定界符', () => {
      const r = composeAt(doc, closeTo, '测试');
      expect(r.out).toBe('AA' + delim + '文字测试' + delim + 'BB');
      expect(visibleText(r.out)).toBe('AA文字测试BB');
    });

    test('E85 头前上屏并入样式段，不多出一对定界符', () => {
      const r = composeAt(doc, 2, '测试');
      expect(r.out).toBe('AA' + delim + '测试文字' + delim + 'BB');
      expect(visibleText(r.out)).toBe('AA测试文字BB');
    });

    test('E86 段内上屏保持原样，不产生多余事务', () => {
      const r = composeAt(doc, contentFrom + 1, '测试');
      expect(r.plan).toBeNull();
      expect(r.out).toBe('AA' + delim + '文测试字' + delim + 'BB');
    });

    test('E87 尾后上屏带拼音残留时一并清除', () => {
      const r = composeAt(doc, closeTo, '测试', 'ceshi');
      expect(r.out).toBe('AA' + delim + '文字测试' + delim + 'BB');
      expect(r.out).not.toContain('ceshi');
    });
  });

  test('E88 混排行尾后上屏不波及后续样式段', () => {
    const doc = '含 **加粗**、*斜体*、~~删除线~~';
    const r = composeAt(doc, doc.indexOf('、'), '测试');
    expect(r.out).toBe('含 **加粗测试**、*斜体*、~~删除线~~');
    expect(visibleText(r.out)).toBe('含 加粗测试、斜体、删除线');
  });

  test('E89 关掉待输入格式后段内上屏：拆分样式段而非破坏定界符', () => {
    const doc = '含 **加粗**、*斜体*';
    const pos = doc.indexOf('加') + 1;
    const polluted = doc.slice(0, pos) + "ni'hao你好" + doc.slice(pos);
    const state = mdState(polluted, pos + "ni'hao你好".length);
    const plan = planCompositionEndReplace(
      state,
      pos + "ni'hao你好".length,
      '你好',
      { bold: false, italic: false, underline: false, strike: false, code: false },
      pos
    );
    expect(plan).not.toBeNull();
    const out = polluted.slice(0, plan.from) + plan.insert + polluted.slice(plan.to);
    expect(out).toBe('含 **加**你好**粗**、*斜体*');
    expect(visibleText(out)).toBe('含 加你好粗、斜体');
  });
});

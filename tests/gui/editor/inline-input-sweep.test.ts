/**
 * 行内输入全面回归：五类标记 × 各落点 × 待输入延续/取消 × 键盘/输入法。
 *
 * 判据统一为「预览可见文本里不得出现裸定界符，且输入的字符不得丢失」。
 * 走的是完整链路（落点规划 + 清理派发），能捕获「规划正确但被清理毁掉」这类组合缺陷。
 */
import * as path from 'path';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const pending = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/pending-inline-format.js'
));
const ops = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/inline-delimiter-ops.js'
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
    extensions: [markdown({ extensions: GFM }), ...pending.createPendingInlineFormatExtension()],
  });
  ensureSyntaxTree(state, doc.length);
  return state;
}

function mockView(doc: string, pos: number) {
  let s = mdState(doc, pos);
  return {
    composing: false,
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

/** 键盘输入：字符还没进文档，落点直接在原文档上算。 */
function typeKey(doc: string, pos: number, text: string, marks: Record<string, boolean>) {
  const view = mockView(doc, pos);
  const spec = pending.buildPendingTypedInsert(view.state, pos, pos, text, marks);
  if (!spec) return doc;
  ops.dispatchTypedInsertWithCleanup(
    view,
    { from: spec.from, to: spec.to, insert: spec.insert },
    spec.cursor,
    []
  );
  return view.state.doc.toString();
}

/** 输入法上屏：组字文本已经落在光标处，须先摘掉污染区再规划。 */
function typeIme(doc: string, pos: number, text: string, marks: Record<string, boolean>) {
  const polluted = doc.slice(0, pos) + text + doc.slice(pos);
  const head = pos + text.length;
  const view = mockView(polluted, head);
  const plan = pending.planCompositionEndReplace(view.state, head, text, marks, pos);
  if (!plan) return polluted;
  ops.dispatchTypedInsertWithCleanup(
    view,
    { from: plan.from, to: plan.to, insert: plan.insert },
    plan.cursor,
    []
  );
  return view.state.doc.toString();
}

/**
 * 真实中文输入法：组字阶段落进文档的是**拼音字母**，上屏时 CM6 以「用汉字替换掉那段拼音」
 * 的形式走 inputHandler —— compositionend 时文档里还是拼音，planCompositionEndReplace
 * 必然被拒，实际规划落在替换路径上。用最终汉字当组字文本会完全绕开这条路径。
 */
function typeImePinyin(doc: string, pos: number, text: string, marks: Record<string, boolean>) {
  const junk = "ce'shi";
  const polluted = doc.slice(0, pos) + junk + doc.slice(pos);
  const to = pos + junk.length;
  const view = mockView(polluted, to);
  // 放行时 CM6 原生把 [pos, to) 换成 text，等价于在干净文档的 pos 处插入
  const basis = view.state.update({ changes: { from: pos, to: to, insert: '' } }).state;
  if (pending.canPassThroughPendingInput(basis, pos, marks)) {
    return doc.slice(0, pos) + text + doc.slice(pos);
  }
  const plan = pending.planTypedReplace(view.state, pos, to, text, marks);
  if (!plan) return polluted;
  ops.dispatchTypedInsertWithCleanup(
    view,
    { from: plan.from, to: plan.to, insert: plan.insert },
    plan.cursor,
    []
  );
  return view.state.doc.toString();
}

const MODES: [string, typeof typeKey][] = [
  ['键盘', typeKey],
  ['IME', typeIme],
  ['IME拼音', typeImePinyin],
];

const MARKS: [string, string, string][] = [
  ['加粗', 'bold', '**'],
  ['斜体', 'italic', '*'],
  ['下划线', 'underline', '~'],
  ['删除线', 'strike', '~~'],
  ['行内代码', 'code', '`'],
];

const ALL_OFF = { bold: false, italic: false, underline: false, strike: false, code: false };

const LINE =
  '普通段落。含 **加粗**、*斜体*、~~删除线~~、~下划线~、`行内代码`，以及[链接](https://x.com)。';

const SEGMENTS: [string, string][] = [
  ['加粗', '**加粗**'],
  ['斜体', '*斜体*'],
  ['删除线', '~~删除线~~'],
  ['下划线', '~下划线~'],
  ['行内代码', '`行内代码`'],
];

describe('行内输入全面回归', () => {
  test('E90 五类标记 × 五个落点 × 待输入延续/取消 × 键盘/IME', () => {
    const bad: string[] = [];
    for (const [name, key, delim] of MARKS) {
      const doc = 'AA' + delim + '文字' + delim + 'BB';
      const contentFrom = 2 + delim.length;
      const spots: [string, number][] = [
        ['头外', 2],
        ['开符后', contentFrom],
        ['内部', contentFrom + 1],
        ['闭符前', contentFrom + 2],
        ['尾外', contentFrom + 2 + delim.length],
      ];
      for (const [zone, pos] of spots) {
        for (const keep of [true, false]) {
          const marks = Object.assign({}, ALL_OFF) as Record<string, boolean>;
          if (keep) marks[key] = true;
          for (const [mode, fn] of MODES) {
            for (const text of ['测试', 'ab']) {
              const out = fn(doc, pos, text, marks);
              const vis = visibleText(out);
              if (/[*~`]/.test(vis) || vis.indexOf(text) < 0) {
                bad.push(
                  `${name}/${zone}/${keep ? '延续' : '取消'}/${mode}/${text} -> ${out} | vis=${vis}`
                );
              }
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('E91 混排行各样式段头尾插入不波及其他样式段', () => {
    const bad: string[] = [];
    for (const [name, seg] of SEGMENTS) {
      const head = LINE.indexOf(seg);
      for (const [zone, pos] of [
        ['头外', head],
        ['尾外', head + seg.length],
      ] as [string, number][]) {
        const marks = getInlineFlagsAtPos(mdState(LINE, pos), pos);
        for (const [mode, fn] of MODES) {
          const out = fn(LINE, pos, '测试', marks);
          const vis = visibleText(out);
          const others = SEGMENTS.filter((s) => s[1] !== seg).map((s) => s[1]);
          const damaged = others.filter((o) => out.indexOf(o) < 0);
          if (/[*~`]/.test(vis) || vis.indexOf('测试') < 0 || damaged.length) {
            bad.push(`${name}/${zone}/${mode} -> ${out} | vis=${vis} | 波及=${damaged.join(',')}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('E92 同一位置连续输入 5 次不累积定界符残留', () => {
    for (const [, seg] of SEGMENTS) {
      for (const [mode, fn] of MODES) {
        let doc = LINE;
        let pos = LINE.indexOf(seg) + seg.length;
        for (let i = 0; i < 5; i++) {
          const marks = getInlineFlagsAtPos(mdState(doc, pos), pos);
          doc = fn(doc, pos, '测', marks);
          expect(`${mode}:${visibleText(doc)}`).not.toMatch(/[*~`]/);
          pos = doc.indexOf('测'.repeat(i + 1)) + i + 1;
        }
        // 5 个字符全部进入同一个样式段
        expect(doc).toContain('测测测测测');
      }
    }
  });

  test('E93 键盘与输入法在相同落点产生相同结果', () => {
    for (const [, seg] of SEGMENTS) {
      const head = LINE.indexOf(seg);
      for (const pos of [head, head + seg.length]) {
        const marks = getInlineFlagsAtPos(mdState(LINE, pos), pos);
        const expected = typeKey(LINE, pos, '测试', marks);
        expect(typeIme(LINE, pos, '测试', marks)).toBe(expected);
        expect(typeImePinyin(LINE, pos, '测试', marks)).toBe(expected);
      }
    }
  });
});

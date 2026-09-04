import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

const {
  createPendingInlineFormatExtension,
  togglePendingInlineMark,
  getPending,
  buildPendingTypedInsert,
  planCompositionEndReplace,
  emptyMarks,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/pending-inline-format.js'
));
const { getInlineFlagsAtPos } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/inline-mark-context.js'
));

const LINE =
  '普通段落，含**加粗**、*斜体*、~~删除线~~、~下划线~，以及[链接](https://x.com)。';

function stateAt(doc: string, pos: number) {
  return EditorState.create({
    doc,
    selection: { anchor: pos },
    extensions: [markdown(), ...createPendingInlineFormatExtension()],
  });
}

function mockView(state: EditorState) {
  let s = state;
  return {
    get state() {
      return s;
    },
    dispatch(spec: Record<string, unknown>) {
      s = s.update(spec as never).state;
    },
    focus() {},
  };
}

function applyInsert(state: EditorState, text: string, marks: Record<string, boolean>) {
  const pos = state.selection.main.head;
  const spec = buildPendingTypedInsert(state, pos, pos, text, marks);
  if (!spec) return { state, spec: null as null };
  const deleteFrom = spec.from;
  const deleteTo = spec.to;
  const next = state.update({
    changes: {
      from: deleteFrom,
      to: deleteTo,
      insert: spec.insert,
    },
    selection: { anchor: spec.cursor, head: spec.cursor },
  }).state;
  return { state: next, spec };
}

describe('mixed-inline-format 混排样式', () => {
  test('加粗中间取消后输入，再斜体中间取消后输入：不丢后续样式段', () => {
    const boldMid = LINE.indexOf('加') + 1;
    let state = stateAt(LINE, boldMid);
    const boldFlags = getInlineFlagsAtPos(state, boldMid);
    const boldOff = { ...emptyMarks(), ...boldFlags, bold: false };
    let r = applyInsert(state, '1', boldOff);
    state = r.state;
    expect(state.doc.toString()).toContain('**加**1**粗**');
    expect(state.doc.toString()).toContain('*斜体*');
    expect(state.doc.toString()).toContain('~~删除线~~');

    const doc2 = state.doc.toString();
    const italicMid = doc2.indexOf('斜') + 1;
    state = stateAt(doc2, italicMid);
    const italicFlags = getInlineFlagsAtPos(state, italicMid);
    expect(italicFlags.italic).toBe(true);
    expect(italicFlags.bold).toBe(false);

    const italicOff = { ...emptyMarks(), ...italicFlags, italic: false };
    r = applyInsert(state, '2', italicOff);
    state = r.state;
    const out = state.doc.toString();
    expect(out).toContain('*斜*2*体*');
    expect(out).toContain('~~删除线~~');
    expect(out).toContain('~下划线~');
    expect(out).toContain('[链接]');
  });

  test('连续切换待输入格式不改文档', () => {
    const italicMid = LINE.indexOf('斜') + 1;
    let state = stateAt(LINE, italicMid);
    const view = mockView(state);
    const before = view.state.doc.toString();

    togglePendingInlineMark(view, 'bold');
    state = view.state;
    state = state.update({ selection: { anchor: italicMid } }).state;
    view.dispatch({ selection: { anchor: italicMid } });

    togglePendingInlineMark(view, 'italic');
    expect(view.state.doc.toString()).toBe(before);
  });

  test('加粗尾部分延续样式：中间插入不需改写', () => {
    const doc = '**加粗**、*斜体*';
    const tail = doc.indexOf('粗') + 1;
    const state = stateAt(doc, tail);
    const flags = getInlineFlagsAtPos(state, tail);
    expect(flags.bold).toBe(true);
    const spec = buildPendingTypedInsert(state, tail, tail, '测', {
      ...emptyMarks(),
      ...flags,
    });
    expect(spec.insert).toBe('测');
    expect(spec.from).toBe(tail);
  });

  test('混排尾部分 IME：不波及后续斜体段', () => {
    const doc = '**加粗*ceshi测试**、*斜体*';
    const anchor = doc.indexOf('ceshi');
    const head = doc.indexOf('试') + 1;
    const marks = {
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    };
    const state = stateAt(doc, head);
    const plan = planCompositionEndReplace(state, head, '测试', marks, anchor);
    expect(plan).not.toBeNull();
    const next = state
      .update({
        changes: { from: plan!.from, to: plan!.to, insert: plan!.insert },
      })
      .state;
    expect(next.doc.toString()).toContain('*斜体*');
    expect(next.doc.toString()).toContain('测试');
  });

  test('加粗中间取消后 IME 提交：不污染后续斜体', () => {
    const doc = '含 **加粗**、*斜体*、~~删除线~~';
    const anchor = doc.indexOf('加') + 1;
    const junk = "ni'hao你好";
    const polluted = doc.slice(0, anchor) + junk + doc.slice(anchor);
    const head = anchor + junk.length;
    const marks = {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    };
    const state = stateAt(polluted, head);
    const plan = planCompositionEndReplace(state, head, '你好', marks, anchor);
    expect(plan).not.toBeNull();
    const next = state
      .update({
        changes: { from: plan!.from, to: plan!.to, insert: plan!.insert },
      })
      .state;
    const out = next.doc.toString();
    expect(out).toContain('**加**你好**粗**');
    expect(out).toContain('*斜体*');
    expect(out).not.toContain("ni'hao");
    expect(out).not.toMatch(/斜体.*你好.*你好/);
  });

  test('IME 锚点在标点但组字未跨段：不污染斜体', () => {
    const line = '~普通段落~。含 **加粗**、*斜体*';
    const wrongAnchor = line.indexOf('。');
    const junk = "ni'hao你好";
    const polluted = line.slice(0, wrongAnchor) + junk + line.slice(wrongAnchor);
    const head = wrongAnchor + junk.length;
    const marks = {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    };
    const state = stateAt(polluted, head);
    const plan = planCompositionEndReplace(state, head, '你好', marks, wrongAnchor);
    expect(plan).not.toBeNull();
    const out = state
      .update({
        changes: { from: plan!.from, to: plan!.to, insert: plan!.insert },
      })
      .state.doc.toString();
    expect(out).toContain('*斜体*');
    expect(out).not.toMatch(/斜.*你好.*\*\*体/);
  });
});

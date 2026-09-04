import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

const {
  getInlineFlagsAtPos,
  planMarkInsert,
  planPendingMarkToggle,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/state/inline-mark-context.js'));
const {
  buildPendingTypedInsert,
  createPendingInlineFormatExtension,
  togglePendingInlineMark,
  getPending,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/pending-inline-format.js'
));

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

describe('inline-mark-context 头/中/尾', () => {
  test('加粗：头/中/尾均识别为 bold', () => {
    const doc = '**ab**';
    const head = doc.indexOf('*');
    const mid = doc.indexOf('a') + 1;
    const tail = doc.lastIndexOf('*');
    expect(getInlineFlagsAtPos(stateAt(doc, head), head).bold).toBe(true);
    expect(getInlineFlagsAtPos(stateAt(doc, mid), mid).bold).toBe(true);
    expect(getInlineFlagsAtPos(stateAt(doc, tail), tail).bold).toBe(true);
  });

  test('下划线：头/中/尾均识别', () => {
    const doc = '~ab~';
    const head = 0;
    const mid = 2;
    const tail = doc.length - 1;
    expect(getInlineFlagsAtPos(stateAt(doc, head), head).underline).toBe(true);
    expect(getInlineFlagsAtPos(stateAt(doc, mid), mid).underline).toBe(true);
    expect(getInlineFlagsAtPos(stateAt(doc, tail), tail).underline).toBe(true);
  });

  test('延续加粗：开定界符内落点插入到正文首', () => {
    const doc = '**ab**';
    const head = doc.indexOf('*');
    const open = head + 1;
    const plan = planMarkInsert(stateAt(doc, open), open, 'bold', true);
    expect(plan.insertAt).toBe(head + 2);
    expect(plan.split).toBe(false);
  });

  test('延续加粗：头外并入内容首', () => {
    const doc = '**ab**';
    const head = doc.indexOf('*');
    const plan = planMarkInsert(stateAt(doc, head), head, 'bold', true);
    expect(plan.insertAt).toBe(head + 2);
    expect(plan.split).toBe(false);
  });

  test('延续加粗：尾外并入内容末', () => {
    const doc = '**ab**';
    const outside = doc.length;
    const plan = planMarkInsert(stateAt(doc, outside), outside, 'bold', true);
    expect(plan.insertAt).toBe(outside - 2);
    expect(plan.split).toBe(false);
  });

  test('退出加粗：行末落点插到闭定界符之后', () => {
    const doc = '**ab**';
    const tail = doc.lastIndexOf('*');
    const plan = planMarkInsert(stateAt(doc, tail), tail, 'bold', false);
    expect(plan.insertAt).toBe(doc.length);
    expect(plan.split).toBe(false);
  });

  test('退出加粗：中间插入应分裂标记', () => {
    const doc = '**ab**';
    const mid = doc.indexOf('a') + 1;
    const plan = planMarkInsert(stateAt(doc, mid), mid, 'bold', false);
    expect(plan.split).toBe(true);
  });

  test('头/中/尾延续加粗输入不改已有文字', () => {
    const doc = '**ab**';
    const open = doc.indexOf('*') + 1;
    const spec = buildPendingTypedInsert(stateAt(doc, open), open, open, 'X', {
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    });
    expect(spec.insert).toBe('X');
    expect(spec.from).toBe(open + 1);
  });

  test('行末取消加粗后输入不包进加粗', () => {
    const doc = '**ab**';
    const tail = doc.lastIndexOf('*');
    const spec = buildPendingTypedInsert(stateAt(doc, tail), tail, tail, 'X', {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    });
    expect(spec.insert).toBe('X');
    expect(spec.from).toBe(doc.length);
  });

  test('中间取消加粗后分裂且不改两侧样式', () => {
    const doc = '**ab**';
    const mid = doc.indexOf('a') + 1;
    const spec = buildPendingTypedInsert(stateAt(doc, mid), mid, mid, 'X', {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    });
    expect(spec.insert).toBe('**X**');
    expect(spec.from).toBe(mid);
  });
});

describe('planPendingMarkToggle 加粗头/中/尾', () => {
  const doc = '**加粗**';
  const head = doc.indexOf('*');
  const insideStart = doc.indexOf('加');
  const mid = doc.indexOf('加') + 1;
  const insideEnd = doc.indexOf('粗') + 1;
  const tail = doc.length;

  test('1）头：关闭待输入 / 进入 / 退出', () => {
    let state = stateAt(doc, head);
    let plan = planPendingMarkToggle(state, head, 'bold', { armed: true, marks: { bold: true } });
    expect(plan.cursor).toBe(head);
    expect(plan.marks.bold).toBe(false);

    plan = planPendingMarkToggle(state, head, 'bold', { armed: true, marks: plan.marks });
    expect(plan.cursor).toBe(insideStart);
    expect(plan.marks.bold).toBe(true);

    // 内容首与「开定界符外侧」在屏幕上是同一个点，所以这一下要一次完成「退出并取消」，
    // 不能只挪光标（那样用户看到的是「点了没反应」，得点两次）
    plan = planPendingMarkToggle(state, insideStart, 'bold', { armed: true, marks: plan.marks });
    expect(plan.cursor).toBe(head);
    expect(plan.marks.bold).toBe(false);
  });

  test('2）中：取消/再选待输入加粗', () => {
    let state = stateAt(doc, mid);
    let plan = planPendingMarkToggle(state, mid, 'bold', { armed: true, marks: { bold: true } });
    expect(plan.cursor).toBe(mid);
    expect(plan.marks.bold).toBe(false);

    plan = planPendingMarkToggle(state, mid, 'bold', { armed: true, marks: plan.marks });
    expect(plan.cursor).toBe(mid);
    expect(plan.marks.bold).toBe(true);

    const spec = buildPendingTypedInsert(state, mid, mid, '测', {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    });
    expect(spec.insert).toBe('**测**');
    expect(state.doc.toString()).toBe(doc);
  });

  test('3）分裂后再次选中：以后续粗段为准进入', () => {
    const split = '**加**测试**粗**';
    const pos = split.indexOf('**', split.indexOf('测试'));
    const state = stateAt(split, pos);
    const plan = planPendingMarkToggle(state, pos, 'bold', {
      armed: true,
      marks: { bold: false },
    });
    const roughStart = split.indexOf('粗');
    expect(plan.cursor).toBe(roughStart);
    expect(plan.marks.bold).toBe(true);
  });

  test('4）尾：一次点击即退出并取消，再点回到内容内', () => {
    let state = stateAt(doc, insideEnd);
    let plan = planPendingMarkToggle(state, insideEnd, 'bold', { armed: true, marks: { bold: true } });
    expect(plan.cursor).toBe(tail);
    expect(plan.marks.bold).toBe(false);

    plan = planPendingMarkToggle(state, tail, 'bold', { armed: true, marks: plan.marks });
    expect(plan.cursor).toBe(insideEnd);
    expect(plan.marks.bold).toBe(true);

    plan = planPendingMarkToggle(state, insideEnd, 'bold', { armed: true, marks: plan.marks });
    expect(plan.cursor).toBe(tail);
    expect(plan.marks.bold).toBe(false);
  });

  test('togglePendingInlineMark 集成：头外可关 pending，再进内容区', () => {
    let state = stateAt(doc, head);
    const view = mockView(state);
    togglePendingInlineMark(view, 'bold');
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(head);
    expect(getPending(view.state).marks.bold).toBe(false);

    togglePendingInlineMark(view, 'bold');
    expect(view.state.selection.main.head).toBe(insideStart);
    expect(getPending(view.state).marks.bold).toBe(true);

    togglePendingInlineMark(view, 'bold');
    expect(view.state.selection.main.head).toBe(head);
    expect(getPending(view.state).marks.bold).toBe(false);
  });
});

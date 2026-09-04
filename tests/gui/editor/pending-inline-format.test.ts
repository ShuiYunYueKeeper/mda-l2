import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';

const {
  createPendingInlineFormatExtension,
  togglePendingInlineMark,
  clearPendingInlineFormat,
  getPending,
  hasPendingInputFormat,
  overlayPendingInlineState,
  buildPendingTypedInsert,
  needsPendingInputTransform,
  planCompositionEndReplace,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/pending-inline-format.js'
));
const { getInlineToolbarState } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/block-format.js'
));

function stateAt(doc: string, pos: number, extra: unknown[] = []) {
  return EditorState.create({
    doc,
    selection: { anchor: pos },
    extensions: [markdown({ extensions: GFM }), createPendingInlineFormatExtension()].concat(extra),
  });
}

describe('pending-inline-format 交互说明', () => {
  test('无选区切换加粗不改文档', () => {
    let state = stateAt('hello', 5);
    const view = {
      state,
      dispatch: function (spec: Record<string, unknown>) {
        state = state.update(spec as never).state;
        (this as { state: EditorState }).state = state;
      },
      focus: function () {},
    };
    togglePendingInlineMark(view, 'bold');
    expect(state.doc.toString()).toBe('hello');
    const pending = getPending(state);
    expect(pending.armed).toBe(true);
    expect(pending.marks.bold).toBe(true);
  });

  test('待输入加粗时输入文字包上 **', () => {
    const state = stateAt('hello', 5);
    const spec = buildPendingTypedInsert(state, 5, 5, 'x', {
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    });
    expect(spec.insert).toBe('**x**');
    expect(state.doc.toString()).toBe('hello');
    expect(spec.cursor).toBe(8);
  });

  test('光标移入加粗区域自动武装待输入格式', () => {
    const doc = 'x **ab**';
    const mid = doc.indexOf('a');
    let state = stateAt(doc, 0);
    state = state
      .update({
        selection: { anchor: mid },
      })
      .state;
    const pending = getPending(state);
    expect(pending.armed).toBe(true);
    expect(pending.marks.bold).toBe(true);
  });

  test('取消样式后光标微移仍保留待输入覆盖', () => {
    const doc = '*斜体*';
    const mid = doc.indexOf('斜') + 1;
    let state = stateAt(doc, mid);
    const view = {
      state,
      dispatch: function (spec: Record<string, unknown>) {
        state = state.update(spec as never).state;
        (this as { state: EditorState }).state = state;
      },
      focus: function () {},
    };
    togglePendingInlineMark(view, 'italic');
    expect(getPending(state).marks.italic).toBe(false);
    state = state
      .update({
        selection: { anchor: mid + 1 },
      })
      .state;
    expect(getPending(state).marks.italic).toBe(false);
    expect(getPending(state).armed).toBe(true);
  });

  test('取消样式后跨样式区移动：重置为新区样式', () => {
    const doc = '*斜体* **加粗**';
    const italicMid = doc.indexOf('斜') + 1;
    const boldMid = doc.indexOf('加') + 1;
    let state = stateAt(doc, italicMid);
    const view = {
      state,
      dispatch: function (spec: Record<string, unknown>) {
        state = state.update(spec as never).state;
        (this as { state: EditorState }).state = state;
      },
      focus: function () {},
    };
    togglePendingInlineMark(view, 'italic');
    expect(getPending(state).marks.italic).toBe(false);
    state = state
      .update({
        selection: { anchor: boldMid },
      })
      .state;
    expect(getPending(state).marks.bold).toBe(true);
    expect(getPending(state).marks.italic).toBe(false);
  });

  test('overlay 无选区显示待输入格式', () => {
    let state = stateAt('plain', 0);
    const view = {
      state,
      dispatch: function (spec: Record<string, unknown>) {
        state = state.update(spec as never).state;
        (this as { state: EditorState }).state = state;
      },
      focus: function () {},
    };
    togglePendingInlineMark(view, 'italic');
    const over = overlayPendingInlineState(state, getInlineToolbarState(state));
    expect(over.italic.on).toBe(true);
    expect(over.bold.on).toBe(false);
  });

  test('清除格式无选区只清待输入、不改文本', () => {
    let state = stateAt('## Title', 3);
    const view = {
      state,
      dispatch: function (spec: Record<string, unknown>) {
        state = state.update(spec as never).state;
        (this as { state: EditorState }).state = state;
      },
      focus: function () {},
    };
    togglePendingInlineMark(view, 'italic');
    expect(hasPendingInputFormat(state)).toBe(true);
    clearPendingInlineFormat(view);
    expect(state.doc.toString()).toBe('## Title');
    expect(getPending(state).marks.italic).toBe(false);
  });

  test('光标在加粗中视为有待输入格式', () => {
    const doc = '**ab**';
    const state = stateAt(doc, 3);
    expect(hasPendingInputFormat(state)).toBe(true);
  });

  test('纯正文无选区无待输入格式', () => {
    const state = stateAt('hello', 2);
    expect(hasPendingInputFormat(state)).toBe(false);
  });

  test('样式正文中间：不需待输入层改写（便于 IME）', () => {
    const doc = '**ab**';
    const mid = doc.indexOf('a') + 1;
    const state = stateAt(doc, mid);
    expect(
      needsPendingInputTransform(state, mid, {
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        code: false,
      })
    ).toBe(false);
  });

  test('样式行首延续加粗：开定界符内需插入内容区', () => {
    const doc = '**ab**';
    const head = doc.indexOf('*');
    const state = stateAt(doc, head);
    expect(
      needsPendingInputTransform(state, head, {
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        code: false,
      })
    ).toBe(true);
  });

  test('样式行尾延续加粗：内容末尾不拦截（便于 IME）', () => {
    const doc = '**ab**';
    const tail = doc.indexOf('b') + 1;
    const state = stateAt(doc, tail);
    expect(
      needsPendingInputTransform(state, tail, {
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        code: false,
      })
    ).toBe(false);
  });

  test('样式行尾延续加粗：闭定界符字符内需改写', () => {
    const doc = '**ab**';
    const inClose = doc.lastIndexOf('*');
    const state = stateAt(doc, inClose);
    expect(
      needsPendingInputTransform(state, inClose, {
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        code: false,
      })
    ).toBe(true);
  });

  test('样式中间取消加粗：需待输入层分裂', () => {
    const doc = '**ab**';
    const mid = doc.indexOf('a') + 1;
    const state = stateAt(doc, mid);
    expect(
      needsPendingInputTransform(state, mid, {
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        code: false,
      })
    ).toBe(true);
  });

  test('加粗尾部 IME 提交：保留闭定界符', () => {
    const doc = '普通段落，含**加粗**、*斜体*';
    const tail = doc.indexOf('粗') + 1;
    const junk = "ni'hao";
    const polluted = doc.slice(0, tail) + junk + '你好' + doc.slice(tail);
    const head = tail + junk.length + '你好'.length;
    const marks = {
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    };
    const state = stateAt(polluted, head);
    const plan = planCompositionEndReplace(state, head, '你好', marks, tail);
    if (plan) {
      const next = state
        .update({
          changes: { from: plan.from, to: plan.to, insert: plan.insert },
        })
        .state;
      expect(next.doc.toString()).toContain('**加粗你好**');
      expect(next.doc.toString()).toContain('*斜体*');
    } else {
      const stripped = state
        .update({
          changes: { from: tail, to: head, insert: '你好' },
        })
        .state;
      expect(stripped.doc.toString()).toContain('**加粗你好**');
    }
  });

  test('斜体尾部 IME：预览落点后提交保留闭定界符', () => {
    const line = '~普通段落~。含 **加粗**、*斜体*、~~删除线~~';
    const { adjustCaretForHiddenMarks } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/caret-syntax-adjust.js'
    ));
    const { ensureSyntaxTree } = require('@codemirror/language');
    let state = stateAt(line, 0);
    ensureSyntaxTree(state, line.length);
    const closeStar = line.indexOf('*斜体*') + '斜体'.length + 1;
    const pos = adjustCaretForHiddenMarks(state, closeStar);
    const polluted = line.slice(0, pos) + "ni'hao你好" + line.slice(pos);
    const head = pos + "ni'hao".length + '你好'.length;
    state = stateAt(polluted, head);
    ensureSyntaxTree(state, polluted.length);
    const marks = {
      bold: false,
      italic: true,
      underline: false,
      strike: false,
      code: false,
    };
    const plan = planCompositionEndReplace(state, head, '你好', marks, pos);
    const next = plan
      ? state
          .update({
            changes: { from: plan.from, to: plan.to, insert: plan.insert },
          })
          .state
      : state
          .update({
            changes: { from: pos, to: head, insert: '你好' },
          })
          .state;
    expect(next.doc.toString()).toMatch(/\*斜体你好\*/);
  });

  test('样式尾部已正确写入：compositionend 不二次改写', () => {
    const doc = '**ab你好**';
    const head = doc.indexOf('好') + 1;
    const marks = {
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    };
    const state = stateAt(doc, head);
    expect(planCompositionEndReplace(state, head, '你好', marks)).toBeNull();
  });

  test('样式尾部 IME：清除拼音残留', () => {
    const doc = '**abnihao你好**';
    const anchor = doc.indexOf('nihao');
    const head = doc.indexOf('好') + 1;
    const marks = {
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    };
    const state = stateAt(doc, head);
    const plan = planCompositionEndReplace(state, head, '你好', marks, anchor);
    expect(plan).not.toBeNull();
    const next = state
      .update({
        changes: { from: plan!.from, to: plan!.to, insert: plan!.insert },
      })
      .state;
    expect(next.doc.toString()).toBe('**ab你好**');
  });

  test('E84 自动武装的 pending 不跨光标移动串到别的标记', () => {
    // 上一处编辑在行内代码里自动武装了 code；撤销不改选区所以 pending 没被清。
    // 之后把光标挪进下划线段落时，若继续沿用旧覆盖态，输入就会插出 ` 而不是 ~。
    const doc = '~下划线~、`行内代码`';
    const codePos = doc.indexOf('行内代码') + 2;
    let state = stateAt(doc, codePos);
    // 模拟一次自动武装：光标停在行内代码里，选区移动 → armed{code}
    state = state.update({ selection: { anchor: codePos + 1 } }).state;
    expect(getPending(state).marks.code).toBe(true);
    expect(getPending(state).explicit).toBeFalsy();

    const underlinePos = doc.indexOf('下划线') + 2;
    state = state.update({ selection: { anchor: underlinePos } }).state;
    const pending = getPending(state);
    expect(pending.marks.code).toBe(false);
    expect(pending.marks.underline).toBe(true);
  });

  test('E85 工具栏显式切换的覆盖态才跨光标移动保留', () => {
    const doc = '**加粗**和**另一段**';
    let state = stateAt(doc, 3);
    const view = {
      state,
      dispatch: function (spec: Record<string, unknown>) {
        state = state.update(spec as never).state;
        (this as { state: EditorState }).state = state;
      },
      focus: function () {},
    };
    togglePendingInlineMark(view, 'italic');
    expect(getPending(state).explicit).toBe(true);
    // 移到另一段同为加粗的上下文：显式覆盖态（italic）保留
    state = state.update({ selection: { anchor: doc.indexOf('另一段') + 1 } }).state;
    expect(getPending(state).marks.italic).toBe(true);
    expect(getPending(state).marks.bold).toBe(true);
  });

  test('顿号紧贴开定界符：取消后连续输入仍为纯文本（repairUnrenderableSplit）', () => {
    const doc = '含 ~下划线~**、加粗**、*斜体*。';
    const pos = doc.indexOf('加');
    const off = {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    };
    let state = stateAt(doc, pos);
    const spec1 = buildPendingTypedInsert(state, pos, pos, '测试', off);
    expect(spec1).not.toBeNull();
    const next1 = doc.slice(0, spec1!.from) + spec1!.insert + doc.slice(spec1!.to);
    expect(next1).toBe('含 ~下划线~、测试**加粗**、*斜体*。');

    const pos2 = next1.indexOf('测试') + '测试'.length;
    state = stateAt(next1, pos2);
    const spec2 = buildPendingTypedInsert(state, pos2, pos2, '你好', off);
    expect(spec2).not.toBeNull();
    const next2 = next1.slice(0, spec2!.from) + spec2!.insert + next1.slice(spec2!.to);
    expect(next2).toBe('含 ~下划线~、测试你好**加粗**、*斜体*。');
    expect(next2).not.toMatch(/\*\*\*\*/);
  });
});

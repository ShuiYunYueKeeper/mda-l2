import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const {
  classifyMarkZone,
  canPassThroughPendingInput,
  resolveMarkRegion,
  planMarkInsert,
  planPendingMarkToggle,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/state/inline-mark-context.js'));
const { adjustCaretForHiddenMarks } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/caret-syntax-adjust.js'
));
const {
  buildPendingTypedInsert,
  planCompositionEndReplace,
  emptyMarks,
  createPendingInlineFormatExtension,
  togglePendingInlineMark,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/pending-inline-format.js'
));

const SAMPLE =
  '~普通段落~。含 **加粗**、*斜体*、~~删除线~~、`行内代码`，以及 [链接](https://x.com)。';

function mdState(doc: string, pos = 0) {
  const state = EditorState.create({
    doc,
    selection: { anchor: pos },
    extensions: [markdown({ extensions: GFM }), ...createPendingInlineFormatExtension()],
  });
  ensureSyntaxTree(state, doc.length);
  return state;
}

function marks(over: Record<string, boolean>) {
  return { ...emptyMarks(), ...over };
}

describe('inline-edit-zones 头/中/尾统一判定', () => {
  test('加粗：区域划分', () => {
    const doc = '**加粗**';
    const state = mdState(doc);
    const region = resolveMarkRegion(state, 2, 'bold')!;
    expect(classifyMarkZone(region, 0)).toBe('head-out');
    expect(classifyMarkZone(region, 1)).toBe('open');
    expect(classifyMarkZone(region, 2)).toBe('inside');
    expect(classifyMarkZone(region, 4)).toBe('inside');
    expect(classifyMarkZone(region, 5)).toBe('close');
    expect(classifyMarkZone(region, 6)).toBe('tail-out');
  });

  test('内容区 inside 延续：不拦截', () => {
    const doc = '**加粗**';
    const mid = doc.indexOf('加') + 1;
    const state = mdState(doc, mid);
    expect(canPassThroughPendingInput(state, mid, marks({ bold: true }))).toBe(true);
  });

  test('头外/尾外/中间取消：需拦截', () => {
    const doc = '**加粗**';
    const state = mdState(doc);
    const region = resolveMarkRegion(state, 2, 'bold')!;
    expect(canPassThroughPendingInput(state, region.leading.from, marks({ bold: true }))).toBe(
      false
    );
    expect(canPassThroughPendingInput(state, region.trailing.to, marks({ bold: true }))).toBe(
      false
    );
    const mid = doc.indexOf('加') + 1;
    expect(canPassThroughPendingInput(state, mid, marks({ bold: false }))).toBe(false);
  });

  test('头外延续：并入内容首，无双定界符', () => {
    const doc = '**加粗**';
    const state = mdState(doc);
    const region = resolveMarkRegion(state, 0, 'bold')!;
    const spec = buildPendingTypedInsert(state, region.leading.from, region.leading.from, '你好', marks({
      bold: true,
    }));
    expect(spec.insert).toBe('你好');
    expect(spec.from).toBe(region.content.from);
    const out = doc.slice(0, spec.from) + spec.insert + doc.slice(spec.from);
    expect(out).toBe('**你好加粗**');
  });

  test('尾外延续：并入内容末，无双定界符', () => {
    const doc = '~~删除线~~';
    const state = mdState(doc);
    const inner = doc.indexOf('删');
    const region = resolveMarkRegion(state, inner, 'strike')!;
    const spec = buildPendingTypedInsert(state, region.trailing.to, region.trailing.to, '你好', marks({
      strike: true,
    }));
    expect(spec.insert).toBe('你好');
    expect(spec.from).toBe(region.content.to);
    const out = doc.slice(0, spec.from) + spec.insert + doc.slice(spec.from);
    expect(out).toBe('~~删除线你好~~');
  });

  test('头外取消样式：插在开定界符前为纯文本', () => {
    const doc = '**加粗**';
    const state = mdState(doc);
    const region = resolveMarkRegion(state, 0, 'bold')!;
    const spec = buildPendingTypedInsert(state, region.leading.from, region.leading.from, '你好', marks({
      bold: false,
    }));
    expect(spec.insert).toBe('你好');
    expect(spec.from).toBe(region.leading.from);
    const out = doc.slice(0, spec.from) + spec.insert + doc.slice(spec.from);
    expect(out).toBe('你好**加粗**');
  });

  test('尾外取消样式：插在闭定界符后为纯文本', () => {
    const doc = '~~删除线~~';
    const state = mdState(doc);
    const inner = doc.indexOf('删');
    const region = resolveMarkRegion(state, inner, 'strike')!;
    const spec = buildPendingTypedInsert(state, region.trailing.to, region.trailing.to, '你好', marks({
      strike: false,
    }));
    expect(spec.insert).toBe('你好');
    expect(spec.from).toBe(region.trailing.to);
    const out = doc.slice(0, spec.from) + spec.insert + doc.slice(spec.from);
    expect(out).toBe('~~删除线~~你好');
  });

  test('混排行：样式段头前纯文本区并入，无双定界符', () => {
    const line = '~普通段落~。含 **加粗**、*斜体*、~~删除线~~';
    const state = mdState(line);
    const boldLead = line.indexOf('**加粗**');
    const specBold = buildPendingTypedInsert(state, boldLead, boldLead, '你好', marks({ bold: true }));
    const outBold = line.slice(0, specBold.from) + specBold.insert + line.slice(specBold.from);
    expect(outBold).toContain('**你好加粗**');
    expect(outBold).not.toContain('****');

    const italicLead = line.indexOf('*斜体*');
    const specItalic = buildPendingTypedInsert(state, italicLead, italicLead, '你好', marks({
      italic: true,
    }));
    const outItalic = line.slice(0, specItalic.from) + specItalic.insert + line.slice(specItalic.from);
    expect(outItalic).toContain('*你好斜体*');
    expect(outItalic).not.toMatch(/\*你好\*\*\*/);
  });

  test('混排行斜体尾：预览落点 + IME 保留闭定界符', () => {
    const state = mdState(SAMPLE);
    const italic = SAMPLE.indexOf('*斜体*');
    const closeStar = italic + '斜体'.length + 1;
    const pos = adjustCaretForHiddenMarks(state, closeStar);
    const polluted = SAMPLE.slice(0, pos) + "ni'hao你好" + SAMPLE.slice(pos);
    const head = pos + "ni'hao".length + '你好'.length;
    const st2 = mdState(polluted, head);
    const plan = planCompositionEndReplace(st2, head, '你好', marks({ italic: true }), pos);
    expect(plan).not.toBeNull();
    const out = polluted.slice(0, plan!.from) + plan!.insert + polluted.slice(plan!.to);
    expect(out).toMatch(/\*斜体你好\*/);
    expect(out).toContain('**加粗**');
    expect(out).toContain('~~删除线~~');
  });

  test('toggle 头尾：头外可关闭待输入格式', () => {
    const doc = '**加粗**';
    let state = mdState(doc, 0);
    const view = {
      get state() {
        return state;
      },
      dispatch(spec: Record<string, unknown>) {
        state = state.update(spec as never).state;
      },
      focus() {},
    };
    const inside = doc.indexOf('加');
    togglePendingInlineMark(view, 'bold');
    expect(view.state.selection.main.head).toBe(0);
    let pending = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/state/pending-inline-format.js'
    )).getPending(view.state);
    expect(pending.marks.bold).toBe(false);

    togglePendingInlineMark(view, 'bold');
    expect(view.state.selection.main.head).toBe(inside);
    pending = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/state/pending-inline-format.js'
    )).getPending(view.state);
    expect(pending.marks.bold).toBe(true);

    // 内容首那一下要一次完成「退出并取消」，于是整体是干净的两态循环：
    // 外侧/关 → 内容内/开 → 外侧/关 → 内容内/开
    togglePendingInlineMark(view, 'bold');
    expect(view.state.selection.main.head).toBe(0);
    pending = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/state/pending-inline-format.js'
    )).getPending(view.state);
    expect(pending.marks.bold).toBe(false);

    togglePendingInlineMark(view, 'bold');
    expect(view.state.selection.main.head).toBe(inside);
    pending = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/state/pending-inline-format.js'
    )).getPending(view.state);
    expect(pending.marks.bold).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });

  test('planMarkInsert：开定界符内延续落到内容首', () => {
    const doc = '**ab**';
    const open = doc.indexOf('*') + 1;
    const state = mdState(doc);
    const plan = planMarkInsert(state, open, 'bold', true);
    expect(plan.insertAt).toBe(open + 1);
  });
});

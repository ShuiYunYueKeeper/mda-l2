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

  /** 解析器眼里 [a,b) 是否整段落在某个该标记的样式段内 */
  function markCovers(doc: string, mark: string, a: number, b: number) {
    const { collectMarkRegions } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/state/inline-mark-context.js'
    ));
    return collectMarkRegions(mdState(doc), mark).some(
      (r: { content: { from: number; to: number } }) => r.content.from <= a && r.content.to >= b
    );
  }

  function toggleSel(doc: string, sel: string, mark: string) {
    const i = doc.indexOf(sel);
    const view = mockView(doc, i, i + sel.length);
    ops.applyInlineMarkToSelection(view, mark);
    return view;
  }

  function selectedText(view: { state: { doc: { sliceString: (a: number, b: number) => string }; selection: { main: { from: number; to: number } } } }) {
    const { from, to } = view.state.selection.main;
    return view.state.doc.sliceString(from, to);
  }

  // flanking：定界符邻接中文标点时，`**、x**` 这类串每对都配对却无法渲染
  const FLANKING_MARKS: [string, string][] = [
    ['bold', '**'],
    ['italic', '*'],
    ['strike', '~~'],
  ];

  test('E119 样式段首部分取消，残段以标点开头时定界符让到标点之后', () => {
    for (const [mark, d] of FLANKING_MARKS) {
      const doc = `需要：${d}能打开、能看懂${d}。`;
      const view = toggleSel(doc, '能打开', mark);
      const out = view.state.doc.toString();
      expect(`${mark}:${out}`).toBe(`${mark}:需要：能打开、${d}能看懂${d}。`);
      expectNoStrayDelimiter(out);
      expect(selectedText(view)).toBe('能打开');
      // 再点加粗：隔着顿号融回原段，选区仍钉在「能打开」
      ops.applyInlineMarkToSelection(view, mark);
      expect(`${mark}:${view.state.doc.toString()}`).toBe(`${mark}:${doc}`);
      expect(selectedText(view)).toBe('能打开');
    }
  });

  test('E120 样式段尾/中部分取消，切口两侧标点不致外层重配对', () => {
    for (const [mark, d] of FLANKING_MARKS) {
      const tail = toggleSel(`${d}能打开、能看懂${d}`, '能看懂', mark).state.doc.toString();
      expect(`${mark}:${tail}`).toBe(`${mark}:${d}能打开${d}、能看懂`);
      expectNoStrayDelimiter(tail);

      const mid = toggleSel(`${d}甲、乙、丙${d}`, '乙', mark).state.doc.toString();
      expect(`${mark}:${mid}`).toBe(`${mark}:${d}甲${d}、乙、${d}丙${d}`);
      expect(markCovers(mid, mark, mid.indexOf('乙'), mid.indexOf('乙') + 1)).toBe(false);
    }
  });

  test('E121 选区首尾为标点/空白时包裹不含该标点', () => {
    for (const [mark, d] of FLANKING_MARKS) {
      const hd = toggleSel('能打开、能看懂', '、能看懂', mark).state.doc.toString();
      expect(`${mark}:${hd}`).toBe(`${mark}:能打开、${d}能看懂${d}`);
      const tl = toggleSel('能打开、能看懂', '能打开、', mark).state.doc.toString();
      expect(`${mark}:${tl}`).toBe(`${mark}:${d}能打开${d}、能看懂`);
      const sp = toggleSel('say hello world', ' hello ', mark).state.doc.toString();
      expect(`${mark}:${sp}`).toBe(`${mark}:say ${d}hello${d} world`);
      // 只选夹在文字间的标点：CommonMark 下无法成立，宁可不改也不写出裸定界符
      const only = toggleSel('能打开、能看懂', '、', mark).state.doc.toString();
      expect(`${mark}:${only}`).toBe(`${mark}:能打开、能看懂`);
    }
  });

  test('E122 下划线与行内代码不受 flanking 约束，保持原样切分', () => {
    expect(toggleSel('~能打开、能看懂~', '能打开', 'underline').state.doc.toString()).toBe(
      '能打开~、能看懂~'
    );
    expect(toggleSel('`能打开、能看懂`', '能打开', 'code').state.doc.toString()).toBe(
      '能打开`、能看懂`'
    );
  });

  const README_TAIL = '能打开、能看懂、能改几句、能批注、能导出，并能交给 Agent';
  const README_SPAN = `**${README_TAIL}**`;
  const README_LINE = `生成式 AI 普及后，Markdown 已成为人机协作的「通用中介语言」。办公套件往往把 \`.md\` 转成私有格式，专业编辑器又偏重；用户真正需要的是：${README_SPAN}。`;

  test('E123 选「能打开」取消加粗，切口让过顿号，不得留下 能打开**、', () => {
    const view = toggleSel(README_SPAN, '能打开', 'bold');
    const out = view.state.doc.toString();
    expect(out).not.toBe('能打开**、能看懂、能改几句、能批注、能导出，并能交给 Agent**');
    expect(out).toBe('能打开、**能看懂、能改几句、能批注、能导出，并能交给 Agent**');
    expect(selectedText(view)).toBe('能打开');
    expectNoStrayDelimiter(out);
    ops.applyInlineMarkToSelection(view, 'bold');
    expect(view.state.doc.toString()).toBe(README_SPAN);
    expect(selectedText(view)).toBe('能打开');
  });

  test('E123b README 整句选「能打开」取消加粗，不破坏其余界定符', () => {
    const view = toggleSel(README_LINE, '能打开', 'bold');
    const out = view.state.doc.toString();
    expect(out).toBe(README_LINE.replace(`**${README_TAIL}**`, `能打开、**${README_TAIL.slice(4)}**`));
    expectNoStrayDelimiter(out);
    expect(visibleText(out).replace(/`.md`/g, '.md')).toBe(
      visibleText(README_LINE).replace(/`.md`/g, '.md')
    );
  });

  test('E124 套叠残留 + 选区含开定界符时仍按可见文本取消', () => {
    const doc = `用户真正需要的是：****能打开**、**能看懂**、能改几句、能批注、能导出，并能交给 Agent**。`;
    const i = doc.indexOf('能打开');
    // hide-mark 校准会把可见左缘推到内层开定界符左侧
    const view = mockView(doc, i - 2, i + 3);
    ops.applyInlineMarkToSelection(view, 'bold');
    const out = view.state.doc.toString();
    expect(out).toBe(
      '用户真正需要的是：能打开、**能看懂、能改几句、能批注、能导出，并能交给 Agent**。'
    );
    expectNoStrayDelimiter(out);
  });

  test('E125 斜体/删除线与 README 同构句同样让位；下划线/行内代码保持原切分', () => {
    const body = '能打开、能看懂、能改几句';
    for (const [mark, d] of FLANKING_MARKS) {
      const doc = `需要：${d}${body}${d}。`;
      const out = toggleSel(doc, '能打开', mark).state.doc.toString();
      expect(`${mark}:${out}`).toBe(`${mark}:需要：能打开、${d}能看懂、能改几句${d}。`);
      expectNoStrayDelimiter(out);
    }
    expect(toggleSel(`需要：~${body}~。`, '能打开', 'underline').state.doc.toString()).toBe(
      '需要：能打开~、能看懂、能改几句~。'
    );
    expect(toggleSel(`需要：\`${body}\`。`, '能打开', 'code').state.doc.toString()).toBe(
      '需要：能打开`、能看懂、能改几句`。'
    );
  });

  test('E126 取消再加粗：选区钉在用户选中的文字，文档隔着顿号融回', () => {
    const orig = `是：${README_SPAN}`;
    const unboldOpen = '是：能打开、**能看懂、能改几句、能批注、能导出，并能交给 Agent**';

    const a = toggleSel(orig, '能打开', 'bold');
    expect(a.state.doc.toString()).toBe(unboldOpen);
    expect(selectedText(a)).toBe('能打开');
    ops.applyInlineMarkToSelection(a, 'bold');
    expect(a.state.doc.toString()).toBe(orig);
    expect(selectedText(a)).toBe('能打开');

    const b = toggleSel(orig, '能打开、', 'bold');
    expect(b.state.doc.toString()).toBe(unboldOpen);
    expect(selectedText(b)).toBe('能打开、');
    ops.applyInlineMarkToSelection(b, 'bold');
    expect(b.state.doc.toString()).toBe(orig);
    expect(selectedText(b)).toBe('能打开、');

    const c = toggleSel(orig, '、能看懂', 'bold');
    expect(c.state.doc.toString()).toBe(
      '是：**能打开**、能看懂、**能改几句、能批注、能导出，并能交给 Agent**'
    );
    expect(selectedText(c)).toBe('、能看懂');
    ops.applyInlineMarkToSelection(c, 'bold');
    expect(c.state.doc.toString()).toBe(orig);
    expect(selectedText(c)).toBe('、能看懂');

    const from = orig.indexOf('是：');
    const to = orig.indexOf('能打开') + 3;
    const d = mockView(orig, from, to);
    ops.applyInlineMarkToSelection(d, 'bold');
    expect(d.state.doc.toString()).toBe(`**是：${README_TAIL}**`);
    expect(selectedText(d)).toBe('是：能打开');
  });

  test('E127 同一段同时下划线+删除线：叠套为 ~~~，可见正文无泄漏', () => {
    const v = mockView('测试文字', 0, 4);
    expect(ops.applyInlineMarkToSelection(v, 'underline')).toBe(true);
    expect(v.state.doc.toString()).toBe('~测试文字~');
    expectNoStrayDelimiter(v.state.doc.toString());

    const doc = v.state.doc.toString();
    const from = doc.indexOf('测');
    const to = doc.indexOf('字') + 1;
    const v2 = mockView(doc, from, to);
    expect(ops.applyInlineMarkToSelection(v2, 'strike')).toBe(true);
    expect(v2.state.doc.toString()).toBe('~~~测试文字~~~');
    expect(visibleText(v2.state.doc.toString())).toBe('测试文字');
    expectNoStrayDelimiter(v2.state.doc.toString());

    const doc2 = v2.state.doc.toString();
    const f2 = doc2.indexOf('测');
    const t2 = doc2.indexOf('字') + 1;
    const v3 = mockView(doc2, f2, t2);
    expect(ops.applyInlineMarkToSelection(v3, 'underline')).toBe(true);
    expect(v3.state.doc.toString()).toBe('~~测试文字~~');
    expectNoStrayDelimiter(v3.state.doc.toString());

    const v4 = mockView('测试文字', 0, 4);
    ops.applyInlineMarkToSelection(v4, 'strike');
    const d4 = v4.state.doc.toString();
    const v5 = mockView(d4, d4.indexOf('测'), d4.indexOf('字') + 1);
    ops.applyInlineMarkToSelection(v5, 'underline');
    expect(v5.state.doc.toString()).toBe('~~~测试文字~~~');
    expectNoStrayDelimiter(v5.state.doc.toString());
  });

  test('E128 已加粗段再叠加下划线与删除线，外层加粗不泄漏', () => {
    const v = mockView('**测试文字**', 2, 6);
    expect(ops.applyInlineMarkToSelection(v, 'underline')).toBe(true);
    expect(v.state.doc.toString()).toBe('**~测试文字~**');
    expectNoStrayDelimiter(v.state.doc.toString());

    const d = v.state.doc.toString();
    const v2 = mockView(d, d.indexOf('测'), d.indexOf('字') + 1);
    expect(ops.applyInlineMarkToSelection(v2, 'strike')).toBe(true);
    expect(v2.state.doc.toString()).toBe('**~~~测试文字~~~**');
    expect(visibleText(v2.state.doc.toString())).toBe('测试文字');
    expectNoStrayDelimiter(v2.state.doc.toString());
  });
});

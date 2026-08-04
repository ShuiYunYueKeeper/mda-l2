/**
 * M8-B：buildDecorationSpecs / reveal 纯函数（E49–E52 雏形）
 */
import * as path from 'path';

// 渲染层 JS 模型（无 DOM）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildDecorationSpecs } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/build-specs.js'
));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeRevealRanges, isRevealed, mergeOverlaps } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/reveal.js'
));

describe('buildDecorationSpecs (M8-B S1–S5)', () => {
  test('E49: 非显露标题隐藏 # 与空格，正文加样式', () => {
    const text = '# Hello';
    const nodes = [{ type: 'ATXHeading1', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes, []);
    const hides = specs.filter((s: { kind: string }) => s.kind === 'hide-mark');
    const styles = specs.filter((s: { kind: string }) => s.kind === 'style');
    expect(hides).toEqual([{ kind: 'hide-mark', from: 0, to: 2, priority: expect.any(Number) }]);
    expect(styles[0]).toMatchObject({ kind: 'style', from: 2, to: text.length, cls: 'mda-cm-h1' });
  });

  test('E50: 显露块内不 hide-mark，仅 style', () => {
    const text = '**bold**';
    const nodes = [{ type: 'StrongEmphasis', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes, [{ from: 0, to: text.length }], {
      fullHide: false,
    });
    expect(specs.every((s: { kind: string }) => s.kind !== 'hide-mark')).toBe(true);
    expect(specs.some((s: { kind: string; cls?: string }) => s.kind === 'style' && s.cls === 'mda-cm-strong')).toBe(
      true
    );
  });

  test('D15 fullHide: 显露区间仍隐藏语法标记', () => {
    const text = '**bold**';
    const nodes = [{ type: 'StrongEmphasis', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes, [{ from: 0, to: text.length }], {
      fullHide: true,
    });
    expect(specs.some((s: { kind: string }) => s.kind === 'hide-mark')).toBe(true);
  });

  test('D15 fullHide: 图片 widget 不因显露退回源码（image 阶段）', () => {
    const text = '![x](a.png)';
    const nodes = [{ type: 'Image', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes, [{ from: 0, to: text.length }], {
      fullHide: true,
      widgetEnabled: function (kind: string) {
        return kind === 'image';
      },
    });
    expect(specs.some((s: { kind: string; widget?: string }) => s.widget === 'image')).toBe(true);
    expect(specs.some((s: { kind: string }) => s.kind === 'hide-mark')).toBe(true);
  });

  test('text 阶段：图片不生成块 widget spec', () => {
    const text = '![x](a.png)';
    const nodes = [{ type: 'Image', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes, [], {
      fullHide: true,
      widgetEnabled: function () {
        return false;
      },
    });
    expect(specs.some((s: { widget?: string }) => s.widget === 'image')).toBe(false);
  });

  test('math 阶段：行内公式整段 widget（atomic 删除，不拆 hide $）', () => {
    const text = '见 $E=mc^2$ 式';
    const specs = buildDecorationSpecs(text, [], [], {
      fullHide: true,
      widgetEnabled: function (kind: string) {
        return kind === 'math-inline';
      },
    });
    const math = specs.find((s: { widget?: string }) => s.widget === 'math-inline');
    expect(math).toMatchObject({ from: 2, to: 10, widget: 'math-inline' });
    expect(text.slice(math.from, math.to)).toBe('$E=mc^2$');
  });

  test('code 阶段：公式 widget 关闭', () => {
    const text = '$x$';
    const specs = buildDecorationSpecs(text, [], [], {
      fullHide: true,
      widgetEnabled: function (kind: string) {
        return kind !== 'math-inline' && kind !== 'math-block';
      },
    });
    expect(specs.some((s: { widget?: string }) => s.widget === 'math-inline')).toBe(false);
  });

  test('E51: 斜体 / 删除线 / 行内代码标记区间', () => {
    const cases: Array<{ type: string; text: string; markLens: [number, number] }> = [
      { type: 'Emphasis', text: '*x*', markLens: [1, 1] },
      { type: 'Strikethrough', text: '~~x~~', markLens: [2, 2] },
      { type: 'InlineCode', text: '`code`', markLens: [1, 1] },
    ];
    for (const c of cases) {
      const nodes = [{ type: c.type, from: 0, to: c.text.length }];
      const specs = buildDecorationSpecs(c.text, nodes, []);
      const hides = specs.filter((s: { kind: string }) => s.kind === 'hide-mark');
      expect(hides).toHaveLength(2);
      expect(hides[0].to - hides[0].from).toBe(c.markLens[0]);
      expect(hides[1].to - hides[1].from).toBe(c.markLens[1]);
    }
  });

  test('E52: 不修改输入文本（specs 不携带改写）', () => {
    const text = '## Title with **bold**';
    const nodes = [
      { type: 'ATXHeading2', from: 0, to: text.length },
      { type: 'StrongEmphasis', from: text.indexOf('**'), to: text.length },
    ];
    const before = text;
    buildDecorationSpecs(text, nodes, []);
    expect(text).toBe(before);
  });
});

describe('buildDecorationSpecs (M8-B S6–S12)', () => {
  test('S6: 链接隐藏标记并带 href', () => {
    const text = '[t](https://a.com)';
    const nodes = [{ type: 'Link', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes, []);
    expect(specs.some((s: { kind: string }) => s.kind === 'hide-mark')).toBe(true);
    const style = specs.find((s: { kind: string; cls?: string }) => s.kind === 'style' && s.cls === 'mda-cm-link');
    expect(style).toMatchObject({ from: 1, to: 2, href: 'https://a.com' });
  });

  test('S8: 无序列表标记 → bullet widget', () => {
    const text = '- item';
    const nodes = [{ type: 'ListMark', from: 0, to: 1, listKind: 'bullet' }];
    const specs = buildDecorationSpecs(text, nodes, []);
    expect(specs).toEqual([
      expect.objectContaining({ kind: 'widget', widget: 'bullet', from: 0, to: 2 }),
    ]);
  });

  test('S9: 有序列表标记不装饰', () => {
    const text = '1. item';
    const nodes = [{ type: 'ListMark', from: 0, to: 2, listKind: 'ordered' }];
    expect(buildDecorationSpecs(text, nodes, [])).toEqual([]);
  });

  test('S10: 任务标记 → checkbox widget；聚焦时不生成', () => {
    const text = '[x]';
    const nodes = [{ type: 'TaskMarker', from: 0, to: 3 }];
    const specs = buildDecorationSpecs(text, nodes, []);
    expect(specs[0]).toMatchObject({ kind: 'widget', widget: 'task', checked: true });
    expect(buildDecorationSpecs(text, nodes, [{ from: 0, to: 3 }])).toEqual([]);
  });

  test('S11/S12: 引用标记隐藏；分隔线 widget', () => {
    const q = buildDecorationSpecs('> a', [{ type: 'QuoteMark', from: 0, to: 1 }], []);
    expect(q.some((s: { kind: string }) => s.kind === 'hide-mark')).toBe(true);
    expect(q.some((s: { kind: string; cls?: string }) => s.kind === 'line-style')).toBe(true);

    const hr = buildDecorationSpecs('---', [{ type: 'HorizontalRule', from: 0, to: 3 }], []);
    expect(hr[0]).toMatchObject({ kind: 'widget', widget: 'hr' });
  });

  test('引用块：左上角手柄 widget；标题不加', () => {
    const quote = buildDecorationSpecs(
      '> hello',
      [
        { type: 'Blockquote', from: 0, to: 7 },
        { type: 'QuoteMark', from: 0, to: 1 },
      ],
      []
    );
    expect(quote.some((s: any) => s.widget === 'quote-handle' && s.quoteKind === 'quote')).toBe(
      true
    );
    expect(quote.some((s: any) => s.kind === 'line-style' && s.cls === 'mda-cm-blockquote-line')).toBe(
      true
    );

    // 含 [!NOTE] 的引用按普通引用处理（暂不做高亮块）
    const noteText = '> [!NOTE]\n> tip';
    const note = buildDecorationSpecs(
      noteText,
      [
        { type: 'Blockquote', from: 0, to: noteText.length },
        { type: 'QuoteMark', from: 0, to: 1 },
        { type: 'QuoteMark', from: 10, to: 11 },
      ],
      []
    );
    expect(note.some((s: any) => s.widget === 'quote-handle' && s.quoteKind === 'quote')).toBe(
      true
    );
    expect(note.some((s: any) => s.cls === 'mda-cm-highlight-line')).toBe(false);
    expect(note.some((s: any) => s.kind === 'line-style' && s.cls === 'mda-cm-blockquote-line')).toBe(
      true
    );

    const emptyQuote = buildDecorationSpecs(
      '> ',
      [
        { type: 'Blockquote', from: 0, to: 2 },
        { type: 'QuoteMark', from: 0, to: 1 },
      ],
      []
    );
    // 空引用保留行末空格，不整行 atomic
    expect(
      emptyQuote.some((s: any) => s.kind === 'hide-mark' && s.from === 1 && s.to === 2)
    ).toBe(false);

    const heading = buildDecorationSpecs('# Title', [{ type: 'ATXHeading1', from: 0, to: 7 }], []);
    expect(heading.some((s: any) => s.widget === 'quote-handle')).toBe(false);
  });
});

describe('computeRevealRanges', () => {
  test('composing 时返回 lastRevealRanges', () => {
    const last = [{ from: 0, to: 10 }];
    const got = computeRevealRanges({
      docLength: 20,
      selectionRanges: [{ from: 5, to: 5, head: 5 }],
      granularity: 'block',
      composing: true,
      lastRevealRanges: last,
      enclosingBlock: () => ({ from: 0, to: 20 }),
    });
    expect(got).toBe(last);
  });

  test('never 返回空', () => {
    const got = computeRevealRanges({
      docLength: 20,
      selectionRanges: [{ from: 5, to: 5, head: 5 }],
      granularity: 'never',
      enclosingBlock: () => ({ from: 0, to: 20 }),
    });
    expect(got).toEqual([]);
  });

  test('mergeOverlaps 合并相交区间', () => {
    expect(mergeOverlaps([{ from: 0, to: 5 }, { from: 3, to: 8 }, { from: 10, to: 12 }])).toEqual([
      { from: 0, to: 8 },
      { from: 10, to: 12 },
    ]);
  });

  test('nearby 显露光标上下各一行', () => {
    const got = computeRevealRanges({
      docLength: 100,
      selectionRanges: [{ from: 15, to: 15, head: 15 }],
      granularity: 'nearby',
      enclosingBlock: () => ({ from: 0, to: 100 }),
      lineRangeAround: (pos: number, pad: number) => ({
        from: Math.max(0, pos - pad * 5),
        to: Math.min(100, pos + pad * 5),
      }),
    });
    expect(got).toEqual([{ from: 10, to: 20 }]);
  });

  test('isRevealed 交集判定', () => {
    expect(isRevealed({ from: 2, to: 4 }, [{ from: 0, to: 3 }])).toBe(true);
    expect(isRevealed({ from: 5, to: 7 }, [{ from: 0, to: 3 }])).toBe(false);
  });
});

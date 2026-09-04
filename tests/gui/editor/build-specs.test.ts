/**
 * M8-B：buildDecorationSpecs 纯函数（E49–E52 雏形）
 */
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildDecorationSpecs, collectSyntaxNodes } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/build-specs.js'
));
const { parser } = require('@lezer/markdown');

describe('buildDecorationSpecs (M8-B S1–S5)', () => {
  test('E49: 标题隐藏 # 与空格，正文加样式', () => {
    const text = '# Hello';
    const nodes = [{ type: 'ATXHeading1', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes);
    const hides = specs.filter((s: { kind: string }) => s.kind === 'hide-mark');
    const styles = specs.filter((s: { kind: string }) => s.kind === 'style');
    expect(hides).toEqual([{ kind: 'hide-mark', from: 0, to: 2, priority: expect.any(Number) }]);
    expect(styles[0]).toMatchObject({ kind: 'style', from: 2, to: text.length, cls: 'mda-cm-h1' });
  });

  test('空标题行仍应用 mda-cm-hN-line 行高', () => {
    const text = '# \n';
    const nodes = [{ type: 'ATXHeading1', from: 0, to: 1 }];
    const specs = buildDecorationSpecs(text, nodes);
    expect(
      specs.some(
        (s: { kind: string; cls?: string }) => s.kind === 'line-style' && s.cls === 'mda-cm-h1-line'
      )
    ).toBe(true);
    expect(specs.some((s: { kind: string }) => s.kind === 'style')).toBe(false);
  });

  test('D15: 行内强调始终隐藏定界符', () => {
    const text = '**bold**';
    const nodes = [{ type: 'StrongEmphasis', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes);
    expect(specs.some((s: { kind: string }) => s.kind === 'hide-mark')).toBe(true);
    expect(specs.some((s: { kind: string; cls?: string }) => s.kind === 'style' && s.cls === 'mda-cm-strong')).toBe(
      true
    );
  });

  test('D15: 图片 widget 不因聚焦退回源码', () => {
    const text = '![x](a.png)';
    const nodes = [{ type: 'Image', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes, {
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
    const specs = buildDecorationSpecs(text, nodes, {
      widgetEnabled: function () {
        return false;
      },
    });
    expect(specs.some((s: { widget?: string }) => s.widget === 'image')).toBe(false);
  });

  test('math 阶段：行内公式整段 widget（atomic 删除，不拆 hide $）', () => {
    const text = '见 $E=mc^2$ 式';
    const specs = buildDecorationSpecs(text, [], {
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
    const specs = buildDecorationSpecs(text, [], {
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
      const specs = buildDecorationSpecs(c.text, nodes);
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
    buildDecorationSpecs(text, nodes);
    expect(text).toBe(before);
  });
});

describe('buildDecorationSpecs (M8-B S6–S12)', () => {
  test('S6: 链接隐藏标记并带 href', () => {
    const text = '[t](https://a.com)';
    const nodes = [{ type: 'Link', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes);
    expect(specs.some((s: { kind: string }) => s.kind === 'hide-mark')).toBe(true);
    const style = specs.find((s: { kind: string; cls?: string }) => s.kind === 'style' && s.cls === 'mda-cm-link');
    expect(style).toMatchObject({ from: 1, to: 2, href: 'https://a.com' });
  });

  test('S8: 无序列表标记 → bullet widget', () => {
    const text = '- item';
    const nodes = [{ type: 'ListMark', from: 0, to: 1, listKind: 'bullet' }];
    const specs = buildDecorationSpecs(text, nodes);
    expect(specs).toEqual([
      expect.objectContaining({ kind: 'widget', widget: 'bullet', from: 0, to: 2 }),
    ]);
  });

  test('S9: 有序列表序号保持字面文本，只套 style span', () => {
    const text = '1. item';
    const nodes = [{ type: 'ListMark', from: 0, to: 2, listKind: 'ordered' }];
    const specs = buildDecorationSpecs(text, nodes);
    expect(specs).toEqual([
      expect.objectContaining({ kind: 'style', cls: 'mda-cm-list-mark', from: 0, to: 3 }),
    ]);
    expect(specs.some((s: { kind: string }) => s.kind === 'hide-mark')).toBe(false);
  });

  test('任务项不再画圆点：ListMark 隐藏而非 bullet widget', () => {
    const text = '- [ ] todo';
    const nodes = [
      { type: 'ListMark', from: 0, to: 1, listKind: 'bullet' },
      { type: 'TaskMarker', from: 2, to: 5 },
    ];
    const specs = buildDecorationSpecs(text, nodes);
    expect(specs.some((s: { widget?: string }) => s.widget === 'bullet')).toBe(false);
    expect(
      specs.some((s: any) => s.kind === 'hide-mark' && s.from === 0 && s.to === 2)
    ).toBe(true);
    expect(specs.some((s: { widget?: string }) => s.widget === 'task')).toBe(true);
  });

  test('S10: 任务标记 → checkbox widget', () => {
    const text = '[x]';
    const nodes = [{ type: 'TaskMarker', from: 0, to: 3 }];
    const specs = buildDecorationSpecs(text, nodes);
    expect(specs[0]).toMatchObject({ kind: 'widget', widget: 'task', checked: true });
  });

  test('S11/S12: 引用标记隐藏；分隔线 widget', () => {
    const q = buildDecorationSpecs('> a', [{ type: 'QuoteMark', from: 0, to: 1 }]);
    expect(q.some((s: { kind: string }) => s.kind === 'hide-mark')).toBe(true);
    expect(q.some((s: { kind: string; cls?: string }) => s.kind === 'line-style')).toBe(true);

    const hr = buildDecorationSpecs('---', [{ type: 'HorizontalRule', from: 0, to: 3 }]);
    expect(hr[0]).toMatchObject({ kind: 'widget', widget: 'hr' });
  });

  test('引用块：左上角手柄 widget；标题加 heading-handle', () => {
    const quote = buildDecorationSpecs(
      '> hello',
      [
        { type: 'Blockquote', from: 0, to: 7 },
        { type: 'QuoteMark', from: 0, to: 1 },
      ]
    );
    expect(quote.some((s: any) => s.widget === 'quote-handle' && s.quoteKind === 'quote')).toBe(
      true
    );
    expect(quote.some((s: any) => s.kind === 'line-style' && s.cls === 'mda-cm-blockquote-line')).toBe(
      true
    );

    const noteText = '> [!NOTE]\n> tip';
    const note = buildDecorationSpecs(
      noteText,
      [
        { type: 'Blockquote', from: 0, to: noteText.length },
        { type: 'QuoteMark', from: 0, to: 1 },
        { type: 'QuoteMark', from: 10, to: 11 },
      ]
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
      ]
    );
    expect(
      emptyQuote.some((s: any) => s.kind === 'hide-mark' && s.from === 1 && s.to === 2)
    ).toBe(false);

    const heading = buildDecorationSpecs('# Title', [{ type: 'ATXHeading1', from: 0, to: 7 }]);
    expect(heading.some((s: any) => s.widget === 'heading-handle' && s.headingLevel === 1)).toBe(
      true
    );
    expect(heading.some((s: any) => s.widget === 'heading-handle' && s.from === 2)).toBe(true);
    expect(heading.some((s: any) => s.widget === 'quote-handle')).toBe(false);
  });

  test('列表项内标题：仍出手柄 + 标题样式 + 行高，且保留列表标记', () => {
    const text = '- ## Title';
    const tree = parser.parse(text);
    const nodes = collectSyntaxNodes(tree, text);
    const specs = buildDecorationSpecs(text, nodes);
    expect(specs.some((s: any) => s.widget === 'heading-handle' && s.headingLevel === 2)).toBe(true);
    expect(specs.some((s: any) => s.kind === 'style' && s.cls === 'mda-cm-h2')).toBe(true);
    expect(specs.some((s: any) => s.widget === 'bullet')).toBe(true);
    // Decoration.line 必须落在行首，否则 CM6 静默丢弃 → 标题行高失效
    const lineStyle = specs.find(
      (s: any) => s.kind === 'line-style' && s.cls === 'mda-cm-h2-line'
    );
    expect(lineStyle).toBeTruthy();
    expect(lineStyle.from).toBe(0);
  });

  test('多行文档里列表项标题的行样式锚到本行行首', () => {
    const text = 'intro\n\n1. ### Title\n';
    const tree = parser.parse(text);
    const nodes = collectSyntaxNodes(tree, text);
    const specs = buildDecorationSpecs(text, nodes);
    const lineStyle = specs.find(
      (s: any) => s.kind === 'line-style' && s.cls === 'mda-cm-h3-line'
    );
    expect(lineStyle).toBeTruthy();
    expect(lineStyle.from).toBe(text.indexOf('1. '));
  });

  test('图片行后紧跟 ---：补 HorizontalRule 节点（非 Setext 标题）', () => {
    const text = '![](./a.png)\n---\n';
    const tree = parser.parse(text);
    const nodes = collectSyntaxNodes(tree, text);
    expect(nodes.some((n: { type: string }) => n.type === 'Image')).toBe(true);
    expect(nodes.some((n: { type: string }) => n.type === 'HorizontalRule')).toBe(true);
    expect(nodes.some((n: { type: string }) => n.type === 'SetextHeading2')).toBe(false);
    const specs = buildDecorationSpecs(text, nodes, {
      widgetEnabled: function (kind: string) {
        return kind === 'image' || kind === 'hr';
      },
    });
    expect(specs.some((s: { widget?: string }) => s.widget === 'hr')).toBe(true);
  });

  test('段落后 ---（含下划线标识符）当作分割线而非 Setext', () => {
    const text = 'size_class: small\n---\n# next\n';
    const tree = parser.parse(text);
    const nodes = collectSyntaxNodes(tree, text);
    expect(nodes.some((n: { type: string }) => n.type === 'HorizontalRule')).toBe(true);
    expect(nodes.some((n: { type: string }) => n.type === 'SetextHeading2')).toBe(false);
    const specs = buildDecorationSpecs(text, nodes, {
      widgetEnabled: function (kind: string) {
        return kind === 'hr';
      },
    });
    expect(specs.some((s: { widget?: string }) => s.widget === 'hr')).toBe(true);
  });

  test('=== Setext 一级标题保留', () => {
    const text = 'Title\n===\n';
    const tree = parser.parse(text);
    const nodes = collectSyntaxNodes(tree, text);
    expect(nodes.some((n: { type: string }) => n.type === 'SetextHeading1')).toBe(true);
    expect(nodes.some((n: { type: string }) => n.type === 'HorizontalRule')).toBe(false);
  });

  test('围栏外 HTML 注释整行隐藏', () => {
    const text = '# 入口\n<!-- AI 加载优先级: P2 -->\n正文\n';
    const specs = buildDecorationSpecs(text, []);
    const hides = specs.filter((s: { kind: string }) => s.kind === 'hide-line');
    expect(hides.some((s: { from: number; to: number }) => text.slice(s.from, s.to).includes('AI 加载优先级'))).toBe(
      true
    );
  });

  test('围栏内 HTML 注释不隐藏', () => {
    const text = '```html\n<!-- keep -->\n```\n';
    const specs = buildDecorationSpecs(text, []);
    expect(
      specs.some(
        (s: { kind: string; from: number; to: number }) =>
          (s.kind === 'hide-line' || s.kind === 'hide-mark') && text.slice(s.from, s.to).includes('keep')
      )
    ).toBe(false);
  });
});

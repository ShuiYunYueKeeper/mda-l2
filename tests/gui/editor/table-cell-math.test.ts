/**
 * 表格单元格公式序列化往返（无 jsdom：手写最小节点树）
 */
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { serializeTableCellMarkdown } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/parse-table.js'
));

function textNode(value: string) {
  return { nodeType: 3, nodeValue: value, childNodes: [] as unknown[] };
}

function elementNode(
  attrs: Record<string, string>,
  children: unknown[]
) {
  return {
    nodeType: 1,
    childNodes: children,
    getAttribute: (k: string) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null),
    hasAttribute: (k: string) => Object.prototype.hasOwnProperty.call(attrs, k),
  };
}

describe('table cell math serialize', () => {
  test('data-mda-math-source 优先回写', () => {
    const el = elementNode({}, [
      textNode('见 '),
      elementNode(
        { 'data-mda-math-source': '$E=mc^2$', 'data-mda-math-tex': 'E=mc^2' },
        [textNode('E=mc2')]
      ),
      textNode(' 式'),
    ]);
    expect(serializeTableCellMarkdown(el).trim()).toBe('见 $E=mc^2$ 式');
  });

  test('data-mda-image-source 回写图片语法', () => {
    const el = elementNode({}, [
      elementNode(
        {
          'data-mda-image-source': '![完整窗口](docs/screenshots/1.png)',
          'data-mda-image-src': 'docs/screenshots/1.png',
          'data-mda-image-alt': '完整窗口',
        },
        []
      ),
    ]);
    // classList 在手写节点上没有，走 data-mda-image-source 分支
    expect(serializeTableCellMarkdown(el).trim()).toBe(
      '![完整窗口](docs/screenshots/1.png)'
    );
  });

  test('纯文本单元格不变', () => {
    const el = elementNode({}, [textNode('希腊字母')]);
    expect(serializeTableCellMarkdown(el).trim()).toBe('希腊字母');
  });

  test('splitRow 保留 LaTeX 反斜杠，仅转义 \\| 与 \\\\', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { splitRow, parseGfmTable, escapeCell } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-table.js'
    ));
    expect(splitRow('| $\\sqrt{2}$ |')).toEqual(['$\\sqrt{2}$']);
    expect(splitRow('| a\\|b |')).toEqual(['a|b']);
    expect(splitRow('| a\\\\b |')).toEqual(['a\\b']);
    const parsed = parseGfmTable(
      '| 类别 | 行内示例 |\n|------|----------|\n| 分数根号 | $\\sqrt{2}$、$\\dfrac{1}{1+x}$ |\n'
    );
    expect(parsed).not.toBeNull();
    expect(parsed.rows[0][1]).toContain('\\sqrt{2}');
    expect(parsed.rows[0][1]).toContain('\\dfrac');
    // LaTeX 的单个反斜杠不是表格转义，写回不得再加倍
    const escaped = escapeCell('$\\sqrt{2}$');
    expect(escaped).toBe('$\\sqrt{2}$');
    expect(splitRow('| ' + escaped + ' |')[0]).toBe('$\\sqrt{2}$');
  });

  test('katex 表格原文往返：分隔行和单个反斜杠都不改', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseGfmTable, serializeGfmTable } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-table.js'
    ));
    const src = [
      '| 类别 | 行内示例 |',
      '|------|----------|',
      '| 希腊字母 | $\\alpha,\\beta,\\gamma,\\Delta,\\Omega$ |',
      '| 上下标 | $x_i^{(n)}$、$e^{-i\\omega t}$ |',
      '| 分数根号 | $\\sqrt{2}$、$\\dfrac{1}{1+x}$ |',
      '| 集合 | $A \\cup B$、$\\mathbb{R}^{n}$、$\\emptyset$ |',
      '| 关系 | $x \\approx y$、$\\forall x\\,\\exists y$ |',
    ].join('\n');
    const parsed = parseGfmTable(src);
    expect(parsed).not.toBeNull();
    expect(serializeGfmTable(parsed, src)).toBe(src);
  });
});

describe('findImageRanges', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { findImageRanges } = require(path.join(
    __dirname,
    '../../../src/gui/renderer/editor/model/parse-image.js'
  ));

  test('扫描单元格内图片语法', () => {
    const ranges = findImageRanges('![完整窗口](docs/screenshots/1.png)');
    expect(ranges).toHaveLength(1);
    expect(ranges[0].src).toBe('docs/screenshots/1.png');
    expect(ranges[0].alt).toBe('完整窗口');
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { findCellInlineRanges } = require(path.join(
    __dirname,
    '../../../src/gui/renderer/editor/widgets/table-cell-content.js'
  ));

  test('公式与图片可并存', () => {
    const ranges = findCellInlineRanges(
      '见 $a$ 与 ![图](a.png)'
    );
    expect(ranges.map((r: { kind: string }) => r.kind)).toEqual([
      'math-inline',
      'image',
    ]);
  });

  test('识别单元格内粗体与行内代码', () => {
    const { findSyntaxInlineRanges } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/widgets/table-cell-content.js'
    ));
    const ranges = findSyntaxInlineRanges('`auth/cfgs/default.cfg` 与 **true**');
    expect(ranges.map((r: { type: string }) => r.type)).toEqual([
      'InlineCode',
      'StrongEmphasis',
    ]);
    const merged = findCellInlineRanges('`cfg` **bold**');
    expect(merged.map((r: { kind: string; type?: string }) => r.kind === 'syntax' ? r.type : r.kind)).toEqual([
      'InlineCode',
      'StrongEmphasis',
    ]);
  });

  test('行内样式 DOM 可序列化回 Markdown', () => {
    const { serializeInlineStyledElement } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/widgets/table-cell-content.js'
    ));
    const bold = {
      classList: { contains: (c: string) => c === 'mda-cm-strong' },
      getAttribute: () => null,
      textContent: 'true',
    };
    const code = {
      classList: { contains: (c: string) => c === 'mda-cm-code' },
      getAttribute: () => null,
      textContent: 'auth/cfgs/default.cfg',
    };
    expect(serializeInlineStyledElement(bold as never)).toBe('**true**');
    expect(serializeInlineStyledElement(code as never)).toBe('`auth/cfgs/default.cfg`');
  });
});

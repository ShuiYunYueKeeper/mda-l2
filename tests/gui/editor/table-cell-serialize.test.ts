/**
 * 单元格 DOM → Markdown 序列化（无 jsdom：手写最小节点树）。
 *
 * 样式段渲染时会把源码快照写进 data-mda-inline-source。用户在段内改字之后若仍原样吐回
 * 这份快照，这次编辑就被整个吞掉 —— 曾表现为「格内改了字，切走再回来又变回去」。
 */
import * as path from 'path';

const { serializeTableCellMarkdown } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/parse-table.js'
));

function textNode(value: string) {
  return { nodeType: 3, nodeValue: value, childNodes: [] as unknown[] };
}

function elementNode(attrs: Record<string, string>, children: unknown[]) {
  const cls = (attrs.class || '').split(/\s+/).filter(Boolean);
  const walk = (n: any): string =>
    n.nodeType === 3 ? n.nodeValue : (n.childNodes || []).map(walk).join('');
  return {
    nodeType: 1,
    childNodes: children,
    classList: { contains: (c: string) => cls.indexOf(c) >= 0 },
    get textContent(): string {
      return (children as any[]).map(walk).join('');
    },
    getAttribute: (k: string) =>
      Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null,
    hasAttribute: (k: string) => Object.prototype.hasOwnProperty.call(attrs, k),
  };
}

/** 渲染产物：source = 源码快照，inline-text = 渲染时的可见文字 */
function styled(cls: string, source: string, rendered: string, current: string) {
  return elementNode(
    {
      class: 'mda-cm-table-inline ' + cls,
      'data-mda-inline-source': source,
      'data-mda-inline-text': rendered,
    },
    [textNode(current)]
  );
}

describe('table cell serialize', () => {
  test('E112 未改动时沿用源码快照', () => {
    const cell = elementNode({}, [styled('mda-cm-strong', '**加粗**', '加粗', '加粗')]);
    expect(serializeTableCellMarkdown(cell)).toBe('**加粗**');
  });

  test('E113 段内改字后快照作废，按当前文字重建', () => {
    const cell = elementNode({}, [styled('mda-cm-strong', '**加粗**', '加粗', '加粗改了')]);
    expect(serializeTableCellMarkdown(cell)).toBe('**加粗改了**');
  });

  test('E114 段内删空时整对定界符一并丢弃', () => {
    const cell = elementNode({}, [
      textNode('AA'),
      styled('mda-cm-strong', '**加粗**', '加粗', ''),
      textNode('BB'),
    ]);
    expect(serializeTableCellMarkdown(cell)).toBe('AABB');
  });

  test('E115 无快照的空样式段不吐裸定界符', () => {
    const cell = elementNode({}, [
      elementNode({ class: 'mda-cm-table-inline mda-cm-strong' }, [textNode('')]),
    ]);
    expect(serializeTableCellMarkdown(cell)).toBe('');
  });

  test('E116 五类标记改字后都按当前文字重建', () => {
    const cases: [string, string, string][] = [
      ['mda-cm-strong', '**A**', '**AX**'],
      ['mda-cm-em', '*A*', '*AX*'],
      ['mda-cm-underline', '~A~', '~AX~'],
      ['mda-cm-strike', '~~A~~', '~~AX~~'],
      ['mda-cm-code', '`A`', '`AX`'],
    ];
    for (const [cls, source, expected] of cases) {
      const cell = elementNode({}, [styled(cls, source, 'A', 'AX')]);
      expect(`${cls}:${serializeTableCellMarkdown(cell)}`).toBe(`${cls}:${expected}`);
    }
  });

  test('E117 链接改字后保留 href', () => {
    const a = elementNode(
      {
        class: 'mda-cm-link',
        href: 'https://x.com',
        'data-mda-inline-source': '[链接](https://x.com)',
        'data-mda-inline-text': '链接',
      },
      [textNode('链接改了')]
    );
    expect(serializeTableCellMarkdown(elementNode({}, [a]))).toBe(
      '[链接改了](https://x.com)'
    );
  });

  test('E118 老快照缺 inline-text 时保持原行为（不误判为已改）', () => {
    const cell = elementNode(
      {},
      [
        elementNode(
          { class: 'mda-cm-table-inline mda-cm-strong', 'data-mda-inline-source': '**加粗**' },
          [textNode('加粗')]
        ),
      ]
    );
    expect(serializeTableCellMarkdown(cell)).toBe('**加粗**');
  });
});

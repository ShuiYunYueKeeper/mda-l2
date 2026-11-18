/**
 * 原生 HTML 块（README 居中头部 / <details>）在 CM6 预览里的整块替换：
 * - htmlBlockRegion 把语法树里被截断的 HTMLBlock 撑成整块（跨空行、围栏感知、未闭合回退）
 * - collectSyntaxNodes 产出 HTMLBlock 节点并合并/裁剪，保证区间不重叠
 * - buildDecorationSpecs 产出 widget: 'html-block' 的 spec
 */
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildDecorationSpecs, collectSyntaxNodes } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/build-specs.js'
));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { htmlBlockRegion, depthDeltaOfLine } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/html-block.js'
));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parser } = require('@lezer/markdown');

interface Region {
  from: number;
  to: number;
  extended: boolean;
}
interface Node {
  type: string;
  from: number;
  to: number;
}

function collect(text: string): Node[] {
  const tree = parser.parse(text);
  return collectSyntaxNodes(tree, text).filter((n: Node) => n.type === 'HTMLBlock');
}

describe('htmlBlockRegion', () => {
  test('跨空行延伸到闭合标签（<details> 内夹 Markdown）', () => {
    const text = [
      '<details>',
      '<summary>展开</summary>',
      '',
      '## 标题',
      '',
      '正文 <strong>加粗</strong>',
      '<table><tr><td>1</td></tr></table>',
      '',
      '</details>',
      '',
      '后续段落',
    ].join('\n');
    const start = text.indexOf('<details>');
    const nodeEnd = text.indexOf('</summary>') + '</summary>'.length;
    const region: Region = htmlBlockRegion(text, start, nodeEnd);
    const closeEnd = text.indexOf('</details>') + '</details>'.length;
    // 区间含闭合行的行尾换行，故 >= 而非 ===
    expect(region.to).toBeGreaterThanOrEqual(closeEnd);
    expect(text.slice(region.to).trim()).toBe('后续段落');
    expect(region.extended).toBe(true);
    expect(text.slice(region.from, region.to)).toContain('## 标题');
    expect(text.slice(region.from, region.to)).not.toContain('后续段落');
  });

  test('围栏里的标签不参与深度计算', () => {
    const text = ['<div>', '', '```', '<section>', '```', '', '</div>'].join('\n');
    const region: Region = htmlBlockRegion(text, 0, '<div>'.length);
    // 围栏内的 <section> 若被计数，深度会是 +2，永远等不到闭合 → 退回未延伸
    expect(region.to).toBe(text.length);
    expect(region.extended).toBe(true);
  });

  test('缺闭合标签时退回只覆盖语法树那一块，避免吞掉整篇', () => {
    const text = ['<div>', '', '很多正文', '更多正文', '结尾'].join('\n');
    const region: Region = htmlBlockRegion(text, 0, '<div>'.length);
    expect(region.extended).toBe(false);
    expect(region.to).toBe('<div>\n'.length);
  });

  test('自闭合标签不增加深度', () => {
    expect(depthDeltaOfLine('<img src="a.png">')).toBe(0);
    expect(depthDeltaOfLine('<br/>')).toBe(0);
    expect(depthDeltaOfLine('<div/>')).toBe(0);
    expect(depthDeltaOfLine('<div>')).toBe(1);
    expect(depthDeltaOfLine('</div>')).toBe(-1);
  });
});

describe('collectSyntaxNodes: HTMLBlock', () => {
  test('只隔空行的连续 HTML 块合并成一块（README 居中头部）', () => {
    const text = [
      '<p align="center">',
      '<img src="icon.png" alt="icon" />',
      '</p>',
      '',
      '<h1 align="center">标题</h1>',
      '',
      '<p align="center">副标题</p>',
      '',
      '---',
      '',
      '正文',
    ].join('\n');
    const nodes = collect(text);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].from).toBe(0);
    // 区间含块内最后一行的行尾换行
    expect(nodes[0].to).toBe(text.indexOf('\n\n---') + 1);
  });

  test('闭合标签属于上一块时裁剪，区间不重叠', () => {
    const text = [
      '<details>',
      '<summary>一</summary>',
      '',
      '### 第一节',
      '',
      '</details>',
      '',
      '<details>',
      '<summary>二</summary>',
      '',
      '### 第二节',
      '',
      '</details>',
      '',
      '正文',
    ].join('\n');
    const nodes = collect(text);
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < nodes.length; i += 1) {
      expect(nodes[i].from).toBeGreaterThanOrEqual(nodes[i - 1].to);
    }
    expect(nodes[0].from).toBe(0);
    expect(nodes[0].to).toBe(text.indexOf('\n\n正文') + 1);
  });

  test('表格/引用内的 HTML 不单独成块（交给各自 widget）', () => {
    const text = ['| A | B |', '| --- | --- |', '| <b>x</b> | y |'].join('\n');
    expect(collect(text)).toHaveLength(0);
  });

  test('围栏内的 HTML 样例不识别为块', () => {
    const text = ['```html', '<div>样例</div>', '```'].join('\n');
    expect(collect(text)).toHaveLength(0);
  });
});

describe('buildDecorationSpecs: html-block', () => {
  test('产出整块 widget spec，源码取自节点区间', () => {
    const text = '<div align="center">标题</div>';
    const nodes = [{ type: 'HTMLBlock', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes);
    const widget = specs.find((s: { widget?: string }) => s.widget === 'html-block');
    expect(widget).toMatchObject({
      kind: 'widget',
      widget: 'html-block',
      from: 0,
      to: text.length,
      source: text,
    });
  });

  test('widget 关闭时不出 spec（源码模式）', () => {
    const text = '<div align="center">标题</div>';
    const nodes = [{ type: 'HTMLBlock', from: 0, to: text.length }];
    const specs = buildDecorationSpecs(text, nodes, {
      widgetEnabled: (kind: string) => kind !== 'html-block',
    });
    expect(specs.some((s: { widget?: string }) => s.widget === 'html-block')).toBe(false);
  });
});

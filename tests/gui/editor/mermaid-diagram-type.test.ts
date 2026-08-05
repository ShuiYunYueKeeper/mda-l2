/**
 * Mermaid 图表类型识别
 */
import * as path from 'path';

const {
  detectMermaidDiagramType,
  getMermaidFirstKeyword,
  mermaidDiagramTypeLabel,
} = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/mermaid-diagram-type.js'
));

describe('mermaid diagram type', () => {
  test('识别 sankey-beta', () => {
    const code = '%% comment\nsankey-beta\nUser,GUI,40';
    expect(getMermaidFirstKeyword(code)).toBe('sankey-beta');
    expect(detectMermaidDiagramType(code)).toBe('sankey');
    expect(mermaidDiagramTypeLabel(code, (k: string) => (k === 'mermaidKwSankey' ? 'Sankey' : k))).toBe(
      'Sankey'
    );
  });

  test('graph 与 flowchart 分别展示', () => {
    expect(getMermaidFirstKeyword('graph TD\n  A --> B')).toBe('graph');
    expect(mermaidDiagramTypeLabel('graph TD\n  A --> B', (k: string) =>
      k === 'mermaidKwGraph' ? 'graph' : k
    )).toBe('graph');
    expect(getMermaidFirstKeyword('flowchart TD\n  A --> B')).toBe('flowchart');
    expect(mermaidDiagramTypeLabel('flowchart TD\n  A --> B', (k: string) =>
      k === 'mermaidKwFlowchart' ? 'flowchart' : k
    )).toBe('flowchart');
  });

  test('识别 sequenceDiagram', () => {
    const code = 'sequenceDiagram\n  Alice->>Bob: hi';
    expect(getMermaidFirstKeyword(code)).toBe('sequenceDiagram');
    expect(detectMermaidDiagramType(code)).toBe('sequence');
    expect(
      mermaidDiagramTypeLabel(code, (k: string) => (k === 'mermaidKwSequenceDiagram' ? '时序图' : k))
    ).toBe('时序图');
  });

  test('未知类型回退为通用流程图', () => {
    expect(getMermaidFirstKeyword('')).toBe('');
    expect(mermaidDiagramTypeLabel('', (k: string) => (k === 'diagram' ? '流程图' : k))).toBe('流程图');
  });

  test('radar / treemap / venn beta 中文顶栏', () => {
    expect(mermaidDiagramTypeLabel('radar-beta\n  title 质量', (k: string) =>
      k === 'mermaidKwRadar' ? '雷达图' : k
    )).toBe('雷达图');
    expect(mermaidDiagramTypeLabel('treemap-beta\n  root', (k: string) =>
      k === 'mermaidKwTreemap' ? '矩形树图' : k
    )).toBe('矩形树图');
    expect(mermaidDiagramTypeLabel('venn-beta\n  title 协作', (k: string) =>
      k === 'mermaidKwVenn' ? '维恩图' : k
    )).toBe('维恩图');
  });

  test('gitGraph / C4Context 驼峰关键字命中 i18n', () => {
    const t = (k: string) => {
      if (k === 'mermaidKwGitgraph') return 'Git历史图';
      if (k === 'mermaidKwC4') return '系统上下文图';
      return k;
    };
    expect(mermaidDiagramTypeLabel('gitGraph\n  commit', t)).toBe('Git历史图');
    expect(mermaidDiagramTypeLabel('C4Context\n  title x', t)).toBe('系统上下文图');
  });
});

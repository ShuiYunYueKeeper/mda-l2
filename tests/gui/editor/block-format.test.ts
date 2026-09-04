/**
 * M8-E1：块级格式推导（工具栏状态同步）
 */
import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  deriveBlockFormat,
  getInlineActive,
  getInlineToolbarState,
  deriveParagraphSelect,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/state/block-format.js'));

function stateAt(doc: string, pos: number) {
  return EditorState.create({
    doc,
    selection: { anchor: pos },
    extensions: [markdown()],
  });
}

function stateSel(doc: string, from: number, to: number) {
  return EditorState.create({
    doc,
    selection: { anchor: from, head: to },
    extensions: [markdown()],
  });
}

describe('block-format (M8-E1)', () => {
  test('deriveBlockFormat: ATX 标题', () => {
    const st = stateAt('## Title\nbody', 4);
    expect(deriveBlockFormat(st)).toBe('h2');
  });

  test('deriveBlockFormat: 无序/有序/任务/引用', () => {
    expect(deriveBlockFormat(stateAt('- item', 3))).toBe('bullet');
    expect(deriveBlockFormat(stateAt('1. item', 4))).toBe('ordered');
    expect(deriveBlockFormat(stateAt('- [ ] todo', 6))).toBe('task');
    expect(deriveBlockFormat(stateAt('> quote', 4))).toBe('quote');
  });

  test('getInlineActive: 粗体与行内代码', () => {
    const doc = '**bold** and `code`';
    const boldPos = doc.indexOf('b');
    const codePos = doc.indexOf('c', 10);
    expect(getInlineActive(stateAt(doc, boldPos)).bold).toBe(true);
    expect(getInlineActive(stateAt(doc, codePos)).code).toBe(true);
  });

  test('getInlineToolbarState: 混合加粗为 mixed', () => {
    const doc = '**ab** cd';
    const st = stateSel(doc, 0, doc.length);
    const bold = getInlineToolbarState(st).bold;
    expect(bold.on).toBe(false);
    expect(bold.mixed).toBe(true);
  });

  test('deriveParagraphSelect: 多级标题混合', () => {
    const doc = '# one\n## two';
    const st = stateSel(doc, 0, doc.length);
    const para = deriveParagraphSelect(st);
    expect(para.mixed).toBe(true);
  });

  test('deriveParagraphSelect: 列表项内标题仍算标题', () => {
    expect(deriveParagraphSelect(stateAt('- ## Title', 5)).value).toBe('h2');
    expect(deriveParagraphSelect(stateAt('1. # Title', 5)).value).toBe('h1');
  });

  test('deriveParagraphSelect: 任务项内 # 是字面文本，算正文', () => {
    expect(deriveParagraphSelect(stateAt('- [ ] ## Title', 8)).value).toBe('paragraph');
  });
});

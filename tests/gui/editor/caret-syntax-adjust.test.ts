/**
 * 预览点击落点：hide-mark 边缘校准到定界符外侧。
 */
import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const {
  adjustCaretForHiddenMarks,
  adjustSelectionForHiddenMarks,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/caret-syntax-adjust.js'));

function mdState(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: GFM })],
  });
  ensureSyntaxTree(state, doc.length);
  return state;
}

describe('caret-syntax-adjust', () => {
  test('标题可见内容左缘 → ## 左侧', () => {
    const doc = '## 目录结构\n';
    const state = mdState(doc);
    const contentStart = doc.indexOf('目');
    expect(adjustCaretForHiddenMarks(state, contentStart)).toBe(0);
  });

  test('加粗可见内容左缘 → 开 ** 左侧', () => {
    const doc = '**MDA** 是本地';
    const state = mdState(doc);
    const contentStart = doc.indexOf('M');
    expect(adjustCaretForHiddenMarks(state, contentStart)).toBe(0);
  });

  test('加粗可见内容右缘 → 闭 ** 右侧', () => {
    const doc = '**MDA** 是本地';
    const state = mdState(doc);
    const contentEnd = doc.indexOf('**', 1);
    expect(adjustCaretForHiddenMarks(state, contentEnd)).toBe(contentEnd + 2);
  });

  test('行内 code 右缘 → 闭 ` 右侧', () => {
    const doc = '调用 `mda-cli` 工具';
    const state = mdState(doc);
    const open = doc.indexOf('`');
    const close = doc.indexOf('`', open + 1);
    expect(adjustCaretForHiddenMarks(state, close)).toBe(close + 1);
  });

  test('加粗中间字符不校准', () => {
    const doc = '**MDA** 是本地';
    const state = mdState(doc);
    const mid = doc.indexOf('D');
    expect(adjustCaretForHiddenMarks(state, mid)).toBe(mid);
  });

  test('拖选区间两端含边缘时扩展到定界符外侧', () => {
    const doc = '**MDA** 是本地';
    const state = mdState(doc);
    const contentStart = doc.indexOf('M');
    const contentEnd = doc.indexOf('**', 1);
    const localEnd = doc.indexOf('地') + 1;
    const next = adjustSelectionForHiddenMarks(state, contentStart, localEnd);
    expect(next.anchor).toBe(0);
    expect(next.head).toBe(localEnd);
    const onlyBold = adjustSelectionForHiddenMarks(state, contentStart, contentEnd);
    expect(onlyBold.anchor).toBe(0);
    expect(onlyBold.head).toBe(contentEnd + 2);
  });

  test('拖选行末勿吃进下一空行行首', () => {
    const doc = '经典 graph 写法\n\n下一节';
    const state = mdState(doc);
    const line1 = state.doc.line(1);
    const line2 = state.doc.line(2);
    expect(line2.text).toBe('');
    const next = adjustSelectionForHiddenMarks(state, line1.from, line2.from);
    expect(next.anchor).toBe(line1.from);
    expect(next.head).toBe(line1.to);
  });

  test('反向拖选到空行行首亦收回上一行末', () => {
    const doc = '第一行\n\n第三行';
    const state = mdState(doc);
    const line2 = state.doc.line(2);
    const line1 = state.doc.line(1);
    const next = adjustSelectionForHiddenMarks(state, line2.from, line1.from + 2);
    expect(next.anchor).toBe(line1.to);
    expect(next.head).toBe(line1.from + 2);
  });
});

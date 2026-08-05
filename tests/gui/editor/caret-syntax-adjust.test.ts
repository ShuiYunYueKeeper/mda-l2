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
});

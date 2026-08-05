/**
 * 预览剪贴板：定界符未成对时去掉 hide-mark 字符。
 */
import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const { sliceDocForClipboard } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/syntax-clipboard.js'
));

function mdState(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: GFM })],
  });
  ensureSyntaxTree(state, doc.length);
  return state;
}

describe('syntax-clipboard', () => {
  test('仅含开 ** 的选区 → 粘贴纯文本', () => {
    const doc = '**MDA** 是本地';
    const state = mdState(doc);
    const from = 0;
    const to = doc.indexOf('A') + 1;
    expect(sliceDocForClipboard(state, from, to).text).toBe('MDA');
  });

  test('仅含闭 ** 的选区 → 粘贴纯文本', () => {
    const doc = '**MDA** 是本地';
    const state = mdState(doc);
    const from = doc.indexOf('D');
    const to = doc.indexOf('**', 1) + 2;
    expect(sliceDocForClipboard(state, from, to).text).toBe('DA');
  });

  test('完整 **MDA** → 保留定界符', () => {
    const doc = '**MDA** 是本地';
    const state = mdState(doc);
    expect(sliceDocForClipboard(state, 0, doc.indexOf('**', 1) + 2).text).toBe('**MDA**');
  });

  test('仅选可见正文 MDA → 无定界符', () => {
    const doc = '**MDA** 是本地';
    const state = mdState(doc);
    const from = doc.indexOf('M');
    const to = doc.indexOf('A') + 1;
    expect(sliceDocForClipboard(state, from, to).text).toBe('MDA');
  });

  test('行内 code 定界符成对/单侧', () => {
    const doc = '调用 `mda-cli` 工具';
    const state = mdState(doc);
    const open = doc.indexOf('`');
    const close = doc.indexOf('`', open + 1);
    expect(sliceDocForClipboard(state, open, close + 1).text).toBe('`mda-cli`');
    expect(sliceDocForClipboard(state, open, close).text).toBe('mda-cli');
    expect(sliceDocForClipboard(state, open + 1, close).text).toBe('mda-cli');
  });
});

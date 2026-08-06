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

  test('标题 ATX 复制不含 ##（预览态不可见）', () => {
    const doc = '## 核心功能\n\n### 命令行\n';
    const state = mdState(doc);
    expect(sliceDocForClipboard(state, 0, doc.indexOf('能') + 1).text).toBe('核心功能');
    expect(sliceDocForClipboard(state, 0, doc.indexOf('\n')).text).toBe('核心功能');
    const h3 = doc.indexOf('###');
    expect(sliceDocForClipboard(state, h3, doc.length - 1).text).toBe('命令行');
  });

  test('normalizePasteForHeading 贴入标题行去掉首部 ATX', () => {
    const { normalizePasteForHeading, normalizeClipboardAtx } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/syntax-clipboard.js'
    ));
    const doc = '## 核心功能\n';
    const state = mdState(doc);
    const pos = doc.indexOf('核');
    expect(normalizePasteForHeading(state, pos, '## 安装方式')).toBe('安装方式');
    expect(normalizePasteForHeading(state, pos, '安装方式')).toBe('安装方式');
    expect(normalizeClipboardAtx('安装方式###')).toBe('安装方式');
    expect(normalizeClipboardAtx('## foo\n### bar')).toBe('foo\nbar');
    const body = mdState('正文\n');
    expect(normalizePasteForHeading(body, 0, '## x')).toBe('## x');
  });

  test('行尾向前拖选落点漂到下行 ATX 时复制仍无 #', () => {
    const { sliceSelectionForClipboard } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/syntax-clipboard.js'
    ));
    const { adjustSelectionForHiddenMarks } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/caret-syntax-adjust.js'
    ));
    const doc = '### 安装方式\n### 子标题\n';
    const state = mdState(doc);
    const line1 = state.doc.line(1);
    const line2 = state.doc.line(2);
    const contentFrom = doc.indexOf('安');
    // 模拟：anchor 漂到下行 ATX 前缀，head 在正文
    const adjusted = adjustSelectionForHiddenMarks(state, line2.from + 1, contentFrom);
    expect(adjusted.anchor).toBe(line1.to);
    const bleedState = state.update({
      selection: { anchor: line2.from + 1, head: contentFrom },
    }).state;
    const slice = sliceSelectionForClipboard(bleedState);
    expect(slice).not.toBeNull();
    expect(slice!.text).toBe('安装方式');
  });
});

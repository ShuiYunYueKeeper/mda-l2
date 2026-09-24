/**
 * 行内样式段末 Enter：换行插到闭定界符后
 */
import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';

const { planExitTrailingMarksBreak } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/inline-mark-break.js'
));

function mdState(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: GFM })],
  });
  ensureSyntaxTree(state, doc.length);
  return state;
}

describe('planExitTrailingMarksBreak', () => {
  test('纯加粗行末 → 换行在闭 ** 之后', () => {
    const doc = '**CLI 模式：**';
    const state = mdState(doc);
    const contentEnd = doc.length - 2; // 可见文本末（闭 ** 前）
    const plan = planExitTrailingMarksBreak(doc, syntaxTree(state), contentEnd, '\n');
    expect(plan).not.toBeNull();
    expect(plan!.from).toBe(doc.length);
    expect(plan!.insert).toBe('\n');
    const next =
      doc.slice(0, plan!.from) + plan!.insert + doc.slice(plan!.from);
    expect(next).toBe('**CLI 模式：**\n');
  });

  test('已在闭定界符外不接管', () => {
    const doc = '**CLI 模式：**';
    const state = mdState(doc);
    const plan = planExitTrailingMarksBreak(doc, syntaxTree(state), doc.length, '\n');
    expect(plan).toBeNull();
  });

  test('段中回车不接管', () => {
    const doc = '**CLI 模式：**';
    const state = mdState(doc);
    const mid = doc.indexOf('模');
    const plan = planExitTrailingMarksBreak(doc, syntaxTree(state), mid, '\n');
    expect(plan).toBeNull();
  });
});

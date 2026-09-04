import * as path from 'path';
import { EditorState } from '@codemirror/state';

const { anchorFromSelection } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/anchor-from-sel.js'
));

describe('anchorFromSelection (M8-D3)', () => {
  test('空选区 → null', () => {
    const state = EditorState.create({ doc: 'hello' });
    expect(anchorFromSelection(state)).toBeNull();
  });

  test('普通选区 → UTF-16 anchor + quote', () => {
    const state = EditorState.create({
      doc: 'line one\nline two',
      selection: { anchor: 5, head: 8 },
    });
    const a = anchorFromSelection(state);
    expect(a).toEqual({ start: 5, end: 8, quote: 'one' });
  });

  test('端点落在隐藏批注行时跳过', () => {
    const doc =
      '[comment]: <> (@anno {"id":"x","content":"c","tags":[],"level":"info","status":"open","created_at":"2020-01-01T00:00:00.000Z"})\n' +
      'visible text';
    const state = EditorState.create({
      doc: doc,
      selection: { anchor: 0, head: doc.length },
    });
    const a = anchorFromSelection(state);
    expect(a).not.toBeNull();
    expect(a!.quote).toBe('visible text');
    expect(doc.slice(a!.start, a!.end)).toBe('visible text');
  });
});

/**
 * 回归：block 装饰经 StateField 提供，不得走 ViewPlugin / 函数 facet
 */
import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';

const { livePreview, createBlockDecoField, buildLayerDecos } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/live-preview.js'
));

describe('block decorations via StateField', () => {
  test('createBlockDecoField 经 decorations.from 提供（非函数 facet）', () => {
    const field = createBlockDecoField({});
    const anno =
      '[comment]: <> (@anno {"id":"1","content":"x","tags":[],"level":"info","status":"open","created_at":"2020-01-01T00:00:00.000Z"})';
    const doc = anno + '\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n';
    const state = EditorState.create({
      doc: doc,
      extensions: [markdown({ extensions: GFM }), field],
    });
    const sets = state.facet(EditorView.decorations);
    // StateField.from 注入的是 DecorationSet 值，不是 (view)=>set 函数
    expect(sets.some((d: unknown) => typeof d !== 'function')).toBe(true);
    const val = state.field(field) as { deco: unknown };
    expect(val.deco).toBeTruthy();
  });

  test('hide-line / table 进入 block 层且带 block:true', () => {
    const table = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    const text = table + '\n';
    const layers = buildLayerDecos(
      [
        { kind: 'hide-line', from: 0, to: 10 },
        {
          kind: 'widget',
          widget: 'table',
          from: 0,
          to: table.length,
          source: table,
        },
      ],
      text,
      {}
    );
    let sawBlock = false;
    layers.block.between(0, text.length + 1, (_f: number, _t: number, deco: { block?: boolean }) => {
      if (deco && deco.block) sawBlock = true;
    });
    expect(sawBlock).toBe(true);
  });

  test('livePreview 扩展可装入 EditorState', () => {
    expect(() => {
      EditorState.create({
        doc: '> note\n\n---\n',
        extensions: [markdown({ extensions: GFM }), ...livePreview({})],
      });
    }).not.toThrow();
  });
});

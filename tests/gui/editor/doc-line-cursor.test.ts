import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

describe('doc-line-cursor', () => {
  const mod = require(path.join(
    __dirname,
    '../../../src/gui/renderer/editor/doc-line-cursor.js'
  ));

  function mdView(doc: string, head: number) {
    const state = EditorState.create({
      doc,
      extensions: [markdown({ extensions: GFM })],
      selection: { anchor: head, head: head },
    });
    ensureSyntaxTree(state, doc.length);
    let dispatched: { selection: { anchor: number; head: number } } | null = null;
    const view = {
      state: state,
      dispatch: (tr: { selection: { anchor: number; head: number }; scrollIntoView?: boolean }) => {
        dispatched = tr;
      },
    };
    return { view, dispatched: () => dispatched };
  }

  const doc = {
    lines: 6,
    lineAt: (pos: number) => {
      if (pos < 10) return { number: 1, from: 0, to: 9 };
      if (pos < 20) return { number: 2, from: 10, to: 19 };
      if (pos < 30) return { number: 3, from: 20, to: 29 };
      if (pos < 40) return { number: 4, from: 30, to: 39 };
      if (pos < 50) return { number: 5, from: 40, to: 49 };
      return { number: 6, from: 50, to: 59 };
    },
    line: (n: number) => {
      const map: Record<number, { from: number; to: number }> = {
        1: { from: 0, to: 9 },
        2: { from: 10, to: 19 },
        3: { from: 20, to: 29 },
        4: { from: 30, to: 39 },
        5: { from: 40, to: 49 },
        6: { from: 50, to: 59 },
      };
      const row = map[n];
      return { number: n, from: row.from, to: row.to };
    },
  };

  test('moveCursorByDocLine 按文档行号移动', () => {
    const text = '第一行\n第二行\n';
    const line2 = text.indexOf('第二行');
    const { view, dispatched } = mdView(text, line2);
    const ok = mod.moveCursorByDocLine(view, -1, false);
    expect(ok).toBe(true);
    expect(dispatched()).toEqual({
      scrollIntoView: true,
      selection: { anchor: 0, head: 0 },
    });
  });

  test('resolveDocLineMove 块内按上键跳出到块前一行', () => {
    const block = { from: 20, to: 50 };
    const pos = mod.resolveDocLineMove(doc, 25, -1, [block]);
    expect(pos).toBe(15);
  });

  test('resolveDocLineMove 块内按下键跳出到块后一行', () => {
    const block = { from: 20, to: 50 };
    const pos = mod.resolveDocLineMove(doc, 25, 1, [block]);
    expect(pos).toBe(55);
  });

  test('resolveDocLineMove 块外按下键进入块首行', () => {
    const block = { from: 20, to: 50 };
    const pos = mod.resolveDocLineMove(doc, 15, 1, [block]);
    expect(pos).toBe(20);
  });
});

/**
 * M8-B8b：hide-mark 零宽 replace widget + atomicRanges
 */
import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';

const { livePreview, buildLayerDecos } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/live-preview.js'
));
const { atomicRangesFromBlockField } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/view/atomic-ranges.js'
));
const { createBlockDecoField } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/live-preview.js'
));

describe('M8-B8b atomic hide-mark', () => {
  test('B8b-1: hide-mark 使用 replace 零宽 widget（禁止 mark+display:none）', () => {
    const text = '# Title\n';
    const layers = buildLayerDecos(
      [{ kind: 'hide-mark', from: 0, to: 2 }],
      text,
      {}
    );
    let sawReplace = false;
    let sawMarkClassOnly = false;
    layers.hide.between(0, text.length, (_f: number, _t: number, deco: { spec?: { widget?: unknown; class?: string } }) => {
      if (deco && deco.spec && deco.spec.widget) sawReplace = true;
      if (deco && deco.spec && deco.spec.class === 'mda-cm-hide-mark' && !deco.spec.widget) {
        sawMarkClassOnly = true;
      }
    });
    expect(sawReplace).toBe(true);
    expect(sawMarkClassOnly).toBe(false);
  });

  test('B8b-2: livePreview 注册 atomicRanges facet', () => {
    const state = EditorState.create({
      doc: '# Hello\n\n**bold**',
      extensions: [markdown({ extensions: GFM }), ...livePreview({})],
    });
    const atomic = state.facet(EditorView.atomicRanges);
    expect(atomic.length).toBeGreaterThan(0);
    expect(typeof atomic[0]).toBe('function');
  });

  test('行内公式为整段 replace widget（配合 widget 层 atomic 整段 Backspace）', () => {
    const text = '见 $E=mc^2$ 式';
    const layers = buildLayerDecos(
      [
        {
          kind: 'widget',
          widget: 'math-inline',
          from: 2,
          to: 10,
          source: '$E=mc^2$',
          tex: 'E=mc^2',
        },
      ],
      text,
      {}
    );
    let from = -1;
    let to = -1;
    let hasWidget = false;
    layers.widget.between(0, text.length, (f: number, t: number, deco: { spec?: { widget?: unknown } }) => {
      if (deco && deco.spec && deco.spec.widget) {
        hasWidget = true;
        from = f;
        to = t;
      }
    });
    expect(hasWidget).toBe(true);
    expect(from).toBe(2);
    expect(to).toBe(10);
  });

  test('B8b-3: 标题语法标记被 hide-mark 覆盖', () => {
    const { buildDecorationSpecs, collectSyntaxNodes } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/build-specs.js'
    ));
    const { syntaxTree } = require('@codemirror/language');
    const text = '## Subtitle\n';
    const state = EditorState.create({
      doc: text,
      extensions: [markdown({ extensions: GFM })],
    });
    const nodes = collectSyntaxNodes(syntaxTree(state));
    const specs = buildDecorationSpecs(text, nodes);
    const hides = specs.filter((s: { kind: string }) => s.kind === 'hide-mark');
    expect(hides.length).toBeGreaterThan(0);
    const layers = buildLayerDecos(specs, text, {});
    let hideCount = 0;
    layers.hide.between(0, text.length, () => {
      hideCount += 1;
    });
    expect(hideCount).toBeGreaterThan(0);
  });

  test('B8b-4: block hide-line atomic 在 blockWidgets 关时启用', () => {
    const field = createBlockDecoField({});
    const ext = atomicRangesFromBlockField(field, function () {
      return true;
    });
    const anno =
      '[comment]: <> (@anno {"id":"1","content":"x","tags":[],"level":"info","status":"open","created_at":"2020-01-01T00:00:00.000Z"})\n\nBody';
    const state = EditorState.create({
      doc: anno,
      extensions: [markdown({ extensions: GFM }), field, ext],
    });
    const atomic = state.facet(EditorView.atomicRanges);
    expect(atomic.length).toBeGreaterThan(0);
  });
});

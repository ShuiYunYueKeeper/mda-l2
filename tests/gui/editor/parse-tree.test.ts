/**
 * M8-C1：大文档须用 ensureSyntaxTree 返回值，否则 Image 节点缺失。
 */
import * as fs from 'fs';
import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';

const { parseTreeForState } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/live-preview.js'
));
const { collectSyntaxNodes, buildDecorationSpecs } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/model/build-specs.js'
));

describe('parseTreeForState', () => {
  test('分享稿 demo：ensure 树覆盖图片行，生成 image widget', () => {
    const demoPath = path.join(__dirname, '../../../docs/demo/我带AI做工程-MDA人机协作分享.md');
    if (!fs.existsSync(demoPath)) {
      return;
    }
    const text = fs.readFileSync(demoPath, 'utf8');
    const state = EditorState.create({
      doc: text,
      extensions: [markdown({ extensions: GFM })],
    });
    const incremental = syntaxTree(state);
    const tree = parseTreeForState(state, text.length);
    expect(incremental.length).toBeLessThan(text.length);
    expect(tree.length).toBeGreaterThan(incremental.length);

    const nodes = collectSyntaxNodes(tree);
    const images = nodes.filter((n: { type: string }) => n.type === 'Image');
    expect(images.length).toBeGreaterThanOrEqual(10);

    const specs = buildDecorationSpecs(text, nodes, [], {
      fullHide: true,
      widgetEnabled: function (kind: string) {
        return kind === 'image';
      },
    });
    expect(specs.filter((s: { widget?: string }) => s.widget === 'image').length).toBe(
      images.length
    );
  });
});

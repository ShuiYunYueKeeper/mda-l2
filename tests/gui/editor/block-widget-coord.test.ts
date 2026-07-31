/**
 * M8-C1 / COORD-5：块 widget 高度估计与装饰层过滤
 */
import * as path from 'path';

jest.mock('../../../src/gui/renderer/editor/config.js', () => {
  const actual = jest.requireActual('../../../src/gui/renderer/editor/config.js');
  return Object.assign({}, actual, {
    blockWidgetEnabled: function (kind: string) {
      return kind === 'table' || kind === 'code' || kind === 'image' || kind === 'mermaid' || kind === 'hr';
    },
    blockWidgetsEnabled: function () {
      return true;
    },
  });
});

const {
  countSourceLines,
  BlockReplaceWidget,
  DEFAULT_LINE_HEIGHT,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/widgets/block-widget-base'));
const { TableWidget } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/table.js'
));
const { buildLayerDecos } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/live-preview.js'
));

describe('block-widget-base', () => {
  test('countSourceLines 统计换行', () => {
    expect(countSourceLines('a\nb\nc')).toBe(3);
    expect(countSourceLines('')).toBe(1);
  });

  test('BlockReplaceWidget estimatedHeight 至少覆盖源码行数', () => {
    const w = new BlockReplaceWidget('line1\nline2\nline3', { lineHeight: 26 });
    expect(w.estimatedHeight).toBeGreaterThanOrEqual(3 * DEFAULT_LINE_HEIGHT);
  });

  test('TableWidget estimatedHeight 大于纯行高估计', () => {
    const src = '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |';
    const w = new TableWidget(src, { lineHeight: 26 });
    expect(w.estimatedHeight).toBeGreaterThan(4 * DEFAULT_LINE_HEIGHT);
  });

  test('TableWidget estimatedHeight caps insane layout meta', () => {
    const { parseGfmTable, serializeGfmTableBlock } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/parse-table.js'
    ));
    const parsed = parseGfmTable('| h |\n| - |\n| x |');
    parsed.rowHeights = [50000, 50000];
    const src = serializeGfmTableBlock(parsed);
    const w = new TableWidget(src, { lineHeight: 26 });
    expect(w.estimatedHeight).toBeLessThan(2000);
  });

  test('TableWidget.eq 须同时比较 from/to，避免文档映射后复用错位实例', () => {
    const src = '| a |\n| - |\n| 1 |';
    const a = new TableWidget(src, { from: 0, to: src.length });
    const b = new TableWidget(src, { from: 10, to: 10 + src.length });
    expect(a.eq(b)).toBe(false);
    expect(a.eq(new TableWidget(src, { from: 0, to: src.length }))).toBe(true);
  });
});

describe('highlightFenceBody', () => {
  const { highlightFenceBody } = require(path.join(
    __dirname,
    '../../../src/gui/renderer/editor/widgets/code.js'
  ));

  test('highlightCode 返回 null 时回退为转义纯文本', () => {
    const html = highlightFenceBody('a < b', 'js', function () {
      return null;
    });
    expect(html).toBe('a &lt; b');
  });
});

describe('buildLayerDecos block overlap', () => {
  test('块 widget 区间内不再叠加 inline hide-mark', () => {
    const tableSrc = '| h |\n| - |\n| x |';
    const text = tableSrc + '\n';
    const layers = buildLayerDecos(
      [
        {
          kind: 'widget',
          widget: 'table',
          from: 0,
          to: text.length - 1,
          source: tableSrc,
        },
        {
          kind: 'hide-mark',
          from: 2,
          to: 3,
        },
      ],
      text,
      {}
    );
    let hideCount = 0;
    layers.hide.between(0, text.length, () => {
      hideCount += 1;
    });
    expect(hideCount).toBe(0);
    let blockCount = 0;
    layers.block.between(0, text.length, () => {
      blockCount += 1;
    });
    expect(blockCount).toBeGreaterThan(0);
  });
});

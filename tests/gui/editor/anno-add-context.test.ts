import * as path from 'path';

const {
  blockKindAtPos,
  canUseSelectionAnnoForRange,
  isBlockOnlyKind,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/model/anno-add-context.js'));

describe('anno add context', () => {
  test('blockKindAtPos 识别标题与正文', () => {
    const text = '# Title\n\nBody text\n';
    expect(blockKindAtPos(text, 2)).toBe('heading');
    expect(blockKindAtPos(text, text.indexOf('Body'))).toBe('prose');
  });

  test('blockKindAtPos 识别围栏代码与 mermaid', () => {
    const code = '```js\nx\n```\n';
    expect(blockKindAtPos(code, code.indexOf('x'))).toBe('code');
    const mermaid = '```mermaid\ngraph TD\nA-->B\n```\n';
    expect(blockKindAtPos(mermaid, mermaid.indexOf('graph'))).toBe('mermaid');
  });

  test('blockKindAtPos 识别图片行与分割线', () => {
    const img = '![alt](a.png)\n';
    expect(blockKindAtPos(img, 1)).toBe('image');
    const hr = '---\n';
    expect(blockKindAtPos(hr, 0)).toBe('hr');
  });

  test('canUseSelectionAnnoForRange 拒绝块内选区', () => {
    const code = '```\nsecret\n```\n';
    const from = code.indexOf('secret');
    const to = from + 'secret'.length;
    expect(canUseSelectionAnnoForRange(code, from, to)).toBe(false);
    expect(canUseSelectionAnnoForRange('Hello world', 0, 5)).toBe(true);
  });

  test('isBlockOnlyKind', () => {
    expect(isBlockOnlyKind('code')).toBe(true);
    expect(isBlockOnlyKind('heading')).toBe(false);
  });
});

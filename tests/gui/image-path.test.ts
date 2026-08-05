/**
 * 图片路径 href 解码
 */
import * as path from 'path';

const { decodePathHref } = require(path.join(__dirname, '../../src/gui/main/image-path.js'));

describe('image-path decodePathHref', () => {
  test('解码 markdown-it 渲染后的中文路径', () => {
    expect(decodePathHref('./assets/%E5%9B%BE%E7%89%87.png')).toBe('./assets/图片.png');
    expect(decodePathHref('D:/test/%E5%9B%BE%E7%89%87.png')).toBe('D:/test/图片.png');
  });

  test('无编码时原样返回', () => {
    expect(decodePathHref('./assets/图片.png')).toBe('./assets/图片.png');
    expect(decodePathHref('plain.png')).toBe('plain.png');
  });

  test('非法 percent 序列保持原样', () => {
    expect(decodePathHref('100%done.png')).toBe('100%done.png');
  });

  test('isPreserveFormatImageSrc 识别编码后的 gif/webp', () => {
    const { isPreserveFormatImageSrc } = require(path.join(
      __dirname,
      '../../src/gui/main/image-path.js'
    ));
    expect(isPreserveFormatImageSrc('./assets/%E5%9B%BE.gif')).toBe(true);
    expect(isPreserveFormatImageSrc('file:///D:/x/%E5%9B%BE.gif')).toBe(true);
    expect(isPreserveFormatImageSrc('./assets/photo.png')).toBe(false);
  });
});

describe('image-path resolvePath 集成', () => {
  test('percent-encoded 相对路径可解析到中文文件名', () => {
    const nodePath = require('path');
    const base = 'D:/docs/note.md';
    const href = decodePathHref('./assets/%E5%9B%BE%E7%89%87.png');
    const abs = nodePath.resolve(nodePath.dirname(base), href);
    expect(abs).toBe(nodePath.resolve('D:/docs/assets/图片.png'));
  });
});

/**
 * clipboard-image 原格式判定
 */
import * as path from 'path';

jest.mock('electron', () => ({
  clipboard: {
    clear: jest.fn(),
    writeBuffer: jest.fn(),
    writeImage: jest.fn(),
    has: jest.fn(() => false),
    readBuffer: jest.fn(),
    readImage: jest.fn(() => ({ isEmpty: () => true })),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { shouldPreserveOriginal } = require(path.join(
  __dirname,
  '../../src/gui/main/clipboard-image.js'
));

describe('clipboard-image preserve format', () => {
  test('shouldPreserveOriginal 识别 gif/webp/svg', () => {
    expect(shouldPreserveOriginal('a.gif')).toBe(true);
    expect(shouldPreserveOriginal('image/gif')).toBe(true);
    expect(shouldPreserveOriginal('data:image/gif;base64,xx')).toBe(true);
    expect(shouldPreserveOriginal('a.webp')).toBe(true);
    expect(shouldPreserveOriginal('a.png')).toBe(false);
    expect(shouldPreserveOriginal('data:image/png;base64,xx')).toBe(false);
  });
});

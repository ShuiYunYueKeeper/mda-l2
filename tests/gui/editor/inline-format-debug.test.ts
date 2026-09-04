import * as path from 'path';

const inlineDbg = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/inline-format-debug.js'
));

describe('inline-format-debug', () => {
  test('默认关闭时不输出', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    inlineDbg.log('test.event', { foo: 1 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

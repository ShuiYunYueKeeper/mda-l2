/**
 * M8-A4：ModeSwitchState 骨架
 */
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  getFirstVisibleLine,
  saveModeSwitchState,
  restoreModeSwitchState,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/state/mode-switch.js'));

describe('ModeSwitchState (M8-A4)', () => {
  test('save/restore preserves selection anchor/head', () => {
    const snap = { line: 3, anchor: 10, head: 15 };
    const view = {
      scrollDOM: { scrollTop: 0 },
      lineBlockAtHeight: () => ({ from: 0 }),
      state: {
        doc: {
          lines: 5,
          line: (n: number) => ({ number: n, from: (n - 1) * 10, to: n * 10 }),
          lineAt: () => ({ number: 1 }),
        },
        selection: { main: { anchor: 0, head: 0 } },
      },
      dispatch: jest.fn(),
    };
    restoreModeSwitchState(view, snap);
    expect(view.dispatch).toHaveBeenCalled();
    const arg = view.dispatch.mock.calls[0][0];
    expect(arg.selection).toEqual({ anchor: 10, head: 15 });
  });

  test('saveModeSwitchState captures line and selection', () => {
    const view = {
      scrollDOM: { scrollTop: 42 },
      lineBlockAtHeight: () => ({ from: 20 }),
      state: {
        doc: {
          lineAt: () => ({ number: 4 }),
        },
        selection: { main: { anchor: 5, head: 8 } },
      },
    };
    expect(saveModeSwitchState(view)).toEqual({ line: 4, anchor: 5, head: 8 });
    expect(getFirstVisibleLine(view)).toBe(4);
  });
});

/**
 * editor/pref.js — 预览编辑默认开关
 *
 * 默认值是产品形态的一部分（打开即所见即所得），这里把它钉死，
 * 避免回退开关被误当成「实验特性默认关」改回去。
 */
import * as path from 'path';

const PREF_PATH = path.join(__dirname, '../../../src/gui/renderer/editor/pref.js');

function loadPref(store: Record<string, string> | null, forced = false) {
  jest.resetModules();
  const g: any = global;
  g.window = { mdaAPI: { cm6Forced: forced } };
  g.localStorage = store
    ? {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
      }
    : undefined;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(PREF_PATH);
}

afterEach(() => {
  const g: any = global;
  delete g.window;
  delete g.localStorage;
});

describe('预览编辑开关偏好', () => {
  test('未表态时默认启用预览编辑', () => {
    expect(loadPref({}).isEnabledByPref()).toBe(true);
  });

  test('空串视为未表态', () => {
    expect(loadPref({ 'mda-cm6': '' }).isEnabledByPref()).toBe(true);
  });

  test('显式 0 / false 才回退 2.0 源码编辑面', () => {
    expect(loadPref({ 'mda-cm6': '0' }).isEnabledByPref()).toBe(false);
    expect(loadPref({ 'mda-cm6': 'false' }).isEnabledByPref()).toBe(false);
  });

  test('显式 1 / true 保持启用', () => {
    expect(loadPref({ 'mda-cm6': '1' }).isEnabledByPref()).toBe(true);
    expect(loadPref({ 'mda-cm6': 'true' }).isEnabledByPref()).toBe(true);
  });

  test('localStorage 不可用时仍按默认启用', () => {
    expect(loadPref(null).isEnabledByPref()).toBe(true);
  });

  test('preload 的 cm6Forced 压过已写入的回退值', () => {
    expect(loadPref({ 'mda-cm6': '0' }, true).isEnabledByPref()).toBe(true);
  });

  test('setEnabledPref 写入 1 / 0', () => {
    const store: Record<string, string> = {};
    const pref = loadPref(store);
    pref.setEnabledPref(false);
    expect(store['mda-cm6']).toBe('0');
    pref.setEnabledPref(true);
    expect(store['mda-cm6']).toBe('1');
  });
});

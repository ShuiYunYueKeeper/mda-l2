/**
 * License / feature-gate 单元测试（纯 Node，不依赖 Electron）。
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const license = require('../../src/pro/license');
const gate = require('../../src/pro/feature-gate');

describe('pro/license', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-lic-'));

  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  });

  test('mint + verify valid key', () => {
    const key = license.mintLicense({ exp: null, lid: 'test-lid' });
    const r = license.verifyLicenseKey(key);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.tier).toBe('pro');
      expect(r.payload.lid).toBe('test-lid');
    }
  });

  test('rejects tampered key', () => {
    const key = license.mintLicense({});
    const parts = key.split('.');
    parts[2] = parts[2].slice(0, -4) + 'xxxx';
    const r = license.verifyLicenseKey(parts.join('.'));
    expect(r.ok).toBe(false);
  });

  test('rejects expired key', () => {
    const key = license.mintLicense({ exp: 1000 });
    const r = license.verifyLicenseKey(key, { now: 2000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/过期/);
  });

  test('activate / status / clear', () => {
    const key = license.mintLicense({ lid: 'act-1' });
    const act = license.activateLicense(tmp, key);
    expect(act.success).toBe(true);
    const st = license.getLicenseStatus(tmp, { env: {} });
    expect(st.isPro).toBe(true);
    expect(st.valid).toBe(true);
    expect(st.licenseId).toBe('act-1');

    const cleared = license.clearLicense(tmp);
    expect(cleared.success).toBe(true);
    const st2 = license.getLicenseStatus(tmp, { env: {} });
    expect(st2.isPro).toBe(false);
  });

  test('inactive without a stored key', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-lic-empty-'));
    const st = license.getLicenseStatus(empty, {});
    expect(st.isPro).toBe(false);
    expect(st.reason).toBe('inactive');
    expect(st.source).toBe('none');
    fs.rmSync(empty, { recursive: true, force: true });
  });

  test('rejects invalid activate', () => {
    const r = license.activateLicense(tmp, 'not-a-key');
    expect(r.success).toBe(false);
  });
});

describe('pro/feature-gate', () => {
  test('Free → upgrade', () => {
    const r = gate.checkAiAccess(
      { isPro: false, valid: false, reason: 'inactive' },
      { hasKey: true },
    );
    expect(r).toEqual({ allowed: false, reason: 'upgrade' });
  });

  test('Pro without key → need_key', () => {
    const r = gate.checkAiAccess(
      { isPro: true, valid: true, reason: 'ok' },
      { hasKey: false },
    );
    expect(r).toEqual({ allowed: false, reason: 'need_key' });
  });

  test('Pro with key → ok', () => {
    const r = gate.checkAiAccess(
      { isPro: true, valid: true, reason: 'ok' },
      { hasKey: true },
    );
    expect(r).toEqual({ allowed: true, reason: 'ok' });
  });
});

describe('pro/ai/provider sanitize', () => {
  const provider = require('../../src/pro/ai/provider');

  test('strips sk- keys from errors', () => {
    const msg = provider.sanitizeAiError({
      message: 'auth failed sk-abcdefghijklmnopqrstuvwxyz123456 Bearer tok',
    });
    expect(msg).not.toMatch(/sk-[a-z]/);
    expect(msg).toContain('sk-***');
    expect(msg).toContain('Bearer ***');
  });
});

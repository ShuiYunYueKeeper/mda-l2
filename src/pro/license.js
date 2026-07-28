/**
 * Pro 离线 License（HMAC-SHA256）。
 * 格式：MDA1.<base64url(payloadJSON)>.<base64url(hmac)>
 * payload: { v:1, tier:'pro', iat:number, exp:number|null, lid:string }
 *
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENSE_FILENAME = 'mda-license.json';
const PREFIX = 'MDA1';

/** @type {Buffer} 签发与校验共用；发正式版前务必轮换 */
function readHmacSecret() {
  try {
    const mod = require('./license-secret');
    const raw = mod && typeof mod.secret === 'string' ? mod.secret : '';
    if (raw.length < 16) return null;
    return Buffer.from(raw, 'utf8');
  } catch (_) {
    return null;
  }
}

function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecode(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64');
}

function licenseFilePath(userDataPath) {
  return path.join(userDataPath, LICENSE_FILENAME);
}

function signPayloadSegment(segment) {
  const secret = readHmacSecret();
  if (!secret) {
    const err = new Error('missing local license secret');
    err.code = 'E_NO_LICENSE_SECRET';
    throw err;
  }
  return crypto.createHmac('sha256', secret).update(String(segment), 'utf8').digest();
}

/**
 * 签发激活码（仅 scripts / 测试使用；正式分发勿把此能力暴露给渲染层）。
 * @param {{ exp?: number|null, lid?: string, iat?: number }} [opts]
 */
function mintLicense(opts) {
  const o = opts || {};
  const payload = {
    v: 1,
    tier: 'pro',
    iat: typeof o.iat === 'number' ? o.iat : Math.floor(Date.now() / 1000),
    exp: o.exp === undefined ? null : o.exp,
    lid: o.lid || crypto.randomUUID(),
  };
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64urlEncode(signPayloadSegment(body));
  return `${PREFIX}.${body}.${sig}`;
}

/**
 * @param {string} key
 * @param {{ now?: number }} [opts] now = unix seconds
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
function verifyLicenseKey(key, opts) {
  const now = (opts && typeof opts.now === 'number')
    ? opts.now
    : Math.floor(Date.now() / 1000);
  const raw = String(key || '').trim();
  if (!raw) return { ok: false, error: '激活码为空' };

  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return { ok: false, error: '激活码格式无效' };
  }
  const [, body, sigB64] = parts;
  let sig;
  try {
    sig = b64urlDecode(sigB64);
  } catch (_) {
    return { ok: false, error: '激活码签名无效' };
  }
  let expected;
  try {
    expected = signPayloadSegment(body);
  } catch (_) {
    return { ok: false, error: '激活码无效或已被篡改' };
  }
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    return { ok: false, error: '激活码无效或已被篡改' };
  }

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch (_) {
    return { ok: false, error: '激活码载荷损坏' };
  }
  if (!payload || payload.v !== 1 || payload.tier !== 'pro') {
    return { ok: false, error: '不支持的激活码类型' };
  }
  if (payload.exp != null) {
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp) || exp <= now) {
      return { ok: false, error: '激活码已过期' };
    }
  }
  return { ok: true, payload };
}

function readStoredKey(userDataPath) {
  try {
    const p = licenseFilePath(userDataPath);
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data && typeof data.key === 'string' ? data.key : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} userDataPath
 * @param {{ now?: number, env?: NodeJS.ProcessEnv }} [opts]
 */
function getLicenseStatus(userDataPath, opts) {
  const key = readStoredKey(userDataPath);
  if (!key) {
    return {
      isPro: false,
      valid: false,
      reason: 'inactive',
      expiresAt: null,
      licenseId: null,
      source: 'none',
    };
  }

  const verified = verifyLicenseKey(key, { now: opts && opts.now });
  if (!verified.ok) {
    return {
      isPro: false,
      valid: false,
      reason: verified.error === '激活码已过期' ? 'expired' : 'invalid',
      expiresAt: null,
      licenseId: null,
      source: 'file',
      message: verified.error,
    };
  }

  const exp = verified.payload.exp == null ? null : Number(verified.payload.exp);
  return {
    isPro: true,
    valid: true,
    reason: 'ok',
    expiresAt: exp,
    licenseId: verified.payload.lid || null,
    source: 'file',
  };
}

/**
 * @param {string} userDataPath
 * @param {string} key
 */
function activateLicense(userDataPath, key) {
  const verified = verifyLicenseKey(key);
  if (!verified.ok) {
    return { success: false, error: verified.error };
  }
  const file = licenseFilePath(userDataPath);
  const record = {
    key: String(key).trim(),
    activatedAt: new Date().toISOString(),
    lid: verified.payload.lid || null,
    exp: verified.payload.exp == null ? null : verified.payload.exp,
  };
  fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf8');
  return {
    success: true,
    value: getLicenseStatus(userDataPath),
  };
}

function clearLicense(userDataPath) {
  const file = licenseFilePath(userDataPath);
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    return { success: false, error: err.message };
  }
  return { success: true, value: getLicenseStatus(userDataPath) };
}

module.exports = {
  PREFIX,
  mintLicense,
  verifyLicenseKey,
  getLicenseStatus,
  activateLicense,
  clearLicense,
  licenseFilePath,
};

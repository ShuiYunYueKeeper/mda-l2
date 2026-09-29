/**
 * AI Provider 配置（main 进程）。Key 经 Electron safeStorage 加密后写入 userData。
 * 渲染层只可见 hasKey，永不持有明文。
 *
 * V2：按 Provider 分桶（baseUrl / apiKeyEnc / models / defaultModelId），切换 Provider 不覆盖另一桶；
 * 读取 M7 单字段格式时自动迁移。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = 'ai-settings.json';
const SETTINGS_VERSION = 2;

const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat'],
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    models: [],
  },
};

const OUTPUT_LANGS = ['auto', 'zh', 'en'];
const MODEL_SOURCES = ['preset', 'fetched', 'manual'];
const DEFAULT_PREFS = { outputLang: 'auto', longTextConfirmChars: 20000 };

function settingsPath(userDataPath) {
  return path.join(userDataPath, SETTINGS_FILE);
}

function normalizeProvider(id) {
  const p = String(id || 'openai').toLowerCase();
  return PROVIDERS[p] ? p : 'openai';
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/** model id 只允许可见 ASCII，防止把换行/控制字符写进请求体 */
function normalizeModelId(id) {
  const s = String(id || '').trim();
  return /^[\x21-\x7e]{1,128}$/.test(s) ? s : '';
}

/**
 * @typedef {{ id: string, label?: string, enabled: boolean, source: 'preset'|'fetched'|'manual' }} AiModelEntry
 */

/**
 * 去重、剔除非法项；默认模型必须指向已启用项，否则回退到第一个已启用项。
 * @param {unknown} models
 * @param {unknown} defaultModelId
 * @returns {{ models: AiModelEntry[], defaultModelId: string }}
 */
function normalizeModels(models, defaultModelId) {
  const out = [];
  const seen = new Set();
  for (const m of Array.isArray(models) ? models : []) {
    const id = normalizeModelId(m && /** @type {any} */ (m).id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const src = MODEL_SOURCES.indexOf(/** @type {any} */ (m).source) >= 0 ? /** @type {any} */ (m).source : 'manual';
    /** @type {AiModelEntry} */
    const entry = { id, enabled: /** @type {any} */ (m).enabled !== false, source: src };
    const label = typeof (/** @type {any} */ (m).label) === 'string' ? /** @type {any} */ (m).label.trim().slice(0, 120) : '';
    if (label && label !== id) entry.label = label;
    out.push(entry);
  }
  const want = normalizeModelId(defaultModelId);
  const enabled = out.filter((m) => m.enabled);
  const def = enabled.find((m) => m.id === want) ? want : (enabled[0] ? enabled[0].id : '');
  return { models: out, defaultModelId: def };
}

/**
 * 获取列表结果合并入已有列表：已存在 id 不重复、不改其启用态；新项默认启用。
 * @param {AiModelEntry[]} existing
 * @param {Array<{ id: string, label?: string }>} fetched
 * @returns {{ models: AiModelEntry[], added: number }}
 */
function mergeFetchedModels(existing, fetched) {
  const list = (existing || []).slice();
  const seen = new Set(list.map((m) => m.id));
  let added = 0;
  for (const f of fetched || []) {
    const id = normalizeModelId(f && f.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    /** @type {AiModelEntry} */
    const entry = { id, enabled: true, source: 'fetched' };
    if (f.label) entry.label = String(f.label);
    list.push(entry);
    added += 1;
  }
  return { models: list, added };
}

function presetBucket(providerId) {
  const preset = PROVIDERS[providerId];
  const models = preset.models.map((id) => ({ id, enabled: true, source: 'preset' }));
  return {
    baseUrl: preset.baseUrl,
    models,
    defaultModelId: models[0] ? models[0].id : '',
  };
}

function normalizePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const outputLang = OUTPUT_LANGS.indexOf(p.outputLang) >= 0 ? p.outputLang : DEFAULT_PREFS.outputLang;
  const n = Number(p.longTextConfirmChars);
  const longTextConfirmChars = Number.isFinite(n) && n >= 1000 ? Math.min(Math.floor(n), 1000000) : DEFAULT_PREFS.longTextConfirmChars;
  return { outputLang, longTextConfirmChars };
}

/**
 * 任意历史格式 → V2 结构（不含解密）。
 * @param {any} raw
 */
function migrate(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (src.version === SETTINGS_VERSION && src.providers && typeof src.providers === 'object') {
    const providers = {};
    for (const id of Object.keys(PROVIDERS)) {
      const b = src.providers[id];
      if (!b || typeof b !== 'object') {
        providers[id] = presetBucket(id);
        continue;
      }
      const norm = normalizeModels(b.models, b.defaultModelId);
      providers[id] = {
        baseUrl: typeof b.baseUrl === 'string' ? normalizeBaseUrl(b.baseUrl) : PROVIDERS[id].baseUrl,
        models: norm.models,
        defaultModelId: norm.defaultModelId,
      };
      if (b.apiKeyEnc && b.apiKeyEnc.data) providers[id].apiKeyEnc = b.apiKeyEnc;
    }
    return {
      version: SETTINGS_VERSION,
      provider: normalizeProvider(src.provider),
      providerEnabled: src.providerEnabled !== false,
      providers,
      prefs: normalizePrefs(src.prefs),
    };
  }

  // M7：{ provider, baseUrl, model, apiKeyEnc }
  const provider = normalizeProvider(src.provider);
  const providers = {};
  for (const id of Object.keys(PROVIDERS)) providers[id] = presetBucket(id);
  const cur = providers[provider];
  if (typeof src.baseUrl === 'string' && src.baseUrl.trim()) cur.baseUrl = normalizeBaseUrl(src.baseUrl);
  const oldModel = normalizeModelId(src.model);
  if (oldModel) {
    const rest = cur.models.filter((m) => m.id !== oldModel);
    cur.models = [{ id: oldModel, enabled: true, source: 'preset' }, ...rest];
    cur.defaultModelId = oldModel;
  }
  if (src.apiKeyEnc && src.apiKeyEnc.data) cur.apiKeyEnc = src.apiKeyEnc;
  return {
    version: SETTINGS_VERSION,
    provider,
    providerEnabled: true,
    providers,
    prefs: normalizePrefs(null),
  };
}

function readRaw(userDataPath) {
  try {
    const p = settingsPath(userDataPath);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeRaw(userDataPath, data) {
  const target = settingsPath(userDataPath);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw err;
  }
}

/**
 * @param {{ userDataPath: string, safeStorage: { isEncryptionAvailable: () => boolean, encryptString: (s: string) => Buffer, decryptString: (b: Buffer) => string } }} deps
 */
function createAiSettingsStore(deps) {
  const { userDataPath, safeStorage } = deps;

  function encryptKey(plain) {
    if (!plain) return null;
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
      // 无 OS 加密时退回 base64（仍不把明文写盘）；日志不得打印
      return { enc: 'b64', data: Buffer.from(String(plain), 'utf8').toString('base64') };
    }
    const buf = safeStorage.encryptString(String(plain));
    return { enc: 'safe', data: Buffer.from(buf).toString('base64') };
  }

  function decryptKey(blob) {
    if (!blob || !blob.data) return null;
    try {
      if (blob.enc === 'safe') {
        if (!safeStorage || !safeStorage.isEncryptionAvailable()) return null;
        return safeStorage.decryptString(Buffer.from(blob.data, 'base64'));
      }
      if (blob.enc === 'b64') {
        return Buffer.from(blob.data, 'base64').toString('utf8');
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  function load() {
    return migrate(readRaw(userDataPath));
  }

  function publicBucket(b) {
    return {
      baseUrl: b.baseUrl,
      hasKey: !!(b.apiKeyEnc && b.apiKeyEnc.data),
      models: b.models.map((m) => ({ ...m })),
      defaultModelId: b.defaultModelId,
    };
  }

  function getPublicSettings() {
    const s = load();
    const cur = s.providers[s.provider];
    const buckets = {};
    for (const id of Object.keys(PROVIDERS)) buckets[id] = publicBucket(s.providers[id]);
    return {
      provider: s.provider,
      providerEnabled: s.providerEnabled,
      ...publicBucket(cur),
      buckets,
      prefs: { ...s.prefs },
      providerList: Object.keys(PROVIDERS).map((id) => ({
        id,
        label: PROVIDERS[id].label,
        defaultBaseUrl: PROVIDERS[id].baseUrl,
      })),
    };
  }

  /**
   * @param {string} [providerId] 缺省为当前 Provider
   */
  function getApiKeyPlain(providerId) {
    const s = load();
    const id = providerId ? normalizeProvider(providerId) : s.provider;
    return decryptKey(s.providers[id].apiKeyEnc);
  }

  /**
   * 发起请求所需的完整配置；modelId 覆盖须指向已启用模型。
   * @param {{ modelId?: string }} [opts]
   * @returns {{ baseUrl: string, apiKey: string|null, model: string, modelAllowed: boolean }}
   */
  function resolveRequestConfig(opts) {
    const s = load();
    const b = s.providers[s.provider];
    const want = opts && opts.modelId ? normalizeModelId(opts.modelId) : '';
    const model = want || b.defaultModelId;
    const modelAllowed = !!b.models.find((m) => m.id === model && m.enabled);
    return {
      baseUrl: b.baseUrl,
      apiKey: decryptKey(b.apiKeyEnc),
      model,
      modelAllowed,
    };
  }

  /**
   * @param {{
   *   provider?: string,
   *   providerEnabled?: boolean,
   *   prefs?: { outputLang?: string, longTextConfirmChars?: number },
   *   buckets?: Record<string, { baseUrl?: string, models?: AiModelEntry[], defaultModelId?: string, apiKey?: string, clearKey?: boolean }>,
   * }} patch
   */
  function saveSettings(patch) {
    const p = patch && typeof patch === 'object' ? patch : {};
    const s = load();
    if (p.provider != null) s.provider = normalizeProvider(p.provider);
    if (p.providerEnabled != null) s.providerEnabled = !!p.providerEnabled;
    if (p.prefs) s.prefs = normalizePrefs({ ...s.prefs, ...p.prefs });
    if (p.buckets && typeof p.buckets === 'object') {
      for (const rawId of Object.keys(p.buckets)) {
        if (!PROVIDERS[rawId]) continue;
        const bp = p.buckets[rawId] || {};
        const b = s.providers[rawId];
        if (bp.baseUrl != null) b.baseUrl = normalizeBaseUrl(bp.baseUrl);
        if (bp.models != null || bp.defaultModelId != null) {
          const norm = normalizeModels(
            bp.models != null ? bp.models : b.models,
            bp.defaultModelId != null ? bp.defaultModelId : b.defaultModelId,
          );
          b.models = norm.models;
          b.defaultModelId = norm.defaultModelId;
        }
        if (bp.clearKey) {
          delete b.apiKeyEnc;
        } else if (bp.apiKey != null && String(bp.apiKey).trim()) {
          b.apiKeyEnc = encryptKey(String(bp.apiKey).trim());
        }
      }
    }
    writeRaw(userDataPath, s);
    return { success: true, value: getPublicSettings() };
  }

  return {
    getPublicSettings,
    getApiKeyPlain,
    resolveRequestConfig,
    saveSettings,
    PROVIDERS,
  };
}

module.exports = {
  PROVIDERS,
  SETTINGS_VERSION,
  OUTPUT_LANGS,
  createAiSettingsStore,
  settingsPath,
  normalizeProvider,
  normalizeModelId,
  normalizeModels,
  mergeFetchedModels,
  migrate,
};

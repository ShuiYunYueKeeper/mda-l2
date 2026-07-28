/**
 * AI Provider 配置（main 进程）。Key 经 Electron safeStorage 加密后写入 userData。
 * 渲染层只可见 hasKey，永不持有明文。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = 'ai-settings.json';

const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    model: '',
  },
};

function settingsPath(userDataPath) {
  return path.join(userDataPath, SETTINGS_FILE);
}

function normalizeProvider(id) {
  const p = String(id || 'openai').toLowerCase();
  return PROVIDERS[p] ? p : 'openai';
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
  fs.writeFileSync(settingsPath(userDataPath), JSON.stringify(data, null, 2), 'utf8');
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

  function getPublicSettings() {
    const raw = readRaw(userDataPath) || {};
    const provider = normalizeProvider(raw.provider);
    const preset = PROVIDERS[provider];
    const baseUrl = typeof raw.baseUrl === 'string' && raw.baseUrl.trim()
      ? raw.baseUrl.trim().replace(/\/+$/, '')
      : preset.baseUrl;
    const model = typeof raw.model === 'string' && raw.model.trim()
      ? raw.model.trim()
      : preset.model;
    const hasKey = !!(raw.apiKeyEnc && raw.apiKeyEnc.data);
    return {
      provider,
      baseUrl,
      model,
      hasKey,
      providers: Object.keys(PROVIDERS).map((id) => ({
        id,
        label: PROVIDERS[id].label,
        defaultBaseUrl: PROVIDERS[id].baseUrl,
        defaultModel: PROVIDERS[id].model,
      })),
    };
  }

  function getApiKeyPlain() {
    const raw = readRaw(userDataPath);
    if (!raw || !raw.apiKeyEnc) return null;
    return decryptKey(raw.apiKeyEnc);
  }

  /**
   * @param {{ provider?: string, baseUrl?: string, model?: string, apiKey?: string, clearKey?: boolean }} patch
   */
  function saveSettings(patch) {
    const raw = readRaw(userDataPath) || {};
    const next = { ...raw };
    if (patch.provider != null) next.provider = normalizeProvider(patch.provider);
    if (patch.baseUrl != null) next.baseUrl = String(patch.baseUrl).trim().replace(/\/+$/, '');
    if (patch.model != null) next.model = String(patch.model).trim();
    if (patch.clearKey) {
      delete next.apiKeyEnc;
    } else if (patch.apiKey != null && String(patch.apiKey).trim()) {
      next.apiKeyEnc = encryptKey(String(patch.apiKey).trim());
    }
    // 切换到预设时若 baseUrl/model 为空则填默认
    const provider = normalizeProvider(next.provider);
    const preset = PROVIDERS[provider];
    if (provider !== 'custom') {
      if (!next.baseUrl) next.baseUrl = preset.baseUrl;
      if (!next.model) next.model = preset.model;
    }
    writeRaw(userDataPath, next);
    return { success: true, value: getPublicSettings() };
  }

  return {
    getPublicSettings,
    getApiKeyPlain,
    saveSettings,
    PROVIDERS,
  };
}

module.exports = {
  PROVIDERS,
  createAiSettingsStore,
  settingsPath,
  normalizeProvider,
};

/**
 * Pro 功能门禁。任一级不通过即拒绝，调用方须保证拒绝时零网络请求。
 */
'use strict';

const { getLicenseStatus } = require('./license');

/** 门禁顺序即检查顺序；reason 由渲染层映射为 i18n 提示与「去设置」动作 */
const AI_GATE_REASONS = ['upgrade', 'provider_off', 'need_key', 'no_model', 'default_disabled'];

/**
 * @param {ReturnType<typeof getLicenseStatus>} status
 */
function isProActive(status) {
  return !!(status && status.isPro && status.valid);
}

/**
 * @param {ReturnType<typeof getLicenseStatus>} status
 * @param {{ providerEnabled?: boolean, hasKey?: boolean, models?: Array<{id: string, enabled: boolean}>, defaultModelId?: string }|null} ai
 * @returns {{ allowed: boolean, reason: 'ok'|'upgrade'|'provider_off'|'need_key'|'no_model'|'default_disabled' }}
 */
function checkAiAccess(status, ai) {
  if (!isProActive(status)) return { allowed: false, reason: 'upgrade' };
  const s = ai || {};
  if (s.providerEnabled === false) return { allowed: false, reason: 'provider_off' };
  if (!s.hasKey) return { allowed: false, reason: 'need_key' };
  const models = Array.isArray(s.models) ? s.models : [];
  const enabled = models.filter((m) => m && m.enabled);
  if (enabled.length === 0) return { allowed: false, reason: 'no_model' };
  if (!s.defaultModelId || !enabled.some((m) => m.id === s.defaultModelId)) {
    return { allowed: false, reason: 'default_disabled' };
  }
  return { allowed: true, reason: 'ok' };
}

/**
 * @param {string} userDataPath
 * @param {Parameters<typeof checkAiAccess>[1]} ai
 * @param {{ now?: number, env?: NodeJS.ProcessEnv }} [opts]
 */
function checkAiAccessForUserData(userDataPath, ai, opts) {
  return checkAiAccess(getLicenseStatus(userDataPath, opts), ai);
}

module.exports = {
  AI_GATE_REASONS,
  isProActive,
  checkAiAccess,
  checkAiAccessForUserData,
};

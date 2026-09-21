/**
 * Pro 功能门禁。Free 用户仅 AI 相关能力被拦住；不涉及 API Key。
 */
'use strict';

const { getLicenseStatus } = require('./license');

/**
 * @param {ReturnType<typeof getLicenseStatus>} status
 */
function isProActive(status) {
  return !!(status && status.isPro && status.valid);
}

/**
 * @param {ReturnType<typeof getLicenseStatus>} status
 * @param {{ hasKey?: boolean }|null} aiSettings
 * @returns {{ allowed: boolean, reason: 'ok'|'upgrade'|'need_key' }}
 */
function checkAiAccess(status, aiSettings) {
  if (!isProActive(status)) {
    return { allowed: false, reason: 'upgrade' };
  }
  if (!aiSettings || !aiSettings.hasKey) {
    return { allowed: false, reason: 'need_key' };
  }
  return { allowed: true, reason: 'ok' };
}

/**
 * @param {string} userDataPath
 * @param {{ hasKey?: boolean }|null} aiSettings
 * @param {{ now?: number, env?: NodeJS.ProcessEnv }} [opts]
 */
function checkAiAccessForUserData(userDataPath, aiSettings, opts) {
  return checkAiAccess(getLicenseStatus(userDataPath, opts), aiSettings);
}

module.exports = {
  isProActive,
  checkAiAccess,
  checkAiAccessForUserData,
};

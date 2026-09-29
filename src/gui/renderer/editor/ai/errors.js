/**
 * AI 失败结果（IPC 的 gate / code / detail）→ 界面文案。detail 已由 main 脱敏，只截断展示。
 */
'use strict';

const AI_ERROR_CODES = [
  'E_AUTH', 'E_MODEL', 'E_RATE', 'E_CONTEXT', 'E_TIMEOUT', 'E_NETWORK',
  'E_EMPTY', 'E_FORMAT', 'E_CANCELED', 'E_UNKNOWN', 'E_BUSY',
];
const AI_GATES = ['upgrade', 'provider_off', 'need_key', 'no_model', 'default_disabled'];

/**
 * @param {{ gate?: string, code?: string, detail?: string } | null | undefined} r
 * @param {(key: string, vars?: object) => string} t
 */
function describeAiFailure(r, t) {
  if (r && r.gate && AI_GATES.indexOf(r.gate) >= 0) return t('aiGate_' + r.gate);
  const code = r && AI_ERROR_CODES.indexOf(r.code) >= 0 ? r.code : 'E_UNKNOWN';
  const detail = r && r.detail ? String(r.detail).replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  // 网关固定文案，没有窗口大小；拼上原文会让人以为是正文太长
  if (/token limit error/i.test(detail) && !/maximum context length|\d+\s*tokens/i.test(detail)) {
    return t('aiErrTokenQuota');
  }
  const msg = t('aiErr_' + code);
  if (!detail || code === 'E_CANCELED') return msg;
  return t('aiErrWithDetail', { msg: msg, detail: detail });
}

/** gate 类失败都能靠设置解决；E_AUTH / E_MODEL 也引导去设置 */
function failureNeedsSettings(r) {
  if (!r) return false;
  if (r.gate) return true;
  return r.code === 'E_AUTH' || r.code === 'E_MODEL';
}

module.exports = { AI_ERROR_CODES, AI_GATES, describeAiFailure, failureNeedsSettings };

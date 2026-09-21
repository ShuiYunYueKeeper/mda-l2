/**
 * 预览编辑（CM6）开关偏好。
 *
 * 与 mount 解耦：index.js 一旦 require 进整条 CM6 装配链，单测就难以只验开关语义。
 */
'use strict';

const PREF_KEY = 'mda-cm6';

/**
 * 未表态即为默认预览编辑；只有显式写 0/false 才回退 2.0 源码编辑面。
 * localStorage 不可读时同样按默认走：挂载失败还有 app.js 的回退兜底。
 */
function isEnabledByPref() {
  try {
    if (typeof window !== 'undefined' && window.mdaAPI && window.mdaAPI.cm6Forced) {
      return true;
    }
    if (typeof localStorage === 'undefined' || !localStorage) return true;
    const v = localStorage.getItem(PREF_KEY);
    if (v === null || v === undefined || v === '') return true;
    return v !== '0' && v !== 'false';
  } catch (_) {
    return true;
  }
}

function setEnabledPref(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  PREF_KEY: PREF_KEY,
  isEnabledByPref: isEnabledByPref,
  setEnabledPref: setEnabledPref,
};

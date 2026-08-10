/**
 * 粘贴图片落盘目录偏好（userData/mda-settings.json）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PASTE_ASSETS_MODES = ['doc', 'workspace', 'custom'];
const DEFAULT_MODE = 'workspace';

/** @type {import('electron').App | null} */
let appRef = null;
let mode = DEFAULT_MODE;
let customDir = '';

function settingsPath() {
  if (!appRef) return null;
  return path.join(appRef.getPath('userData'), 'mda-settings.json');
}

function readSettings() {
  const p = settingsPath();
  if (!p) return {};
  try {
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writeSettings(partial) {
  const p = settingsPath();
  if (!p) return;
  try {
    const cur = readSettings();
    const next = Object.assign({}, cur, partial);
    fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {unknown} v
 * @returns {'doc' | 'workspace' | 'custom'}
 */
function normalizeMode(v) {
  const s = String(v || '').trim().toLowerCase();
  if (PASTE_ASSETS_MODES.indexOf(s) >= 0) return /** @type {'doc' | 'workspace' | 'custom'} */ (s);
  return DEFAULT_MODE;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function normalizeCustomDir(v) {
  return String(v || '').trim();
}

/**
 * @param {import('electron').App} app
 */
function initPastePrefs(app) {
  appRef = app;
  const settings = readSettings();
  mode = normalizeMode(settings.pasteAssetsMode);
  customDir = normalizeCustomDir(settings.pasteAssetsCustomDir);
}

/**
 * @returns {{ mode: 'doc' | 'workspace' | 'custom', customDir: string }}
 */
function getPasteAssetsPref() {
  return { mode: mode, customDir: customDir };
}

/**
 * @param {{ mode?: string, customDir?: string }} next
 * @returns {{ mode: 'doc' | 'workspace' | 'custom', customDir: string }}
 */
function setPasteAssetsPref(next) {
  next = next || {};
  mode = normalizeMode(next.mode);
  customDir = normalizeCustomDir(next.customDir);
  writeSettings({
    pasteAssetsMode: mode,
    pasteAssetsCustomDir: customDir,
  });
  return getPasteAssetsPref();
}

module.exports = {
  PASTE_ASSETS_MODES: PASTE_ASSETS_MODES,
  DEFAULT_MODE: DEFAULT_MODE,
  initPastePrefs: initPastePrefs,
  getPasteAssetsPref: getPasteAssetsPref,
  setPasteAssetsPref: setPasteAssetsPref,
  normalizeMode: normalizeMode,
};

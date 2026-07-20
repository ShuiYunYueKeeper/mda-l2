const fs = require('fs');
const path = require('path');

const STORE_FILE = 'workspace-prefs.json';
const MIN_W = 900;
const MIN_H = 600;

function storePath(userData) {
  return path.join(userData, STORE_FILE);
}

function readStore(userData) {
  const p = storePath(userData);
  try {
    if (!fs.existsSync(p)) return {};
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeStore(userData, data) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(storePath(userData), JSON.stringify(data, null, 2), 'utf-8');
}

function getWorkspaceRoot(userData) {
  const root = readStore(userData).root;
  if (!root || typeof root !== 'string') return null;
  const abs = path.resolve(root);
  if (!fs.existsSync(abs)) return null;
  return abs;
}

function setWorkspaceRoot(userData, folderPath) {
  const data = readStore(userData);
  data.root = folderPath ? path.resolve(folderPath) : null;
  writeStore(userData, data);
}

/** 是否记住上次会话（文件列表 + 当前文件）；缺省为 true */
function getRememberSession(userData) {
  return readStore(userData).rememberSession !== false;
}

/**
 * 关闭时清除已存工作区根，避免下次仍恢复文件列表。
 * 最近文件由调用方另行 clearRecents。
 */
function setRememberSession(userData, on) {
  const data = readStore(userData);
  data.rememberSession = !!on;
  if (!on) data.root = null;
  writeStore(userData, data);
  return !!on;
}

/** 是否记住界面习惯（含窗口大小）；缺省为 true */
function getRememberLayout(userData) {
  return readStore(userData).rememberLayout !== false;
}

/** 关闭时清除已存窗口几何，避免下次仍恢复尺寸 */
function setRememberLayout(userData, on) {
  const data = readStore(userData);
  data.rememberLayout = !!on;
  if (!on) delete data.windowBounds;
  writeStore(userData, data);
  return !!on;
}

function normalizeWindowBounds(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const width = Math.round(Number(raw.width));
  const height = Math.round(Number(raw.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < MIN_W || height < MIN_H) return null;
  const out = {
    width,
    height,
    isMaximized: !!raw.isMaximized,
  };
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (Number.isFinite(x)) out.x = Math.round(x);
  if (Number.isFinite(y)) out.y = Math.round(y);
  return out;
}

function getWindowBounds(userData) {
  return normalizeWindowBounds(readStore(userData).windowBounds);
}

function setWindowBounds(userData, bounds) {
  const normalized = normalizeWindowBounds(bounds);
  if (!normalized) return false;
  const data = readStore(userData);
  data.windowBounds = normalized;
  writeStore(userData, data);
  return true;
}

function clearWindowBounds(userData) {
  const data = readStore(userData);
  delete data.windowBounds;
  writeStore(userData, data);
}

module.exports = {
  getWorkspaceRoot,
  setWorkspaceRoot,
  getRememberSession,
  setRememberSession,
  getRememberLayout,
  setRememberLayout,
  getWindowBounds,
  setWindowBounds,
  clearWindowBounds,
  MIN_W,
  MIN_H,
};

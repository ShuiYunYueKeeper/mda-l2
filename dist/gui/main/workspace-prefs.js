const fs = require('fs');
const path = require('path');

const STORE_FILE = 'workspace-prefs.json';

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

module.exports = { getWorkspaceRoot, setWorkspaceRoot };

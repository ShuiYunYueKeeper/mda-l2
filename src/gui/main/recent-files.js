const fs = require('fs');
const path = require('path');

const MAX_RECENT = 20;
const STORE_FILE = 'recent-files.json';

function storePath(userData) {
  return path.join(userData, STORE_FILE);
}

function readStore(userData) {
  const p = storePath(userData);
  try {
    if (!fs.existsSync(p)) return { version: 1, items: [] };
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!data || !Array.isArray(data.items)) return { version: 1, items: [] };
    data.items = data.items.filter((it) => it && it.path && fs.existsSync(it.path));
    return data;
  } catch {
    return { version: 1, items: [] };
  }
}

function writeStore(userData, store) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(storePath(userData), JSON.stringify(store, null, 2), 'utf-8');
}

function getRecents(userData) {
  return readStore(userData).items;
}

function addRecent(userData, filePath) {
  const abs = path.resolve(filePath);
  const store = readStore(userData);
  store.items = store.items.filter((it) => path.resolve(it.path) !== abs);
  store.items.unshift({ path: abs, openedAt: new Date().toISOString() });
  if (store.items.length > MAX_RECENT) store.items = store.items.slice(0, MAX_RECENT);
  writeStore(userData, store);
  return store.items;
}

function clearRecents(userData) {
  writeStore(userData, { version: 1, items: [] });
}

module.exports = { getRecents, addRecent, clearRecents, MAX_RECENT };

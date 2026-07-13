const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', 'node_modules']);

/**
 * 递归列出目录下的 Markdown 文件树（跳过 .git / node_modules）。
 * @returns {Array<{ name: string, path: string, isDir: boolean, children?: unknown[] }>}
 */
function listMarkdownTree(rootDir, extensions) {
  const extSet = new Set((extensions || ['md']).map((e) => e.toLowerCase()));

  function isMarkdownFile(name) {
    const ext = path.extname(name).slice(1).toLowerCase();
    return extSet.has(ext);
  }

  function scanDir(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const nodes = [];
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        const children = scanDir(full);
        if (children.length > 0) {
          nodes.push({ name: ent.name, path: full, isDir: true, children });
        }
      } else if (isMarkdownFile(ent.name)) {
        nodes.push({ name: ent.name, path: full, isDir: false });
      }
    }
    return nodes;
  }

  return scanDir(path.resolve(rootDir));
}

module.exports = { listMarkdownTree };

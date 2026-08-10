/**
 * 粘贴图片落盘：内容 hash 去重；目录由 doc / workspace / custom 模式决定。
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * @param {Buffer} bytes
 * @returns {string}
 */
function hashPasteBytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

/**
 * 粘贴落盘文件写入 Markdown 的相对路径（正斜杠；同目录用 `./` 前缀）。
 * @param {string} docDir 当前 .md 所在目录
 * @param {string} absPath 图片绝对路径
 * @returns {string}
 */
function formatPasteAssetHref(docDir, absPath) {
  const base = path.resolve(String(docDir));
  const abs = path.resolve(String(absPath));
  let rel = path.relative(base, abs).split(path.sep).join('/');
  if (!rel || rel === '.') {
    return path.basename(abs);
  }
  // Windows 跨盘符时 path.relative 会返回带盘符的绝对路径
  if (/^[a-zA-Z]:/.test(rel) || path.isAbsolute(rel)) {
    return abs.split(path.sep).join('/');
  }
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

/**
 * 解析粘贴图片落盘目录。
 * @param {string} docDir
 * @param {{ mode?: string, workspaceRoot?: string | null, customDir?: string | null }} [options]
 * @returns {string}
 */
function resolvePasteAssetsDir(docDir, options) {
  options = options || {};
  const mode = String(options.mode || 'doc').trim().toLowerCase();
  const custom = options.customDir ? String(options.customDir).trim() : '';
  if (mode === 'custom' && custom) {
    return path.resolve(custom);
  }
  if (mode === 'workspace') {
    const ws = options.workspaceRoot ? String(options.workspaceRoot).trim() : '';
    if (ws) {
      return path.join(path.resolve(ws), 'assets');
    }
  }
  return path.join(path.resolve(String(docDir)), 'assets');
}

/**
 * @param {string} baseFile 当前 .md 绝对路径
 * @param {Buffer} bytes
 * @param {string} ext
 * @param {{ mode?: string, workspaceRoot?: string | null, customDir?: string | null }} [options]
 * @returns {Promise<{ filePath: string, relativePath: string, markdownHref: string, deduped: boolean }>}
 */
async function writeDedupedPasteAsset(baseFile, bytes, ext, options) {
  options = options || {};
  const docDir = path.dirname(path.resolve(String(baseFile)));
  const assetsDir = resolvePasteAssetsDir(docDir, options);
  await fs.promises.mkdir(assetsDir, { recursive: true });
  const safeExt = ext && ext.charAt(0) === '.' ? ext : '.' + (ext || 'bin');

  let hash = hashPasteBytes(bytes);
  let fileName = 'paste-' + hash + safeExt;
  let absPath = path.join(assetsDir, fileName);

  if (fs.existsSync(absPath)) {
    const existing = await fs.promises.readFile(absPath);
    if (existing.length === bytes.length && existing.equals(bytes)) {
      const rel = formatPasteAssetHref(docDir, absPath);
      return { filePath: absPath, relativePath: rel, markdownHref: rel, deduped: true };
    }
    hash = crypto.createHash('sha256').update(bytes).digest('hex');
    fileName = 'paste-' + hash + safeExt;
    absPath = path.join(assetsDir, fileName);
    if (fs.existsSync(absPath)) {
      const again = await fs.promises.readFile(absPath);
      if (again.equals(bytes)) {
        const rel = formatPasteAssetHref(docDir, absPath);
        return { filePath: absPath, relativePath: rel, markdownHref: rel, deduped: true };
      }
    }
  }

  await fs.promises.writeFile(absPath, bytes);
  const rel = formatPasteAssetHref(docDir, absPath);
  return { filePath: absPath, relativePath: rel, markdownHref: rel, deduped: false };
}

module.exports = {
  hashPasteBytes: hashPasteBytes,
  formatPasteAssetHref: formatPasteAssetHref,
  resolvePasteAssetsDir: resolvePasteAssetsDir,
  writeDedupedPasteAsset: writeDedupedPasteAsset,
};

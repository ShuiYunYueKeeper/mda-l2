/**
 * 剪贴板图片：
 * - 系统剪贴板始终尽量写入位图（writeImage），保证「复制」对用户可见、可粘到外部
 * - GIF/WebP 等额外保留原始字节（进程缓存 + 自定义 blob），供 MDA 内粘贴还原动图
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { clipboard } = require('electron');

const MDA_CLIP_BLOB = 'mda/clipboard-image-blob';

/** @type {{ mime: string, ext: string, filePath: string | null, bytes: Buffer, at: number } | null} */
let lastCopied = null;

const EXT_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

function extOf(filePath) {
  return path.extname(String(filePath || '')).toLowerCase();
}

function shouldPreserveOriginal(mimeOrExt) {
  const s = String(mimeOrExt || '').toLowerCase();
  return (
    s === 'image/gif' ||
    s === 'image/webp' ||
    s === 'image/svg+xml' ||
    s === '.gif' ||
    s === '.webp' ||
    s === '.svg' ||
    /\.(gif|webp|svg)(\?|#|$)/i.test(s) ||
    /^data:image\/(gif|webp|svg\+xml)/i.test(s)
  );
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = (m[1] || 'application/octet-stream').toLowerCase();
  const isB64 = !!m[2];
  const payload = m[3] || '';
  try {
    const bytes = isB64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    if (!bytes.length) return null;
    return { mime: mime, bytes: bytes };
  } catch (_) {
    return null;
  }
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/gif') return '.gif';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/svg+xml') return '.svg';
  if (m === 'image/jpeg') return '.jpg';
  if (m === 'image/bmp') return '.bmp';
  if (m === 'image/png') return '.png';
  return '.png';
}

function encodeMdaBlob(asset) {
  const meta = Buffer.from(
    JSON.stringify({
      mime: asset.mime,
      ext: asset.ext,
      filePath: asset.filePath,
    }),
    'utf8'
  );
  const header = Buffer.alloc(4);
  header.writeUInt32LE(meta.length, 0);
  return Buffer.concat([header, meta, asset.bytes]);
}

function decodeMdaBlob(blob) {
  if (!blob || blob.length < 4) return null;
  const metaLen = blob.readUInt32LE(0);
  if (metaLen <= 0 || metaLen > blob.length - 4) return null;
  try {
    const meta = JSON.parse(blob.slice(4, 4 + metaLen).toString('utf8'));
    const bytes = blob.slice(4 + metaLen);
    if (!bytes.length) return null;
    const ext = meta.ext || extFromMime(meta.mime) || '.bin';
    return {
      mime: meta.mime || 'application/octet-stream',
      ext: ext.charAt(0) === '.' ? ext : '.' + ext,
      filePath: meta.filePath || null,
      bytes: bytes,
    };
  } catch (_) {
    return null;
  }
}

function rememberOriginal(asset) {
  if (!asset || !asset.bytes || !asset.bytes.length) return;
  lastCopied = Object.assign({ at: Date.now() }, asset);
  try {
    clipboard.writeBuffer(MDA_CLIP_BLOB, encodeMdaBlob(asset));
  } catch (_) {
    /* 自定义格式失败不影响位图复制 */
  }
}

function readPreservedClipboardImage() {
  if (lastCopied && lastCopied.bytes && lastCopied.bytes.length) {
    return {
      mime: lastCopied.mime,
      ext: lastCopied.ext,
      filePath: lastCopied.filePath,
      bytes: lastCopied.bytes,
    };
  }
  try {
    if (!clipboard.has || !clipboard.has(MDA_CLIP_BLOB)) return null;
    return decodeMdaBlob(clipboard.readBuffer(MDA_CLIP_BLOB));
  } catch (_) {
    return null;
  }
}

function readWindowsFileNameW() {
  if (process.platform !== 'win32') return null;
  try {
    const buf = clipboard.readBuffer('FileNameW');
    if (!buf || !buf.length) return null;
    let s = buf.toString('utf16le');
    const z = s.indexOf('\0');
    if (z >= 0) s = s.slice(0, z);
    s = String(s || '').trim();
    if (!s || !fs.existsSync(s)) return null;
    return s;
  } catch (_) {
    return null;
  }
}

/**
 * @param {Buffer} bytes
 * @param {string} mime
 * @param {typeof import('electron').nativeImage} nativeImage
 */
function nativeImageFromBytes(bytes, mime, nativeImage) {
  if (!bytes || !bytes.length) return null;
  try {
    let img = nativeImage.createFromBuffer(bytes);
    if (img && !img.isEmpty()) return img;
  } catch (_) {
    /* ignore */
  }
  // 部分平台对裸 GIF buffer 无效；用 dataURL 再试一次
  try {
    const m = mime || 'image/png';
    const dataUrl = 'data:' + m + ';base64,' + bytes.toString('base64');
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img && !img.isEmpty()) return img;
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * @param {{ filePath?: string, dataUrl?: string, preserveOriginal?: boolean, keepOriginalCache?: boolean }} payload
 * @param {(key: string) => string} t
 * @param {typeof import('electron').nativeImage} nativeImage
 * @returns {Promise<{ success: boolean, error?: string, needsRasterFallback?: boolean }>}
 */
async function copyClipboardImage(payload, t, nativeImage) {
  payload = payload || {};
  const wantPreserve =
    !!payload.preserveOriginal ||
    shouldPreserveOriginal(payload.filePath || '') ||
    shouldPreserveOriginal(payload.dataUrl || '');

  let abs = null;
  let bytes = null;
  let mime = 'application/octet-stream';
  let ext = '.bin';

  if (payload.filePath) {
    abs = path.resolve(String(payload.filePath));
    try {
      bytes = await fs.promises.readFile(abs);
    } catch (err) {
      // 读盘失败时仍可走 dataUrl / 渲染层栅格化
      bytes = null;
    }
    if (bytes) {
      ext = extOf(abs) || '.bin';
      mime = EXT_MIME[ext] || mime;
    }
  }

  if (!bytes && payload.dataUrl) {
    const parsed = parseDataUrl(payload.dataUrl);
    if (parsed) {
      bytes = parsed.bytes;
      mime = parsed.mime;
      ext = extFromMime(mime);
    }
  }

  // 栅格回退写入位图时：保留已有 GIF 原字节缓存
  if (payload.keepOriginalCache) {
    let img = null;
    if (payload.dataUrl) {
      img = nativeImage.createFromDataURL(String(payload.dataUrl));
      if ((!img || img.isEmpty()) && bytes) {
        img = nativeImageFromBytes(bytes, 'image/png', nativeImage);
      }
    } else if (bytes) {
      img = nativeImageFromBytes(bytes, mime, nativeImage);
    }
    if (!img || img.isEmpty()) return { success: false, error: t('errImageEmpty') };
    try {
      clipboard.writeImage(img);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || t('errImageEmpty') };
    }
  }

  if (wantPreserve && bytes && bytes.length) {
    rememberOriginal({ mime: mime, ext: ext, filePath: abs, bytes: bytes });
  } else if (!payload.keepOriginalCache) {
    lastCopied = null;
  }

  // 始终尝试写入系统位图
  let img = null;
  if (payload.dataUrl && !wantPreserve) {
    img = nativeImage.createFromDataURL(String(payload.dataUrl));
    if ((!img || img.isEmpty()) && /^data:image\/(png|jpe?g|bmp);base64,/i.test(payload.dataUrl)) {
      const b64 = String(payload.dataUrl).replace(/^data:image\/[^;]+;base64,/i, '');
      img = nativeImage.createFromBuffer(Buffer.from(b64, 'base64'));
    }
  }
  if ((!img || img.isEmpty()) && abs) {
    try {
      img = nativeImage.createFromPath(abs);
    } catch (_) {
      img = null;
    }
  }
  if ((!img || img.isEmpty()) && bytes) {
    img = nativeImageFromBytes(bytes, mime, nativeImage);
  }

  if (img && !img.isEmpty()) {
    try {
      clipboard.writeImage(img);
      return { success: true };
    } catch (err) {
      if (wantPreserve && lastCopied) {
        return { success: true, needsRasterFallback: true };
      }
      return { success: false, error: err.message || t('errImageEmpty') };
    }
  }

  // GIF 等 nativeImage 常为空：已缓存原字节，让渲染层再补 PNG 位图
  if (wantPreserve && lastCopied) {
    return { success: true, needsRasterFallback: true };
  }

  return { success: false, error: t('errImageEmpty') };
}

/**
 * @param {string} baseFile
 * @param {(key: string) => string} t
 * @param {typeof import('electron').nativeImage} nativeImage
 */
async function saveClipboardImageAsset(baseFile, t, nativeImage) {
  if (!baseFile) return { success: false, error: 'baseFile required' };
  const docDir = path.dirname(path.resolve(String(baseFile)));
  const assetsDir = path.join(docDir, 'assets');
  await fs.promises.mkdir(assetsDir, { recursive: true });
  const stamp = Date.now();

  async function writeBytes(fileBytes, fileExt) {
    const fileName = 'paste-' + stamp + fileExt;
    const absPath = path.join(assetsDir, fileName);
    await fs.promises.writeFile(absPath, fileBytes);
    let rel = path.relative(docDir, absPath).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return { success: true, filePath: absPath, relativePath: rel };
  }

  const preserved = readPreservedClipboardImage();
  if (preserved) {
    return writeBytes(preserved.bytes, preserved.ext || '.bin');
  }

  const winPath = readWindowsFileNameW();
  if (winPath) {
    const fileExt = extOf(winPath) || '.png';
    const fileName = 'paste-' + stamp + fileExt;
    const absPath = path.join(assetsDir, fileName);
    await fs.promises.copyFile(winPath, absPath);
    let rel = path.relative(docDir, absPath).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return { success: true, filePath: absPath, relativePath: rel };
  }

  const img = clipboard.readImage();
  if (!img || img.isEmpty()) return { success: false, error: t('errImageEmpty') };
  return writeBytes(img.toPNG(), '.png');
}

module.exports = {
  copyClipboardImage: copyClipboardImage,
  saveClipboardImageAsset: saveClipboardImageAsset,
  shouldPreserveOriginal: shouldPreserveOriginal,
  MDA_CLIP_BLOB: MDA_CLIP_BLOB,
};

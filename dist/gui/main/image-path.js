/**
 * 图片/链接 href 路径规范化（markdown-it 渲染后 src 常为 percent-encoded）。
 */
'use strict';

/**
 * 解码 URL 中的 percent-encoding，供 path.resolve 使用。
 * @param {string} href
 * @returns {string}
 */
function decodePathHref(href) {
  if (!href) return '';
  let h = String(href).split('#')[0].split('?')[0];
  if (!/%[0-9A-Fa-f]{2}/.test(h)) return h;
  try {
    return decodeURIComponent(h);
  } catch (_) {
    return h;
  }
}

/**
 * @param {string} absPath
 * @returns {string|null}
 */
function toLocalFileUrl(absPath) {
  if (!absPath) return null;
  const p = String(absPath).replace(/\\/g, '/');
  return 'file:///' + encodeURI(p.replace(/^\/+/, ''));
}

/**
 * @param {string} src
 * @returns {boolean}
 */
function isPreserveFormatImageSrc(src) {
  const s = decodePathHref(src);
  return (
    /^data:image\/gif/i.test(s) ||
    /\.gif(\?|#|$)/i.test(s) ||
    /^data:image\/(webp|svg\+xml)/i.test(s) ||
    /\.(webp|svg)(\?|#|$)/i.test(s)
  );
}

module.exports = {
  decodePathHref: decodePathHref,
  toLocalFileUrl: toLocalFileUrl,
  isPreserveFormatImageSrc: isPreserveFormatImageSrc,
};

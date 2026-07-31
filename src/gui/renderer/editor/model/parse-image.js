/**
 * 图片语法解析 `![alt](src "title")`
 */
'use strict';

/**
 * @param {string} slice
 * @returns {{ alt: string, src: string, title: string } | null}
 */
function parseImageMarkdown(slice) {
  const m = /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)$/.exec(
    String(slice || '').trim()
  );
  if (!m) return null;
  return {
    alt: m[1] || '',
    src: m[2] || '',
    title: m[3] || m[4] || '',
  };
}

/**
 * @param {{ alt?: string, src?: string, title?: string }} meta
 * @returns {string}
 */
function serializeImageMarkdown(meta) {
  if (!meta || !meta.src) return '';
  const alt = String(meta.alt || '');
  const src = String(meta.src || '');
  const title = meta.title ? String(meta.title) : '';
  if (title) {
    return '![' + alt + '](' + src + ' "' + title.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
  }
  return '![' + alt + '](' + src + ')';
}

module.exports = {
  parseImageMarkdown: parseImageMarkdown,
  serializeImageMarkdown: serializeImageMarkdown,
};

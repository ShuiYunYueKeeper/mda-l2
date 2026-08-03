/**
 * 图片语法解析 `![alt](src "title")`
 */
'use strict';

/** 全局扫描用（非锚定整串） */
const IMAGE_MD_GLOBAL =
  /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)/g;

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
 * 在普通文本中扫描图片 Markdown 区间（供表格单元格等行内渲染）。
 * @param {string} text
 * @returns {{ kind: 'image', from: number, to: number, alt: string, src: string, title: string, source: string }[]}
 */
function findImageRanges(text) {
  const raw = String(text || '');
  const out = [];
  const re = new RegExp(IMAGE_MD_GLOBAL.source, 'g');
  let m;
  while ((m = re.exec(raw)) !== null) {
    out.push({
      kind: 'image',
      from: m.index,
      to: m.index + m[0].length,
      alt: m[1] || '',
      src: m[2] || '',
      title: m[3] || m[4] || '',
      source: m[0],
    });
  }
  return out;
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
  findImageRanges: findImageRanges,
};

/**
 * 用 2.0 renderMarkdown 切片生成 widget DOM（.mda-md-surface），并解析相对图片。
 */
'use strict';

/**
 * @param {string} source
 * @param {(text: string) => string | { success?: boolean, html?: string }} [renderMarkdown]
 * @returns {string}
 */
function htmlFromRender(source, renderMarkdown) {
  if (typeof renderMarkdown !== 'function') return '';
  try {
    const r = renderMarkdown(source || '');
    if (typeof r === 'string') return r;
    if (r && r.success && typeof r.html === 'string') return r.html;
    if (r && typeof r.html === 'string') return r.html;
  } catch (_) { /* ignore */ }
  return '';
}

/**
 * @param {HTMLElement} root
 * @param {(src: string) => Promise<string|null>|string|null} [resolveImageUrl]
 */
function resolveImagesIn(root, resolveImageUrl) {
  if (!root || typeof resolveImageUrl !== 'function') return;
  const imgs = root.querySelectorAll('img[src]');
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i];
    const src = img.getAttribute('src') || '';
    if (!src || /^(https?:|data:|file:)/i.test(src)) continue;
    Promise.resolve(resolveImageUrl(src))
      .then(function (url) {
        if (url) img.setAttribute('src', url);
      })
      .catch(function () { /* keep broken img → 2.0 onerror/alt */ });
  }
}

/**
 * @param {string} source
 * @param {{
 *   renderMarkdown?: Function,
 *   resolveImageUrl?: Function,
 *   inline?: boolean,
 * }} [opts]
 * @returns {HTMLElement}
 */
function createMdSurface(source, opts) {
  opts = opts || {};
  const wrap = document.createElement(opts.inline ? 'span' : 'div');
  wrap.className = 'mda-md-surface' + (opts.inline ? ' mda-md-surface-inline' : '');
  wrap.setAttribute('contenteditable', 'false');
  const html = htmlFromRender(source, opts.renderMarkdown);
  if (html) {
    if (opts.inline) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const p = tmp.querySelector('p');
      const host = p || tmp;
      while (host.firstChild) wrap.appendChild(host.firstChild);
    } else {
      wrap.innerHTML = html;
    }
    resolveImagesIn(wrap, opts.resolveImageUrl);
  } else {
    wrap.textContent = source || '';
  }
  return wrap;
}

module.exports = {
  htmlFromRender: htmlFromRender,
  resolveImagesIn: resolveImagesIn,
  createMdSurface: createMdSurface,
};

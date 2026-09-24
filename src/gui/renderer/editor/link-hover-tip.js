/**
 * 预览编辑区链接悬停：延迟显示全路径与操作提示。
 */
'use strict';

const { EditorView } = require('@codemirror/view');
const { syntaxTree } = require('@codemirror/language');
const { normalizeExternalHref } = require('./model/auto-link');

const SHOW_DELAY_MS = 450;
const HIDE_DELAY_MS = 80;

/**
 * @param {string} fileUrl
 * @returns {string}
 */
function decodeFileUrl(fileUrl) {
  let s = String(fileUrl || '');
  if (!/^file:/i.test(s)) return s;
  s = s.replace(/^file:\/\//i, '');
  if (/^\/[A-Za-z]:/.test(s)) s = s.slice(1);
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ clientX: number, clientY: number, target?: EventTarget | null }} event
 * @returns {string}
 */
function hrefAtPointer(view, event) {
  const target = event.target;
  if (target && target.closest) {
    const el = target.closest('[data-mda-href], a.mda-cm-link[href]');
    if (el) {
      return normalizeExternalHref(
        el.getAttribute('data-mda-href') || el.getAttribute('href') || ''
      );
    }
  }
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return '';
  let node = syntaxTree(view.state).resolveInner(pos, 1);
  const text = view.state.doc.toString();
  while (node) {
    if (node.name === 'Link') {
      const slice = text.slice(node.from, node.to);
      const m = /^\[([\s\S]*?)\]\(([\s\S]*?)\)$/.exec(slice);
      return m ? normalizeExternalHref(String(m[2] || '').trim()) : '';
    }
    if (node.name === 'Autolink') {
      return normalizeExternalHref(text.slice(node.from + 1, node.to - 1).trim());
    }
    if (node.name === 'URL') {
      return normalizeExternalHref(text.slice(node.from, node.to).trim());
    }
    node = node.parent;
  }
  return '';
}

/**
 * @param {(key: string) => string} t
 * @returns {string}
 */
function openLinkHint(t) {
  const isMac = (navigator.platform || '').toLowerCase().indexOf('mac') >= 0;
  return t(isMac ? 'linkTipOpenMac' : 'linkTipOpenWin');
}

/**
 * @param {string} href
 * @param {{ resolveImageUrl?: (href: string) => string | null | undefined }} opts
 * @returns {string}
 */
function linkDisplayPath(href, opts) {
  if (!href) return '';
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^file:/i.test(href)) return decodeFileUrl(href);
  if (typeof opts.resolveImageUrl === 'function') {
    const resolved = opts.resolveImageUrl(href);
    if (resolved) {
      if (/^file:/i.test(resolved)) return decodeFileUrl(resolved);
      return resolved;
    }
  }
  return href;
}

/**
 * @param {{
 *   t?: (key: string) => string,
 *   resolveImageUrl?: (href: string) => string | null | undefined,
 * }} opts
 */
function createLinkHoverTipExtension(opts) {
  opts = opts || {};
  let showTimer = 0;
  let hideTimer = 0;
  /** @type {HTMLElement | null} */
  let tipEl = null;
  let lastHref = '';
  let pendingX = 0;
  let pendingY = 0;

  function t(key) {
    return typeof opts.t === 'function' ? opts.t(key) : key;
  }

  function ensureTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'mda-cm-tb-floating-tip mda-cm-link-hover-tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function hideTip() {
    lastHref = '';
    if (tipEl) tipEl.classList.remove('is-visible');
  }

  function scheduleHide() {
    window.clearTimeout(showTimer);
    showTimer = 0;
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideTip, HIDE_DELAY_MS);
  }

  function showTip(href, x, y) {
    const tip = ensureTip();
    tip.textContent =
      linkDisplayPath(href, opts) + '\n' + openLinkHint(t) + '\n' + t('linkTipEdit');
    tip.classList.add('is-visible');
    lastHref = href;
    const pad = 8;
    let left = x + 12;
    let top = y + 16;
    const rect = tip.getBoundingClientRect();
    if (left + rect.width > window.innerWidth - pad) {
      left = window.innerWidth - rect.width - pad;
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = y - rect.height - 8;
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  function scheduleShow(view, event) {
    const href = hrefAtPointer(view, event);
    if (!href) {
      scheduleHide();
      return;
    }
    if (href === lastHref && tipEl && tipEl.classList.contains('is-visible')) return;
    window.clearTimeout(hideTimer);
    hideTimer = 0;
    pendingX = event.clientX;
    pendingY = event.clientY;
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(function () {
      showTimer = 0;
      const target = document.elementFromPoint(pendingX, pendingY);
      const again = hrefAtPointer(view, {
        clientX: pendingX,
        clientY: pendingY,
        target: target,
      });
      if (!again) return;
      showTip(again, pendingX, pendingY);
    }, SHOW_DELAY_MS);
  }

  return [
    EditorView.domEventHandlers({
      mouseover: function (event, view) {
        if (event.target && event.target.closest && event.target.closest('.mda-link-edit-popover')) {
          return false;
        }
        scheduleShow(view, event);
        return false;
      },
      mousemove: function (event, view) {
        scheduleShow(view, event);
        return false;
      },
      mouseout: function (event) {
        const related = event.relatedTarget;
        if (tipEl && related && tipEl.contains(/** @type {Node} */ (related))) return false;
        scheduleHide();
        return false;
      },
      mousedown: function () {
        scheduleHide();
        return false;
      },
      scroll: function () {
        scheduleHide();
        return false;
      },
    }),
    EditorView.updateListener.of(function (update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) scheduleHide();
    }),
  ];
}

module.exports = {
  createLinkHoverTipExtension: createLinkHoverTipExtension,
  hrefAtPointer: hrefAtPointer,
};

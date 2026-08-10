/**
 * 链接编辑浮层：文本 + URL，点外部关闭不保存；确认后才写回 `[text](href)`。
 */
'use strict';

const { uiT } = require('./widgets/widget-common');

/** @type {HTMLElement | null} */
let activePopover = null;

/** @type {((ev: Event) => void) | null} */
let dismissFn = null;

function closeLinkEditPopover() {
  if (activePopover && activePopover.parentNode) {
    activePopover.parentNode.removeChild(activePopover);
  }
  activePopover = null;
  if (dismissFn) {
    document.removeEventListener('mousedown', dismissFn, true);
    document.removeEventListener('keydown', dismissFn, true);
    dismissFn = null;
  }
}

/**
 * @param {{
 *   x: number,
 *   y: number,
 *   text: string,
 *   href: string,
 *   t?: (key: string) => string,
 *   onConfirm: (text: string, href: string) => void,
 * }} opts
 */
function showLinkEditPopover(opts) {
  closeLinkEditPopover();
  const o = opts || {};
  const t = typeof o.t === 'function' ? o.t : function (k) {
    return uiT(k, o.t);
  };
  const initialText = o.text == null ? '' : String(o.text);
  const initialHref = o.href == null ? '' : String(o.href);

  const pop = document.createElement('div');
  pop.className = 'mda-link-edit-popover';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML =
    '<label class="mda-link-edit-field">' +
    '<span class="mda-link-edit-label">' +
    t('contextMenuLinkText') +
    '</span>' +
    '<input type="text" class="mda-link-edit-input" data-field="text" autocomplete="off" />' +
    '</label>' +
    '<label class="mda-link-edit-field">' +
    '<span class="mda-link-edit-label">' +
    t('contextMenuLinkUrl') +
    '</span>' +
    '<input type="text" class="mda-link-edit-input" data-field="href" autocomplete="off" />' +
    '</label>' +
    '<div class="mda-link-edit-actions">' +
    '<button type="button" class="mda-link-edit-confirm">' +
    t('contextMenuLinkConfirm') +
    '</button>' +
    '</div>';

  const textInput = /** @type {HTMLInputElement} */ (pop.querySelector('[data-field="text"]'));
  const hrefInput = /** @type {HTMLInputElement} */ (pop.querySelector('[data-field="href"]'));
  const confirmBtn = /** @type {HTMLButtonElement} */ (pop.querySelector('.mda-link-edit-confirm'));
  textInput.value = initialText;
  hrefInput.value = initialHref;

  document.body.appendChild(pop);
  activePopover = pop;

  const pad = 8;
  let left = o.x;
  let top = o.y;
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
  if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  function tryConfirm() {
    const nextText = textInput.value;
    const nextHref = hrefInput.value.trim();
    if (nextText === initialText && nextHref === initialHref) {
      closeLinkEditPopover();
      return;
    }
    closeLinkEditPopover();
    if (typeof o.onConfirm === 'function') o.onConfirm(nextText, nextHref);
  }

  confirmBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    tryConfirm();
  });

  pop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryConfirm();
    }
  });

  dismissFn = function (ev) {
    const target = ev && ev.target;
    if (target && pop.contains(/** @type {Node} */ (target))) return;
    if (ev && ev.type === 'keydown' && ev.key !== 'Escape') return;
    closeLinkEditPopover();
  };
  window.setTimeout(function () {
    if (!dismissFn) return;
    document.addEventListener('mousedown', dismissFn, true);
    document.addEventListener('keydown', dismissFn, true);
  }, 0);

  textInput.focus();
  textInput.select();
}

module.exports = {
  showLinkEditPopover: showLinkEditPopover,
  closeLinkEditPopover: closeLinkEditPopover,
};

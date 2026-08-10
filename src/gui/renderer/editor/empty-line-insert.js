/**
 * 正文空白行：hover 显示「+」插入按钮；光标落点显示占位提示。
 */
'use strict';

const { Transaction } = require('@codemirror/state');
const { EditorView, ViewPlugin, WidgetType, Decoration } = require('@codemirror/view');
const { showEmptyLineInsertMenu, isEmptyLineInsertMenuOpenFor } = require('./widgets/empty-line-insert-menu');
const { HOVER_LEAVE_MS, uiT } = require('./widgets/widget-common');

const HIDE_MS = HOVER_LEAVE_MS;
const BLOCK_CHILD_SEL =
  '.mda-cm-table-block, .mda-cm-code-block, .mda-cm-mermaid-block, .mda-cm-image-block, .mda-cm-math-block, .mda-cm-hr-block';

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 * @returns {HTMLElement | null}
 */
function lineElementAt(view, pos) {
  try {
    const at = view.domAtPos(pos, 1);
    let node = at && at.node;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentElement;
    return node && node.closest ? /** @type {HTMLElement} */ (node.closest('.cm-line')) : null;
  } catch (_) {
    /* fall through */
  }
  try {
    const block = view.lineBlockAt(pos);
    const scroller = view.scrollDOM;
    const rect = scroller.getBoundingClientRect();
    const x = rect.left + block.left - scroller.scrollLeft + 4;
    const y = rect.top + block.top - scroller.scrollTop + Math.max(block.height, 1) / 2;
    const el = document.elementFromPoint(x, y);
    if (!el || !view.dom.contains(el)) return null;
    return el.closest ? /** @type {HTMLElement} */ (el.closest('.cm-line')) : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, text: string, number: number }} line
 */
function isBlankProseLine(view, line) {
  if (!view || !line || String(line.text || '').trim() !== '') return false;
  const lineEl = lineElementAt(view, line.from);
  if (!lineEl) return false;
  if (lineEl.querySelector(BLOCK_CHILD_SEL)) return false;
  if (lineEl.querySelector('.mda-cm-hidden-line')) return false;
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ kind: 'button' } | { kind: 'line', line: import('@codemirror/state').Line, lineEl: HTMLElement } | null}
 */
function hitBlankLineAt(view, clientX, clientY) {
  if (!view || !view.dom) return null;
  const target = document.elementFromPoint(clientX, clientY);
  if (!target || !view.dom.contains(target)) return null;
  if (target.closest && target.closest('.mda-cm-empty-line-insert-btn')) {
    return { kind: 'button' };
  }
  let lineEl = target.closest ? /** @type {HTMLElement} */ (target.closest('.cm-line')) : null;
  if (!lineEl) {
    const pos = view.posAtCoords({ x: clientX, y: clientY, exact: false });
    if (pos == null) return null;
    lineEl = lineElementAt(view, pos);
  }
  if (!lineEl) return null;
  let pos;
  try {
    pos = view.posAtDOM(lineEl, 0);
  } catch (_) {
    const at = view.posAtCoords({ x: clientX, y: clientY, exact: false });
    if (at == null) return null;
    pos = at;
  }
  const line = view.state.doc.lineAt(pos);
  if (!isBlankProseLine(view, line)) return null;
  const resolved = lineElementAt(view, line.from);
  if (!resolved) return null;
  return { kind: 'line', line: line, lineEl: resolved };
}

class EmptyLinePlaceholderWidget extends WidgetType {
  /**
   * @param {string} label
   */
  constructor(label) {
    super();
    this.label = label;
  }

  eq(other) {
    return other instanceof EmptyLinePlaceholderWidget && other.label === this.label;
  }

  toDOM() {
    const el = document.createElement('span');
    el.className = 'mda-cm-empty-line-placeholder';
    el.textContent = this.label;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {Function | undefined} t
 */
function buildPlaceholderDecorations(view, t) {
  if (!view.hasFocus) return Decoration.none;
  const sel = view.state.selection.main;
  if (sel.from !== sel.to) return Decoration.none;
  const line = view.state.doc.lineAt(sel.head);
  if (!isBlankProseLine(view, line)) return Decoration.none;
  const label = uiT('emptyLinePlaceholder', t);
  return Decoration.set([
    Decoration.widget({
      widget: new EmptyLinePlaceholderWidget(label),
      side: 1,
    }).range(line.from),
  ]);
}

/** @type {import('@codemirror/view').EditorView | null} */
let emptyLineViewRef = null;

/**
 * @param {{
 *   t?: Function,
 *   blockMenuHandlers?: object,
 * }} [opts]
 */
function createEmptyLineInsertExtension(opts) {
  opts = opts || {};
  emptyLineTFn = opts.t;
  const tFn = function () {
    return emptyLineTFn;
  };

  const placeholderPlugin = ViewPlugin.fromClass(
    class {
      /**
       * @param {import('@codemirror/view').EditorView} view
       */
      constructor(view) {
        emptyLineViewRef = view;
        this.decorations = buildPlaceholderDecorations(view, tFn());
      }

      update(update) {
        this.decorations = buildPlaceholderDecorations(update.view, tFn());
      }
    },
    {
      decorations: function (v) {
        return v.decorations;
      },
    }
  );

  const hoverPlugin = ViewPlugin.fromClass(
    class {
      /**
       * @param {import('@codemirror/view').EditorView} view
       */
      constructor(view) {
        emptyLineViewRef = view;
        this.view = view;
        this.lineNo = 0;
        this.lineEl = null;
        this.btnHover = false;
        this.hideTimer = 0;
        this.raf = 0;
        this.pendingX = 0;
        this.pendingY = 0;

        this.layer = document.createElement('div');
        this.layer.className = 'mda-cm-empty-line-insert-layer';
        this.layer.setAttribute('aria-hidden', 'true');

        this.btn = document.createElement('button');
        this.btn.type = 'button';
        this.btn.className = 'mda-cm-empty-line-insert-btn';
        this.btn.setAttribute('aria-haspopup', 'menu');
        this.btn.innerHTML =
          '<span class="mda-cm-empty-line-insert-icon" aria-hidden="true">+</span>' +
          '<span class="mda-cm-empty-line-insert-tip"></span>';

        this.layer.appendChild(this.btn);
        view.scrollDOM.appendChild(this.layer);

        const self = this;
        this.btn.addEventListener('mouseenter', function () {
          self.btnHover = true;
          self.btn.classList.add('mda-cm-empty-line-insert-hover');
          self.applyLineHighlight(true);
          window.clearTimeout(self.hideTimer);
        });
        this.btn.addEventListener('mouseleave', function () {
          self.btnHover = false;
          self.btn.classList.remove('mda-cm-empty-line-insert-hover');
          self.applyLineHighlight(false);
          self.scheduleHide();
        });
        this.btn.addEventListener('mousedown', function (e) {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
        });
        this.btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          self.openMenu();
        });

        this.syncI18n();
        this.onMove = this.onMove.bind(this);
        this.onLeave = this.onLeave.bind(this);
        view.scrollDOM.addEventListener('mousemove', this.onMove);
        view.scrollDOM.addEventListener('mouseleave', this.onLeave);
      }

      syncI18n() {
        const tip = uiT('emptyLineInsertTooltip', tFn());
        this.btn.removeAttribute('title');
        this.btn.setAttribute('aria-label', tip);
        const tipEl = this.btn.querySelector('.mda-cm-empty-line-insert-tip');
        if (tipEl) tipEl.textContent = tip;
      }

      /**
       * @param {import('@codemirror/view').EditorView} view
       */
      update(update) {
        if (update.docChanged) {
          if (this.lineEl && !this.lineEl.isConnected) {
            this.lineNo = 0;
            this.lineEl = null;
            this.btn.classList.remove('mda-cm-empty-line-insert-show', 'mda-cm-empty-line-insert-hover');
          } else if (this.lineNo > 0 && this.btn.classList.contains('mda-cm-empty-line-insert-show')) {
            try {
              const line = update.view.state.doc.line(this.lineNo);
              if (!isBlankProseLine(update.view, line)) {
                if (!this.btnHover && !isEmptyLineInsertMenuOpenFor(this.lineEl)) {
                  this.hide();
                }
              } else {
                const fresh = lineElementAt(update.view, line.from);
                if (fresh && fresh !== this.lineEl) {
                  if (this.lineEl) this.lineEl.classList.remove('mda-cm-empty-line-hover');
                  this.lineEl = fresh;
                  this.lineEl.classList.add('mda-cm-empty-line-hover');
                }
              }
            } catch (_) {
              if (!this.btnHover) this.hide();
            }
          }
        }
        if (update.docChanged || update.viewportChanged || update.geometryChanged) {
          this.reposition();
        }
      }

      onMove(e) {
        this.pendingX = e.clientX;
        this.pendingY = e.clientY;
        if (this.raf) return;
        const self = this;
        this.raf = requestAnimationFrame(function () {
          self.raf = 0;
          self.handleMove(self.pendingX, self.pendingY);
        });
      }

      onLeave(e) {
        const rt = e.relatedTarget;
        if (rt && (this.btn.contains(/** @type {Node} */ (rt)) || this.layer.contains(/** @type {Node} */ (rt)))) {
          return;
        }
        this.scheduleHide();
      }

      /**
       * @param {number} clientX
       * @param {number} clientY
       */
      handleMove(clientX, clientY) {
        const view = this.view;
        const hit = hitBlankLineAt(view, clientX, clientY);
        if (hit && hit.kind === 'line') {
          this.showForLine(hit.line.number, hit.lineEl);
          return;
        }
        if (hit && hit.kind === 'button') return;
        if (this.btnHover) return;
        this.scheduleHide();
      }

      /**
       * @param {number} lineNo
       * @param {HTMLElement} lineEl
       */
      showForLine(lineNo, lineEl) {
        window.clearTimeout(this.hideTimer);
        this.hideTimer = 0;
        if (this.lineEl && this.lineEl !== lineEl) {
          this.lineEl.classList.remove('mda-cm-empty-line-hover', 'mda-cm-empty-line-highlight');
        }
        this.lineNo = lineNo;
        this.lineEl = lineEl;
        lineEl.classList.add('mda-cm-empty-line-hover');
        this.btn.classList.add('mda-cm-empty-line-insert-show');
        this.reposition();
      }

      scheduleHide() {
        const self = this;
        window.clearTimeout(this.hideTimer);
        this.hideTimer = window.setTimeout(function () {
          self.hideTimer = 0;
          if (self.btnHover) return;
          if (self.lineEl && isEmptyLineInsertMenuOpenFor(self.lineEl)) return;
          self.hide();
        }, HIDE_MS);
      }

      hide() {
        window.clearTimeout(this.hideTimer);
        this.hideTimer = 0;
        this.btn.classList.remove('mda-cm-empty-line-insert-show', 'mda-cm-empty-line-insert-hover');
        this.applyLineHighlight(false);
        if (this.lineEl) {
          this.lineEl.classList.remove('mda-cm-empty-line-hover');
          if (!isEmptyLineInsertMenuOpenFor(this.lineEl)) {
            this.lineEl.classList.remove('mda-cm-block-handle-show');
          }
        }
        this.lineNo = 0;
        this.lineEl = null;
      }

      /**
       * @param {boolean} on
       */
      applyLineHighlight(on) {
        if (!this.lineEl) return;
        this.lineEl.classList.toggle('mda-cm-empty-line-highlight', on);
      }

      reposition() {
        if (!this.lineNo || !this.btn.classList.contains('mda-cm-empty-line-insert-show')) {
          return;
        }
        const view = this.view;
        let lineEl = this.lineEl;
        if (!lineEl || !lineEl.isConnected) {
          try {
            const line = view.state.doc.line(this.lineNo);
            lineEl = lineElementAt(view, line.from);
            if (lineEl) this.lineEl = lineEl;
          } catch (_) {
            return;
          }
        }
        if (!lineEl) return;

        const scrollDOM = view.scrollDOM;
        const lineRect = lineEl.getBoundingClientRect();
        const scrollRect = scrollDOM.getBoundingClientRect();
        const h = this.btn.offsetHeight || 24;
        const w = this.btn.offsetWidth || 24;
        const top =
          lineRect.top - scrollRect.top + scrollDOM.scrollTop + (lineRect.height - h) / 2;
        const left = lineRect.left - scrollRect.left + scrollDOM.scrollLeft - w - 3;
        this.btn.style.top = Math.round(top) + 'px';
        this.btn.style.left = Math.round(left) + 'px';
      }

      openMenu() {
        const view = this.view;
        if (!this.lineNo || !this.lineEl) return;
        const line = view.state.doc.line(this.lineNo);
        const block = { from: line.from, to: line.to, source: line.text };
        try {
          view.dispatch({
            selection: { anchor: line.from, head: line.from },
            annotations: Transaction.addToHistory.of(false),
          });
          view.focus();
        } catch (_) {
          /* ignore */
        }
        this.lineEl.classList.add('mda-cm-block-handle-show');
        showEmptyLineInsertMenu({
          anchorEl: this.btn,
          blockRoot: this.lineEl,
          view: view,
          block: block,
          t: tFn(),
          handlers: opts.blockMenuHandlers,
        });
      }

      destroy() {
        if (emptyLineViewRef === this.view) emptyLineViewRef = null;
        window.clearTimeout(this.hideTimer);
        if (this.raf) cancelAnimationFrame(this.raf);
        this.view.scrollDOM.removeEventListener('mousemove', this.onMove);
        this.view.scrollDOM.removeEventListener('mouseleave', this.onLeave);
        if (this.layer.parentNode) this.layer.parentNode.removeChild(this.layer);
        if (this.lineEl) {
          this.lineEl.classList.remove(
            'mda-cm-empty-line-hover',
            'mda-cm-empty-line-highlight',
            'mda-cm-block-handle-show'
          );
        }
      }
    },
    {
      eventHandlers: {
        scroll: function () {
          this.reposition();
        },
      },
    }
  );

  return {
    extensions: [placeholderPlugin, hoverPlugin],
  };
}

/** @type {Function | undefined} */
let emptyLineTFn;

function refreshEmptyLineInsertI18n(view, t) {
  if (typeof t === 'function') {
    emptyLineTFn = t;
  }
  const buttons = document.querySelectorAll('.mda-cm-empty-line-insert-btn');
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const tip = uiT('emptyLineInsertTooltip', emptyLineTFn);
    btn.removeAttribute('title');
    btn.setAttribute('aria-label', tip);
    const tipEl = btn.querySelector('.mda-cm-empty-line-insert-tip');
    if (tipEl) tipEl.textContent = tip;
  }
  const v = view || emptyLineViewRef;
  if (v) {
    v.dispatch({ annotations: Transaction.addToHistory.of(false) });
  }
}

module.exports = {
  createEmptyLineInsertExtension: createEmptyLineInsertExtension,
  refreshEmptyLineInsertI18n: refreshEmptyLineInsertI18n,
  isBlankProseLine: isBlankProseLine,
  hitBlankLineAt: hitBlankLineAt,
};

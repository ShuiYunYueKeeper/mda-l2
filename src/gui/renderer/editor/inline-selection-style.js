/**
 * 内联装饰（行内代码、链接、强调等）有不透明背景时会挡住 CM6 选区层；
 * 选区变化时为与选区重叠的 DOM 打上 mda-cm-in-selection，由 CSS 绘制选中态。
 */
'use strict';

const { ViewPlugin } = require('@codemirror/view');

const INLINE_SEL =
  '.mda-cm-code,.mda-cm-link,.mda-cm-strong,.mda-cm-em,.mda-cm-strike,' +
  '.mda-cm-h1,.mda-cm-h2,.mda-cm-h3,.mda-cm-h4,.mda-cm-h5,.mda-cm-h6';

/** @param {{ from: number, to: number }} a @param {{ from: number, to: number }} b */
function rangesOverlap(a, b) {
  return a.from < b.to && a.to > b.from;
}

/** @param {import('@codemirror/view').EditorView} view */
function selectionDocRange(view) {
  const main = view.state.selection.main;
  const from = Math.min(main.anchor, main.head);
  const to = Math.max(main.anchor, main.head);
  if (from === to) return null;
  return { from: from, to: to };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {Element} el
 * @returns {{ from: number, to: number } | null}
 */
function elementDocRange(view, el) {
  try {
    const from = view.posAtDOM(el, 0);
    const to = view.posAtDOM(el, 1);
    if (typeof from === 'number' && typeof to === 'number' && to > from) {
      return { from: from, to: to };
    }
  } catch (_) {
    /* posAtDOM 在节点未挂载或已失效时可能抛错 */
  }
  try {
    const from = view.posAtDOM(el);
    const len = el.textContent ? el.textContent.length : 0;
    if (typeof from === 'number' && len > 0) return { from: from, to: from + len };
  } catch (_) {
    return null;
  }
  return null;
}

/** @param {import('@codemirror/view').EditorView} view */
function syncInlineSelection(view) {
  const sel = selectionDocRange(view);
  const root = view.dom;
  const prev = root.querySelectorAll(INLINE_SEL + '.mda-cm-in-selection');
  for (let i = 0; i < prev.length; i++) {
    prev[i].classList.remove('mda-cm-in-selection');
  }
  if (!sel) return;

  const nodes = root.querySelectorAll(INLINE_SEL);
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const range = elementDocRange(view, el);
    if (range && rangesOverlap(sel, range)) {
      el.classList.add('mda-cm-in-selection');
    }
  }
}

function createInlineSelectionStyleExtension() {
  return ViewPlugin.fromClass(
    class {
      /** @param {import('@codemirror/view').EditorView} view */
      constructor(view) {
        this.raf = 0;
        this.schedule(view);
      }

      /** @param {import('@codemirror/view').EditorView} view */
      schedule(view) {
        const self = this;
        if (self.raf) cancelAnimationFrame(self.raf);
        self.raf = requestAnimationFrame(function () {
          self.raf = 0;
          syncInlineSelection(view);
        });
      }

      /** @param {import('@codemirror/view').ViewUpdate} update */
      update(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.schedule(update.view);
        }
      }

      destroy() {
        if (this.raf) cancelAnimationFrame(this.raf);
      }
    }
  );
}

module.exports = {
  createInlineSelectionStyleExtension: createInlineSelectionStyleExtension,
  rangesOverlap: rangesOverlap,
  INLINE_SEL: INLINE_SEL,
};

/**
 * 原生 HTML 块 widget：把 `<div align="center">…</div>` / `<details>…</details>` 这类块
 * 交给 2.0 renderMarkdown 渲染，而不是在预览里逐行显示源码。
 *
 * 渲染走 md-surface（renderMarkdown 由 app.js 注入），所以块内的 Markdown（`<details>` 里夹的正文）
 * 与相对图片路径都能正常处理；源码态用 contenteditable 面板，失焦写回文档。
 */
'use strict';

const cmView = require('@codemirror/view');
const { Transaction } = require('@codemirror/state');
const {
  createBlockToolbar,
  copyText,
  uiT,
  clearMediaSelection,
  clearBlockWidgetSelection,
} = require('./widget-common');
const { BlockReplaceWidget, syncWidgetHeightFromDom } = require('./block-widget-base');
const { createMdSurface } = require('./md-surface');
const { attachBlockDragHandle } = require('./block-drag-handle');
const { attachWidgetEditablePointerIsolation } = require('../widget-editable-guard');
const { setSelectedBlock } = require('./block-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedMermaidBlock } = require('./mermaid-selection');
const { clearSelectedMathBlock } = require('./math-selection');
const { clearSelectedInlineMath, clearInlineMathSelectedClass } = require('./inline-math-selection');

const MIN_HEIGHT = 44;

class HtmlBlockWidget extends BlockReplaceWidget {
  /**
   * @param {string} source
   * @param {object} [opts]
   */
  constructor(source, opts) {
    super(source || '', Object.assign({ minHeight: MIN_HEIGHT, heightKind: 'html-block' }, opts || {}));
    this.opts = opts || {};
  }
  eq(other) {
    return (
      other instanceof HtmlBlockWidget &&
      other.source === this.source &&
      other.from === this.from &&
      other.to === this.to
    );
  }
  toDOM(view) {
    const self = this;
    const opts = this.opts;
    const t = opts.t;
    const root = document.createElement('div');
    root.className = 'mda-cm-html-block mda-cm-html-block-line';
    root.setAttribute('contenteditable', 'false');
    if (self.from != null) root.setAttribute('data-mda-block-from', String(self.from));
    if (self.to != null) root.setAttribute('data-mda-block-to', String(self.to));
    if (self.source) root.setAttribute('data-mda-block-source', self.source);

    const frame = document.createElement('div');
    frame.className = 'mda-cm-html-frame mda-cm-media-block';

    const toolbar = createBlockToolbar(frame, {
      t: t,
      labelKey: 'widgetHtmlLabel',
      buttons: [
        { id: 'copy', i18nKey: 'widgetHtmlCopy' },
        { id: 'source', i18nKey: 'widgetCodeSource', i18nToggle: 'html-source' },
      ],
    });

    const body = document.createElement('div');
    body.className = 'mda-cm-html-render';
    frame.appendChild(body);

    const sourcePanel = document.createElement('div');
    sourcePanel.className = 'mda-cm-html-source';
    const sourceEditor = document.createElement('div');
    sourceEditor.className = 'mda-cm-html-source-input';
    sourceEditor.setAttribute('contenteditable', 'true');
    sourceEditor.setAttribute('role', 'textbox');
    sourceEditor.setAttribute('aria-multiline', 'true');
    sourceEditor.setAttribute('spellcheck', 'false');
    sourceEditor.setAttribute('data-i18n-aria', 'widgetHtmlEdit');
    sourceEditor.setAttribute('aria-label', uiT('widgetHtmlEdit', t));
    attachWidgetEditablePointerIsolation(sourceEditor);
    sourcePanel.appendChild(sourceEditor);
    frame.appendChild(sourcePanel);

    let showingSource = false;
    const sourceBtn = toolbar.querySelector('[data-action="source"]');

    function renderFromSource() {
      const surface = createMdSurface(self.source, {
        renderMarkdown: opts.renderMarkdown,
        resolveImageUrl: opts.resolveImageUrl,
      });
      body.innerHTML = '';
      // 保留 .mda-md-surface 外壳：它承接预览侧通用的排版/代码块样式
      body.appendChild(surface);
      bindImageMeasure();
    }

    function bindImageMeasure() {
      const imgs = body.querySelectorAll('img');
      for (let i = 0; i < imgs.length; i++) {
        // 远程徽章加载完才定高，必须补测，否则 widget 下方内容会跳动
        imgs[i].addEventListener('load', requestHeightMeasure);
      }
    }

    function readSourceText() {
      return (sourceEditor.innerText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    function requestHeightMeasure() {
      syncWidgetHeightFromDom(self, view, root);
    }

    function selectBlock() {
      const editorRoot = root.closest('.cm-editor');
      clearMediaSelection(editorRoot, 'mda-cm-media-selected');
      clearBlockWidgetSelection(editorRoot || document);
      clearSelectedImageBlock();
      clearSelectedMermaidBlock();
      clearSelectedMathBlock();
      clearSelectedInlineMath();
      clearInlineMathSelectedClass(editorRoot);
      frame.classList.add('mda-cm-media-selected');
      root.classList.add('mda-cm-block-selected');
      setSelectedBlock({
        kind: 'html',
        from: self.from,
        to: self.to,
        source: self.source,
      });
      try {
        if (view && self.from != null) {
          const pos = Math.max(0, Math.min(self.from, view.state.doc.length));
          const sel = view.state.selection.main;
          if (sel.from !== pos || sel.to !== pos) {
            view.dispatch({
              selection: { anchor: pos, head: pos },
              annotations: Transaction.addToHistory.of(false),
            });
          }
          view.focus();
        }
      } catch (_) {
        /* ignore */
      }
    }

    function commitSourceEdit() {
      const next = readSourceText();
      if (next === self.source) return;
      if (typeof opts.onEditHtmlBlock === 'function') {
        opts.onEditHtmlBlock({ from: self.from, to: self.to, source: next });
      }
    }

    function setSourceMode(on) {
      if (!on && showingSource) commitSourceEdit();
      showingSource = !!on;
      frame.classList.toggle('mda-cm-html-source-mode', showingSource);
      if (sourceBtn) {
        sourceBtn.classList.toggle('mda-cm-tb-active', showingSource);
        const key = showingSource ? 'widgetCodePreview' : 'widgetCodeSource';
        sourceBtn.setAttribute('data-i18n-key', key);
        const label = uiT(key, t);
        sourceBtn.textContent = label;
        sourceBtn.title = label;
      }
      if (showingSource) {
        sourceEditor.textContent = self.source;
        requestAnimationFrame(function () {
          sourceEditor.focus();
        });
      } else {
        renderFromSource();
      }
      requestHeightMeasure();
    }

    toolbar.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      if (action === 'copy') {
        copyText(showingSource ? readSourceText() : self.source, opts.copyText);
        return;
      }
      if (action === 'source') {
        setSourceMode(!showingSource);
        if (!showingSource) selectBlock();
      }
    });

    // 渲染区里的链接：预览内点击不得导航（会把渲染进程带离 index.html，白屏）
    body.addEventListener('click', function (e) {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      const href = (a.getAttribute('href') || '').trim();
      if (href && href.charAt(0) !== '#' && typeof opts.onOpenLink === 'function') {
        opts.onOpenLink(href);
      }
    });
    body.addEventListener('error', function (e) {
      const target = e.target;
      if (target && target.tagName === 'IMG') target.classList.add('mda-cm-html-img-broken');
    }, true);

    sourceEditor.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
    sourceEditor.addEventListener('blur', commitSourceEdit);
    sourceEditor.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSourceMode(false);
        selectBlock();
      }
    });

    root.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-html-source-input')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-toolbar [data-action]')) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      selectBlock();
    });

    frame.addEventListener('dblclick', function (e) {
      if (e.target.closest('.mda-cm-block-toolbar')) return;
      if (e.target.closest('.mda-cm-html-source-input')) return;
      e.preventDefault();
      e.stopPropagation();
      selectBlock();
      setSourceMode(true);
    });

    attachBlockDragHandle(
      frame,
      view,
      { from: self.from, to: self.to, source: self.source },
      {
        blockRoot: root,
        blockSelector: '.mda-cm-html-block',
        replaceOnHover: false,
        blockKind: 'html',
        blockMenuHandlers: opts.blockMenuHandlers,
        t: t,
        onMoveBlock: opts.onMoveHtmlBlock,
      }
    );

    renderFromSource();
    root.appendChild(frame);
    this.bindMeasure(view, root);
    requestAnimationFrame(function () {
      requestHeightMeasure();
    });
    return root;
  }
}

module.exports = {
  HtmlBlockWidget: HtmlBlockWidget,
  MIN_HEIGHT: MIN_HEIGHT,
};

/**
 * 标题行左上角拖动手柄：零宽 side widget，不替换正文。
 */
'use strict';

const { WidgetType } = require('@codemirror/view');
const { attachBlockDragHandle } = require('./block-drag-handle');
const { showBlockHandleMenu } = require('./block-handle-menu');
const { clearBlockWidgetSelection, clearMediaSelection, uiT } = require('./widget-common');
const { setSelectedBlock } = require('./block-selection');
const { clearSelectedImageBlock } = require('./image-selection');
const { clearSelectedMermaidBlock } = require('./mermaid-selection');
const { clearSelectedInlineMath, clearInlineMathSelectedClass } = require('./inline-math-selection');
const { Transaction } = require('@codemirror/state');

class HeadingHandleWidget extends WidgetType {
  /**
   * @param {{
   *   from: number,
   *   to: number,
   *   source?: string,
   *   t?: Function,
   *   blockMenuHandlers?: object,
   *   headingLevel?: number,
   *   onMoveHeadingBlock?: Function,
   * }} opts
   */
  constructor(opts) {
    super();
    opts = opts || {};
    this.from = opts.from;
    this.to = opts.to;
    this.headingLevel = opts.headingLevel != null ? opts.headingLevel : 1;
    this.source = opts.source || '';
    this.opts = opts;
  }

  eq(other) {
    return (
      other instanceof HeadingHandleWidget &&
      other.from === this.from &&
      other.to === this.to &&
      other.headingLevel === this.headingLevel &&
      other.source === this.source
    );
  }

  toDOM(view) {
    const self = this;
    const opts = this.opts;
    const wrap = document.createElement('span');
    wrap.className = 'mda-cm-heading-handle-anchor mda-cm-heading-handle-h' + Math.max(1, Math.min(6, self.headingLevel || 1));
    wrap.setAttribute('contenteditable', 'false');
    wrap.setAttribute('data-mda-block-from', String(this.from));
    wrap.setAttribute('data-mda-block-to', String(this.to));
    if (this.source) wrap.setAttribute('data-mda-block-source', this.source);
    wrap.setAttribute('data-mda-block-kind', 'heading');

    const t = opts.t;
    const range = { from: self.from, to: self.to, source: self.source };

    function selectAnchor() {
      clearMediaSelection(view.dom);
      clearBlockWidgetSelection(view.dom);
      clearSelectedImageBlock();
      clearSelectedMermaidBlock();
      clearSelectedInlineMath();
      clearInlineMathSelectedClass(view.dom);
      wrap.classList.add('mda-cm-block-selected');
      setSelectedBlock({
        kind: 'heading',
        from: self.from,
        to: self.to,
        source: self.source,
      });
      try {
        if (self.from != null) {
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

    attachBlockDragHandle(wrap, view, range, {
      blockRoot: wrap,
      blockSelector: '.mda-cm-heading-handle-anchor',
      replaceOnHover: false,
      blockKind: 'h' + Math.max(1, Math.min(6, self.headingLevel || 1)),
      blockMenuHandlers: opts.blockMenuHandlers,
      t: t,
      onMoveBlock: opts.onMoveHeadingBlock,
      onHandleClick: function (handle, block) {
        selectAnchor();
        showBlockHandleMenu({
          anchorEl: handle,
          blockRoot: wrap,
          view: view,
          block: block,
          blockKind: 'heading',
          t: t,
          handlers: opts.blockMenuHandlers,
        });
      },
    });

    wrap.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) {
        selectAnchor();
      }
    });

    return wrap;
  }

  ignoreEvent() {
    return true;
  }

  get estimatedHeight() {
    return 0;
  }
}

module.exports = {
  HeadingHandleWidget: HeadingHandleWidget,
};

/**
 * M8-B/C 实时预览视图层：语法隐藏（D15 = hide-mark 零宽 replace widget + atomicRanges）。
 */
'use strict';

const cmView = require('@codemirror/view');
const EditorView = cmView.EditorView;
const keymap = cmView.keymap;
const Decoration = cmView.Decoration;
const ViewPlugin = cmView.ViewPlugin;
const WidgetType = cmView.WidgetType;
const { RangeSetBuilder, StateField, StateEffect, Transaction, Prec } = require('@codemirror/state');
const { syntaxTree, ensureSyntaxTree } = require('@codemirror/language');
const { buildDecorationSpecs, collectSyntaxNodes } = require('./model/build-specs');
const { HiddenLineWidget, HIDE_MARK_WIDGET } = require('./widgets/hidden-line');
const editorConfig = require('./config');
const { atomicRangesFromPlugin, atomicRangesFromBlockField, atomicRangesFromHideLines } = require('./view/atomic-ranges');
const { createReadonlyChangeFilter } = require('./view/change-filter');
const { collectReadonlyRanges } = require('./model/readonly-blocks');
const { parseFencedCode, expandFenceBlockRange } = require('./model/parse-fence');
const { expandGfmTableRange, expandTableBlockRange } = require('./model/parse-table');
const {
  createTableMarkdownPasteHandler,
} = require('./model/table-model');
const {
  createBlockFocusField,
  setBlockFocus,
  readBlockFocus,
} = require('./state/block-focus');
const { TableWidget } = require('./widgets/table');
const { QuoteHandleWidget } = require('./widgets/quote-handle');
const { HeadingHandleWidget } = require('./widgets/heading-handle');
const { ImageWidget } = require('./widgets/image');
const { CodeFenceWidget } = require('./widgets/code');
const { MermaidWidget } = require('./widgets/mermaid');
const { InlineMathWidget, BlockMathWidget } = require('./widgets/math');
const { createAnnoMalformedGutter, appendAnnoLineDecorations } = require('./anno-gutter');
const { createAnnoParagraphSyncExtension } = require('./anno-paragraph-sync');
const { createClickCollapseExtension } = require('./click-collapse');
const { createContextMenuExtension } = require('./context-menu');
const { createWidgetEditableGuardExtension } = require('./widget-editable-guard');
const {
  createImageSelectionSyncPlugin,
} = require('./widgets/image-selection');
const {
  createMermaidSelectionSyncPlugin,
} = require('./widgets/mermaid-selection');
const {
  createBlockSelectionSyncPlugin,
} = require('./widgets/block-selection');
const {
  createInlineMathSelectionSyncPlugin,
  createInlineMathShortcutKeymap,
} = require('./widgets/inline-math-selection');
const { createBlockMenuHandlers } = require('./widgets/block-menu-handlers');
const { createEmptyLineInsertExtension } = require('./empty-line-insert');
const { createOutlineClickSyncExtension } = require('./outline-click-sync');
const {
  createMermaidShortcutKeymap,
  createMermaidKeydownHandler,
} = require('./mermaid-shortcuts');
const {
  createCodeShortcutKeymap,
  createCodeKeydownHandler,
} = require('./code-shortcuts');
const { createMediaOutsideClickPlugin } = require('./widgets/media-outside-click');
const {
  createImageShortcutKeymap,
  createImagePasteHandler,
  createImageKeydownHandler,
} = require('./image-shortcuts');
const {
  handleMarkdownSyntaxCopy,
  handleMarkdownSyntaxCut,
  handleMarkdownSyntaxPaste,
} = require('./syntax-clipboard');
const { handlePreviewHeadingEnter, handlePreviewHeadingBackspace } = require('./heading-enter');
const {
  handleInlineDelimiterBackspace,
  handleInlineDelimiterDelete,
} = require('./state/inline-delimiter-ops');
const { createDocLineCursorKeymap } = require('./doc-line-cursor');
const { BlockReplaceWidget, DEFAULT_LINE_HEIGHT } = require('./widgets/block-widget-base');
const { attachBlockDragHandle } = require('./widgets/block-drag-handle');
const {
  clearBlockWidgetSelection,
  clearMediaSelection,
} = require('./widgets/widget-common');
const { setSelectedBlock, clearSelectedBlock } = require('./widgets/block-selection');
const { clearSelectedImageBlock } = require('./widgets/image-selection');
const { clearSelectedMermaidBlock } = require('./widgets/mermaid-selection');

class BulletWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'mda-cm-bullet';
    el.textContent = '\u2022';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  eq() {
    return true;
  }
  ignoreEvent() {
    return true;
  }
}

class HrWidget extends BlockReplaceWidget {
  constructor(source, opts) {
    // 视觉含上下 padding，初始估高勿用单行 26，否则测高前点击会偏行
    super(source || '---', Object.assign({ minHeight: 52, heightKind: 'hr' }, opts || {}));
    this.opts = opts || {};
  }
  toDOM(view) {
    const self = this;
    const opts = this.opts;
    const root = document.createElement('div');
    root.className = 'mda-cm-hr-block';
    root.setAttribute('contenteditable', 'false');
    if (self.from != null) root.setAttribute('data-mda-block-from', String(self.from));
    if (self.to != null) root.setAttribute('data-mda-block-to', String(self.to));
    if (self.source) root.setAttribute('data-mda-block-source', self.source);

    const frame = document.createElement('div');
    frame.className = 'mda-cm-hr-frame';
    const line = document.createElement('hr');
    line.className = 'mda-cm-hr';
    frame.appendChild(line);

    function pinCaret() {
      if (!view || self.from == null) return;
      try {
        const pos = Math.max(0, Math.min(self.from, view.state.doc.length));
        const sel = view.state.selection.main;
        if (sel.from !== pos || sel.to !== pos) {
          view.dispatch({
            selection: { anchor: pos, head: pos },
            annotations: Transaction.addToHistory.of(false),
          });
        }
        view.focus();
      } catch (_) {
        /* ignore */
      }
    }

    function clearSelect() {
      root.classList.remove('mda-cm-block-selected');
      frame.classList.remove('mda-cm-hr-selected');
      clearSelectedBlock();
    }

    function selectBlock() {
      clearMediaSelection(view.dom);
      clearBlockWidgetSelection(view.dom);
      clearSelectedImageBlock();
      clearSelectedMermaidBlock();
      root.classList.add('mda-cm-block-selected');
      frame.classList.add('mda-cm-hr-selected');
      setSelectedBlock({
        kind: 'hr',
        from: self.from,
        to: self.to,
        source: self.source,
      });
      // 收拢选区到块起点，避免旧光标残留导致双光标
      pinCaret();
    }

    attachBlockDragHandle(
      frame,
      view,
      { from: self.from, to: self.to, source: self.source },
      {
        blockRoot: root,
        blockSelector: '.mda-cm-hr-block',
        replaceOnHover: false,
        blockKind: 'hr',
        blockMenuHandlers: opts.blockMenuHandlers,
        t: opts.t,
        onMoveBlock: opts.onMoveHrBlock,
      }
    );

    root.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.mda-cm-block-drag-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      // 已选中时再点分割线位 → 取消选中
      if (root.classList.contains('mda-cm-block-selected')) {
        clearSelect();
        pinCaret();
        return;
      }
      selectBlock();
    });

    root.appendChild(frame);
    this.bindMeasure(view, root);
    return root;
  }
  eq(other) {
    return other instanceof HrWidget && other.source === this.source;
  }
}

class TaskWidget extends WidgetType {
  constructor(checked, from, to, title) {
    super();
    this.checked = checked;
    this.from = from;
    this.to = to;
    this.title = title || '';
  }
  toDOM(view) {
    const el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = !!this.checked;
    el.className = 'mda-cm-task';
    if (this.title) el.title = this.title;
    const from = this.from;
    const to = this.to;
    const checked = this.checked;
    el.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        changes: { from: from, to: to, insert: checked ? '[ ]' : '[x]' },
      });
    });
    return el;
  }
  eq(other) {
    return (
      other instanceof TaskWidget &&
      other.checked === this.checked &&
      other.from === this.from &&
      other.to === this.to
    );
  }
  ignoreEvent() {
    return false;
  }
}

function addSortedNonOverlapping(ranges) {
  const builder = new RangeSetBuilder();
  ranges.sort(function (a, b) {
    if (a.from !== b.from) return a.from - b.from;
    if (a.to !== b.to) return a.to - b.to;
    return 0;
  });
  let lastTo = -1;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r.from > r.to) continue;
    if (r.from < lastTo) continue;
    try {
      builder.add(r.from, r.to, r.deco);
      lastTo = r.to;
    } catch (_) { /* skip */ }
  }
  return builder.finish();
}

function flattenStyles(styles) {
  if (!styles.length) return [];
  const points = [];
  for (let i = 0; i < styles.length; i++) {
    const s = styles[i];
    if (s.from >= s.to) continue;
    points.push(s.from, s.to);
  }
  points.sort(function (a, b) {
    return a - b;
  });
  const uniq = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || points[i] !== points[i - 1]) uniq.push(points[i]);
  }
  const out = [];
  for (let i = 0; i < uniq.length - 1; i++) {
    const from = uniq[i];
    const to = uniq[i + 1];
    const classes = [];
    let href = '';
    for (let j = 0; j < styles.length; j++) {
      const s = styles[j];
      if (s.from <= from && s.to >= to) {
        if (s.cls && classes.indexOf(s.cls) < 0) classes.push(s.cls);
        if (s.href) href = s.href;
      }
    }
    if (!classes.length) continue;
    const attrs = href ? { 'data-mda-href': href } : undefined;
    out.push({
      from: from,
      to: to,
      deco: cmView.Decoration.mark({
        class: classes.join(' '),
        attributes: attrs,
      }),
    });
  }
  return out;
}


/**
 * CM6 block replace 要求区间贴齐「行首 → 下一行行首（或文档末）」。
 * @param {string} text
 * @param {number} from
 * @param {number} to
 */
function expandBlockRange(text, from, to) {
  const len = text.length;
  let start = Math.max(0, Math.min(from, len));
  let end = Math.max(start, Math.min(to, len));
  while (start > 0 && text.charAt(start - 1) !== '\n') start -= 1;
  if (end < len) {
    if (end > 0 && text.charAt(end - 1) !== '\n') {
      while (end < len && text.charAt(end) !== '\n') end += 1;
      if (end < len) end += 1;
    }
  }
  if (end < start) end = start;
  return { from: start, to: end };
}

/**
 * 块级 replace：须 inclusiveEnd:false。
 * 默认 inclusive 会把终点位置（常为下一空行 from===to）吞进装饰，空行塌成 0 高且不可点。
 * @param {import('@codemirror/view').WidgetType} widget
 */
function blockReplaceDeco(widget) {
  return cmView.Decoration.replace({
    widget: widget,
    block: true,
    inclusiveEnd: false,
  });
}

function overlapsHide(from, to, hideRanges) {
  for (let i = 0; i < hideRanges.length; i++) {
    const h = hideRanges[i];
    if (from < h.to && to > h.from) return true;
  }
  return false;
}

function overlapsBlock(from, to, blockRanges) {
  for (let i = 0; i < blockRanges.length; i++) {
    const b = blockRanges[i];
    if (from < b.to && to > b.from) return true;
  }
  return false;
}

/** 块级 / 行内 widget 分阶段闸门，见 editor/config.js */
function widgetEnabled(kind) {
  if (kind === 'math-inline' || kind === 'math-block') {
    return editorConfig.mathWidgetEnabled(kind);
  }
  if (kind === 'quote-handle' || kind === 'heading-handle') {
    return editorConfig.blockWidgetEnabled(kind);
  }
  return editorConfig.blockWidgetEnabled(kind);
}

function blockWidgetEnabled(kind) {
  return editorConfig.blockWidgetEnabled(kind);
}

function blockWidgetsEnabled() {
  return editorConfig.blockWidgetsEnabled();
}

/**
 * @param {object[]} specs
 * @param {string} text
 * @param {{ resolveImageUrl?: Function, renderMarkdown?: Function }} [liveOpts]
 */
function buildLayerDecos(specs, text, liveOpts) {
  liveOpts = liveOpts || {};
  const widgetOpts = Object.assign({}, liveOpts, {
    renderMarkdown: liveOpts.renderMarkdown,
    resolveImageUrl: liveOpts.resolveImageUrl,
    highlightCode: liveOpts.highlightCode,
    t: liveOpts.t,
    copyText: liveOpts.copyText,
    copyHtml: liveOpts.copyHtml,
    onOpenZoom: liveOpts.onOpenZoom,
    onCopyImage: liveOpts.onCopyImage,
    onScaleImage: liveOpts.onScaleImage,
    getSavedDisplayWidth: liveOpts.getSavedDisplayWidth,
    onDeleteImageBlock: liveOpts.onDeleteImageBlock,
    onReplaceImageBlock: liveOpts.onReplaceImageBlock,
    onCopyImageBlock: liveOpts.onCopyImageBlock,
    onMoveImageBlock: liveOpts.onMoveImageBlock,
    onDropReplaceImageBlock: liveOpts.onDropReplaceImageBlock,
    onPasteImageBlock: liveOpts.onPasteImageBlock,
    onPasteTableCellImage: liveOpts.onPasteTableCellImage,
    onInsertImageAt: liveOpts.onInsertImageAt,
    onStartImageResize: liveOpts.onStartImageResize,
    onImageResize: liveOpts.onImageResize,
    onImageResizeEnd: liveOpts.onImageResizeEnd,
    getResizeMaxWidth: liveOpts.getResizeMaxWidth,
    onScaleMermaid: liveOpts.onScaleMermaid,
    getSavedMermaidDisplayWidth: liveOpts.getSavedMermaidDisplayWidth,
    onMermaidResize: liveOpts.onMermaidResize,
    onMermaidResizeEnd: liveOpts.onMermaidResizeEnd,
    onMermaidResizeReset: liveOpts.onMermaidResizeReset,
    onCopyMermaidImage: liveOpts.onCopyMermaidImage,
    onCopyMathImage: liveOpts.onCopyMathImage,
    onEditMermaidBlock: liveOpts.onEditMermaidBlock,
    onDeleteMermaidBlock: liveOpts.onDeleteMermaidBlock,
    onMoveMermaidBlock: liveOpts.onMoveMermaidBlock,
    onEditCodeBlock: liveOpts.onEditCodeBlock,
    onEditMathBlock: liveOpts.onEditMathBlock,
    onScaleCodeBlock: liveOpts.onScaleCodeBlock,
    onScaleTableBlock: liveOpts.onScaleTableBlock,
    onDeleteCodeBlock: liveOpts.onDeleteCodeBlock,
    onMoveCodeBlock: liveOpts.onMoveCodeBlock,
    onMoveMathBlock: liveOpts.onMoveMathBlock,
    onMoveTableBlock: liveOpts.onMoveTableBlock,
    onMoveQuoteBlock: liveOpts.onMoveQuoteBlock,
    onMoveHeadingBlock: liveOpts.onMoveHeadingBlock,
    onMoveHrBlock: liveOpts.onMoveHrBlock,
    onSwitchSource: liveOpts.onSwitchSource,
    blockMenuHandlers: liveOpts.blockMenuHandlers,
    onFocusBlock: liveOpts.onFocusBlock,
    renderMermaid: liveOpts.renderMermaid,
    lineHeight: DEFAULT_LINE_HEIGHT,
  });
  const docLen = (text || '').length;
  const hides = [];
  const styles = [];
  const widgets = []; // 仅 inline（可走 ViewPlugin）
  const blockWidgets = []; // block:true → 必须走 StateField decorations.from
  const blockWidgetRanges = [];
  const lines = [];
  const hideLines = [];
  const hideRanges = [];

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    if (s.from < 0 || s.to > docLen) continue;
    if (s.kind === 'hide-line' && s.from < s.to) {
      hideRanges.push(expandBlockRange(text, s.from, s.to));
    }
  }

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    if (s.from < 0 || s.to > docLen) continue;
    if (s.kind !== 'widget') continue;
    if (
      s.widget === 'hr' ||
      s.widget === 'table' ||
      s.widget === 'code' ||
      s.widget === 'image' ||
      s.widget === 'math-block'
    ) {
      const br =
        s.widget === 'table'
          ? expandTableBlockRange(text, s.from, s.to)
          : s.widget === 'code'
            ? expandFenceBlockRange(text, s.from, s.to)
            : expandBlockRange(text, s.from, s.to);
      blockWidgetRanges.push(br);
    }
  }

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    if (s.from < 0 || s.to > docLen) continue;

    if (s.kind === 'hide-line') {
      if (s.from < s.to) {
        const br = expandBlockRange(text, s.from, s.to);
        hideLines.push({
          from: br.from,
          to: br.to,
          deco: blockReplaceDeco(new HiddenLineWidget()),
        });
        lines.push({
          from: br.from,
          to: br.from,
          deco: cmView.Decoration.line({ class: 'mda-cm-anno-hide-line' }),
        });
      }
      continue;
    }

    if (overlapsHide(s.from, s.to === s.from ? s.from + 1 : s.to, hideRanges)) {
      continue;
    }

    const isBlockWidgetSpec =
      s.kind === 'widget' &&
      (s.widget === 'hr' ||
        s.widget === 'table' ||
        s.widget === 'code' ||
        s.widget === 'image' ||
        s.widget === 'math-block');
    if (
      blockWidgetRanges.length > 0 &&
      !isBlockWidgetSpec &&
      overlapsBlock(s.from, s.to === s.from ? s.from + 1 : s.to, blockWidgetRanges)
    ) {
      continue;
    }

    if (s.kind === 'hide-mark') {
      if (s.from < s.to) {
        // 必须用 replace 零宽 widget + atomicRanges。
        // Decoration.mark + display:none 会让字符在文档坐标系仍占宽、视觉为 0，横向 Δ 可达数百 px。
        hides.push({
          from: s.from,
          to: s.to,
          deco: cmView.Decoration.replace({ widget: HIDE_MARK_WIDGET }),
        });
      }
    } else if (s.kind === 'style' || s.kind === 'raw') {
      if (s.from < s.to) {
        styles.push({ from: s.from, to: s.to, cls: s.cls, href: s.href });
      }
    } else if (s.kind === 'line-style') {
      lines.push({
        from: s.from,
        to: s.from,
        deco: cmView.Decoration.line({ class: s.cls || '' }),
      });
    } else if (s.kind === 'widget') {
      if (s.widget === 'quote-handle') {
        if (!widgetEnabled('quote-handle')) continue;
        const qFrom = s.blockFrom != null ? s.blockFrom : s.from;
        const qTo = s.blockTo != null ? s.blockTo : s.to;
        widgets.push({
          from: qFrom,
          to: qFrom,
          deco: cmView.Decoration.widget({
            widget: new QuoteHandleWidget({
              from: qFrom,
              to: qTo,
              source: s.source || text.slice(qFrom, qTo),
              t: widgetOpts.t,
              blockMenuHandlers: widgetOpts.blockMenuHandlers,
              onMoveQuoteBlock: widgetOpts.onMoveQuoteBlock,
            }),
            side: -1,
          }),
        });
        continue;
      }
      if (s.widget === 'heading-handle') {
        if (!widgetEnabled('heading-handle')) continue;
        const hFrom = s.blockFrom != null ? s.blockFrom : s.from;
        const hTo = s.blockTo != null ? s.blockTo : s.to;
        const hAnchor = s.from;
        const hLevel = s.headingLevel != null ? s.headingLevel : 1;
        widgets.push({
          from: hAnchor,
          to: hAnchor,
          deco: cmView.Decoration.widget({
            widget: new HeadingHandleWidget({
              from: hFrom,
              to: hTo,
              headingLevel: hLevel,
              source: s.source || text.slice(hFrom, hTo),
              t: widgetOpts.t,
              blockMenuHandlers: widgetOpts.blockMenuHandlers,
              onMoveHeadingBlock: widgetOpts.onMoveHeadingBlock,
            }),
            side: -1,
          }),
        });
        continue;
      }
      if (s.from >= s.to) continue;
      let deco = null;
      let from = s.from;
      let to = s.to;
      if (s.widget === 'bullet') {
        deco = cmView.Decoration.replace({ widget: new BulletWidget() });
      } else if (s.widget === 'task') {
        deco = cmView.Decoration.replace({
          widget: new TaskWidget(
            !!s.checked,
            s.from,
            s.to,
            widgetOpts.t ? widgetOpts.t('widgetTaskToggle') : ''
          ),
        });
      } else if (s.widget === 'hr') {
        if (!blockWidgetEnabled('hr')) continue;
        const br = expandBlockRange(text, s.from, s.to);
        blockWidgets.push({
          from: br.from,
          to: br.to,
          deco: blockReplaceDeco(
            new HrWidget(text.slice(br.from, br.to), Object.assign({}, widgetOpts, {
              from: br.from,
              to: br.to,
              onMoveHrBlock: widgetOpts.onMoveHrBlock,
            }))
          ),
        });
        continue;
      } else if (s.widget === 'table') {
        if (!blockWidgetEnabled('table')) continue;
        const br = expandTableBlockRange(text, s.from, s.to);
        blockWidgets.push({
          from: br.from,
          to: br.to,
          deco: blockReplaceDeco(
            new TableWidget(text.slice(br.from, br.to), Object.assign({}, widgetOpts, {
              from: br.from,
              to: br.to,
            }))
          ),
        });
        continue;
      } else if (s.widget === 'code') {
        const br = expandFenceBlockRange(text, s.from, s.to);
        // 必须以收缩后的区间切片为源，避免语法树偏大 / 旧 source 与 replace 区间不一致导致双显
        const src = text.slice(br.from, br.to);
        const parsed = parseFencedCode(src);
        const isMermaid = parsed && /^mermaid$/i.test(parsed.lang || '');
        if (isMermaid ? !blockWidgetEnabled('mermaid') : !blockWidgetEnabled('code')) continue;
        const W = isMermaid ? MermaidWidget : CodeFenceWidget;
        blockWidgets.push({
          from: br.from,
          to: br.to,
          deco: blockReplaceDeco(
            new W(src, Object.assign({}, widgetOpts, {
              from: br.from,
              to: br.to,
            }))
          ),
        });
        continue;
      } else if (s.widget === 'math-inline') {
        if (!widgetEnabled('math-inline')) continue;
        deco = cmView.Decoration.replace({
          widget: new InlineMathWidget(s.source || text.slice(s.from, s.to), s.tex || '', {
            from: s.from,
            to: s.to,
            copyText: widgetOpts.copyText,
          }),
        });
      } else if (s.widget === 'math-block') {
        if (!widgetEnabled('math-block')) continue;
        const br = expandBlockRange(text, s.from, s.to);
        blockWidgets.push({
          from: br.from,
          to: br.to,
          deco: blockReplaceDeco(
            new BlockMathWidget(s.source || text.slice(br.from, br.to), Object.assign({}, widgetOpts, {
              from: br.from,
              to: br.to,
            }))
          ),
        });
        continue;
      } else if (s.widget === 'image') {
        if (!blockWidgetEnabled('image')) continue;
        const br = expandBlockRange(text, s.from, s.to);
        blockWidgets.push({
          from: br.from,
          to: br.to,
          deco: blockReplaceDeco(
            new ImageWidget(s.source || text.slice(br.from, br.to), Object.assign({}, widgetOpts, {
              from: br.from,
              to: br.to,
            }))
          ),
        });
        continue;
      }
      if (deco) widgets.push({ from: from, to: to, deco: deco });
    }
  }

  appendAnnoLineDecorations(text, lines, liveOpts, cmView.Decoration);

  return {
    block: addSortedNonOverlapping(hideLines.concat(blockWidgets)),
    hideBlock: addSortedNonOverlapping(hideLines),
    hide: addSortedNonOverlapping(hides),
    style: addSortedNonOverlapping(flattenStyles(styles)),
    widget: addSortedNonOverlapping(widgets),
    line: addSortedNonOverlapping(lines),
  };
}

function emptyLayers() {
  return {
    block: cmView.Decoration.none,
    hideBlock: cmView.Decoration.none,
    hide: cmView.Decoration.none,
    style: cmView.Decoration.none,
    widget: cmView.Decoration.none,
    line: cmView.Decoration.none,
  };
}

/**
 * Lezer 增量树在 ensureSyntaxTree 返回前可能只覆盖文首；大文档须用其返回值。
 * @param {number} end
 */
function syntaxTreeBudget(end) {
  return Math.min(12000, Math.max(400, Math.ceil(end / 2.5)));
}

function parseTreeForState(state, upto) {
  const end = Math.min(state.doc.length, upto == null ? state.doc.length : upto);
  try {
    if (typeof ensureSyntaxTree === 'function') {
      const tree = ensureSyntaxTree(state, end, syntaxTreeBudget(end));
      if (tree) return tree;
    }
  } catch (_) {
    /* ignore */
  }
  return syntaxTree(state);
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {{ resolveImageUrl?: Function }} [liveOpts]
 * @param {{ composing?: boolean, viewportTo?: number }} [viewHints]
 * @param {import('@codemirror/state').StateField<unknown>} [blockFocusField]
 */
function buildDecosFromState(state, liveOpts, viewHints, blockFocusField) {
  viewHints = viewHints || {};
  try {
    const text = state.doc.toString();
    const upto =
      viewHints.viewportTo != null
        ? Math.min(state.doc.length, viewHints.viewportTo + 4000)
        : state.doc.length;
    const tree = parseTreeForState(state, upto);
    const nodes = collectSyntaxNodes(tree, text);
    const specs = buildDecorationSpecs(text, nodes, {
      widgetEnabled: function (kind) {
        return widgetEnabled(kind);
      },
    });
    return {
      layers: buildLayerDecos(specs, text, liveOpts),
      treeLen: tree.length,
    };
  } catch (_) {
    return {
      layers: emptyLayers(),
      treeLen: 0,
    };
  }
}

function buildDecos(view, liveOpts, blockFocusField) {
  return buildDecosFromState(view.state, liveOpts, {
    composing: view.composing,
    viewportTo: view.viewport.to,
  }, blockFocusField);
}

/**
 * block 装饰必须经 StateField → EditorView.decorations.from 提供；
 * 函数形式的 facet / ViewPlugin 都会抛
 * 「Block decorations may not be specified via plugins」。
 */
function createBlockDecoField(liveOpts, blockFocusField) {
  return StateField.define({
    create: function (state) {
      const built = buildDecosFromState(state, liveOpts, {}, blockFocusField);
      return {
        deco: built.layers.block || cmView.Decoration.none,
        hideLineDeco: built.layers.hideBlock || cmView.Decoration.none,
        treeLen: built.treeLen || 0,
      };
    },
    update: function (prev, tr) {
      let focusChanged = false;
      if (blockFocusField) {
        try {
          focusChanged =
            tr.startState.field(blockFocusField) !== tr.state.field(blockFocusField);
        } catch (_) {
          focusChanged = false;
        }
      }
      const docLen = tr.state.doc.length;
      const prevTreeLen = prev.treeLen || 0;
      const treeStillIncomplete = prevTreeLen < docLen;
      if (!tr.docChanged && !focusChanged && !treeStillIncomplete) {
        return prev;
      }
      const built = buildDecosFromState(tr.state, liveOpts, {}, blockFocusField);
      const nextTreeLen = built.treeLen || 0;
      // 不因 selectionSet 重建：始终隐藏语法时选区不改变装饰；
      // 重建会换新 widget 实例并短暂丢失测高 → 点击/光标 Δ 飙升。
      if (
        !tr.docChanged &&
        !focusChanged &&
        nextTreeLen === prevTreeLen &&
        nextTreeLen >= docLen
      ) {
        return prev;
      }
      return {
        deco: built.layers.block || cmView.Decoration.none,
        hideLineDeco: built.layers.hideBlock || cmView.Decoration.none,
        treeLen: nextTreeLen,
      };
    },
    provide: function (field) {
      return EditorView.decorations.from(field, function (v) {
        return v.deco || cmView.Decoration.none;
      });
    },
  });
}

function hrefAtEvent(view, event) {
  const target = event.target;
  if (target && target.closest) {
    const el = target.closest('[data-mda-href]');
    if (el) return el.getAttribute('data-mda-href') || '';
  }
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return '';
  let node = syntaxTree(view.state).resolveInner(pos, 1);
  const text = view.state.doc.toString();
  while (node) {
    if (node.name === 'Link') {
      const slice = text.slice(node.from, node.to);
      const m = /^\[([\s\S]*?)\]\(([\s\S]*?)\)$/.exec(slice);
      return m ? String(m[2] || '').trim() : '';
    }
    if (node.name === 'Autolink') {
      return text.slice(node.from + 1, node.to - 1).trim();
    }
    if (node.name === 'URL') {
      return text.slice(node.from, node.to).trim();
    }
    node = node.parent;
  }
  return '';
}

var layerBuildCache = { doc: null, fp: '', result: null, opts: null };

/** 批注筛选变更：须强制重算 line 色条（缓存键不含 filter 回调） */
const AnnoFilterRefresh = StateEffect.define();

function annoDecorCacheKey(liveOpts) {
  if (liveOpts && typeof liveOpts.getAnnoFilterRevision === 'function') {
    return String(liveOpts.getAnnoFilterRevision());
  }
  return '0';
}

function transactionHasAnnoFilterRefresh(tr) {
  for (let i = 0; i < tr.effects.length; i++) {
    if (tr.effects[i].is(AnnoFilterRefresh)) return true;
  }
  return false;
}

function invalidateLayerBuildCache() {
  layerBuildCache.doc = null;
  layerBuildCache.fp = '';
  layerBuildCache.result = null;
}

function getBuiltLayers(view, liveOpts, blockFocusField) {
  const fp =
    view.viewport.from +
    ':' +
    view.viewport.to +
    ':' +
    (view.composing ? '1' : '0') +
    ':' +
    parseTreeForState(view.state, view.state.doc.length).length;
  const focus = blockFocusField ? readBlockFocus(view.state, blockFocusField) : null;
  const focusKey = focus ? focus.from + '-' + focus.to + '-' + (focus.kind || '') : '';
  const fpFull = fp + ':' + focusKey + ':' + annoDecorCacheKey(liveOpts);
  if (
    layerBuildCache.doc === view.state.doc &&
    layerBuildCache.fp === fpFull &&
    layerBuildCache.opts === liveOpts &&
    layerBuildCache.result
  ) {
    return layerBuildCache.result;
  }
  const built = buildDecos(view, liveOpts, blockFocusField);
  layerBuildCache.doc = view.state.doc;
  layerBuildCache.fp = fpFull;
  layerBuildCache.opts = liveOpts;
  layerBuildCache.result = built;
  return built;
}

function makeLayerPlugin(layerKey, liveOpts, pluginOpts, blockFocusField) {
  pluginOpts = pluginOpts || {};
  const spec = {
    decorations: function (v) {
      return v.decorations;
    },
  };
  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        const built = getBuiltLayers(view, liveOpts, blockFocusField);
        this._imePending = false;
        this._treeLen = parseTreeForState(view.state, view.state.doc.length).length;
        this._lastFocusKey = blockFocusField ? focusKey(readBlockFocus(view.state, blockFocusField)) : '';
        this.decorations = built.layers[layerKey] || cmView.Decoration.none;
      }
      update(update) {
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
        }
        if (update.view.composing) {
          this._imePending = true;
          return;
        }
        const treeLen = parseTreeForState(update.view.state, update.view.state.doc.length).length;
        const treeGrew = treeLen > this._treeLen;
        const focusKeyNow = blockFocusField
          ? focusKey(readBlockFocus(update.state, blockFocusField))
          : '';
        const focusChanged = focusKeyNow !== this._lastFocusKey;
        const cacheInvalid = layerBuildCache.doc === null;
        let annoFilterChanged = false;
        for (let ti = 0; ti < update.transactions.length; ti++) {
          if (transactionHasAnnoFilterRefresh(update.transactions[ti])) {
            annoFilterChanged = true;
            break;
          }
        }
        if (
          !(
            this._imePending ||
            update.docChanged ||
            update.viewportChanged ||
            treeGrew ||
            focusChanged ||
            cacheInvalid ||
            annoFilterChanged
          )
        ) {
          return;
        }
        this._imePending = false;
        this._lastFocusKey = focusKeyNow;
        const built = getBuiltLayers(update.view, liveOpts, blockFocusField);
        this._treeLen = treeLen;
        const prevDeco = this.decorations;
        this.decorations = built.layers[layerKey] || cmView.Decoration.none;
        // 行装饰（标题行高）/ 块测高变化后强制重测，避免 posAtCoords 纵向漂移
        if (
          (layerKey === 'line' || layerKey === 'block') &&
          prevDeco !== this.decorations
        ) {
          const v = update.view;
          requestAnimationFrame(function () {
            try {
              v.requestMeasure();
            } catch (_) {
              /* ignore */
            }
          });
        }
      }
    },
    spec
  );
  if (pluginOpts.atomic) {
    return [plugin, atomicRangesFromPlugin(plugin)];
  }
  return [plugin];
}

function focusKey(block) {
  if (!block) return '';
  return block.from + ':' + block.to + ':' + (block.kind || '');
}

/**
 * 大文档 Lezer 解析分片完成前，周期性触发装饰重建（不写入历史）。
 */
function createSyntaxTreeChasePlugin() {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this._raf = 0;
        this.schedule(view);
      }
      update(update) {
        if (update.docChanged) this.schedule(update.view);
      }
      schedule(view) {
        const docLen = view.state.doc.length;
        const tree = parseTreeForState(view.state, docLen);
        if (tree.length >= docLen) return;
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
          this._raf = 0;
          const len = view.state.doc.length;
          const before = parseTreeForState(view.state, len).length;
          try {
            ensureSyntaxTree(view.state, len, syntaxTreeBudget(len));
          } catch (_) {
            /* ignore */
          }
          const after = parseTreeForState(view.state, len).length;
          if (after > before) {
            view.dispatch({ annotations: Transaction.addToHistory.of(false) });
          }
          if (after < len) this.schedule(view);
        });
      }
      destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
      }
    }
  );
}

/**
 * @param {{
 *   onOpenLink?: Function,
 *   resolveImageUrl?: Function,
 *   renderMarkdown?: Function,
 *   parseAnnotations?: Function,
 *   levelColors?: Record<string, string>,
 *   levelSeverity?: Record<string, number>,
 * }} [opts]
 */
function livePreview(opts) {
  opts = opts || {};
  const blockFocusField = createBlockFocusField();
  const viewHost = { view: null };
  const blockMenuHandlers = createBlockMenuHandlers({
    getView: function () {
      return viewHost.view;
    },
    copyText: opts.copyText,
    toast: opts.toast,
    t: opts.t,
    onDeleteMermaidBlock: opts.onDeleteMermaidBlock,
    onDeleteCodeBlock: opts.onDeleteCodeBlock,
    onDeleteImageBlock: opts.onDeleteImageBlock,
    onCopyImageBlock: opts.onCopyImageBlock,
    onCopyBlockAsImage: opts.onCopyBlockAsImage,
    onCopyBlockAsMarkdown: opts.onCopyBlockAsMarkdown,
    onPickImageInsert: opts.onPickImageInsert,
    onSoon: opts.onBlockMenuSoon,
    onAiAction: opts.onBlockMenuAi,
    onAddBlockAnnotation: opts.onAddBlockAnnotation,
  });
  const liveOpts = Object.assign({}, opts, {
    blockMenuHandlers: blockMenuHandlers,
    onFocusBlock: function (block) {
      if (viewHost.view) setBlockFocus(viewHost.view, block);
    },
  });
  const emptyLineInsert = createEmptyLineInsertExtension(liveOpts);

  const viewAnchor = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        viewHost.view = view;
      }
      update(update) {
        viewHost.view = update.view;
      }
      destroy() {
        if (viewHost.view === this.view) viewHost.view = null;
      }
    }
  );

  const blockDecoField = createBlockDecoField(liveOpts, blockFocusField);
  const annoMalformedGutter = createAnnoMalformedGutter();

  const readonlyFilter = createReadonlyChangeFilter(function (state) {
    const text = state.doc.toString();
    const tree = parseTreeForState(state, state.doc.length);
    const nodes = collectSyntaxNodes(tree, text);
    return collectReadonlyRanges(text, nodes);
  }, opts.onReadonlyBlocked);

  const linkClick = EditorView.domEventHandlers({
    mousedown: function (event, view) {
      const target = event.target;
      if (target && target.closest) {
        if (
          target.closest(
            '.mda-cm-table-block, .mda-cm-code-block, .mda-cm-mermaid-block, .mda-cm-image-block, .mda-cm-math-block, .mda-cm-quote-handle-anchor, .mda-cm-heading-handle-anchor, .mda-cm-hr-block'
          )
        ) {
          return false;
        }
      }
      const focused = readBlockFocus(view.state, blockFocusField);
      if (focused) setBlockFocus(view, null);
      return false;
    },
    click: function (event, view) {
      if (!(event.ctrlKey || event.metaKey)) return false;
      const href = hrefAtEvent(view, event);
      if (!href) return false;
      event.preventDefault();
      if (typeof opts.onOpenLink === 'function') opts.onOpenLink(href);
      return true;
    },
  });

  // 观感样式单源在 index.html（#preview-content / #cm6-host）；此处仅 CM6 壳层
  const theme = EditorView.baseTheme({
    '&': { height: '100%', fontSize: '16px' },
    '.cm-scroller': {
      fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif",
      lineHeight: '26px',
      fontSize: '16px',
      fontVariantLigatures: 'none',
      fontFeatureSettings: '"liga" 0, "calt" 0',
    },
    '.cm-content': {
      padding: '16px 16px 60px',
      maxWidth: '800px',
      marginLeft: 'auto',
      marginRight: 'auto',
      boxSizing: 'border-box',
      caretColor: 'var(--text, #24292f)',
      fontFamily: 'inherit',
      lineHeight: '26px',
      fontVariantLigatures: 'none',
      fontFeatureSettings: '"liga" 0, "calt" 0',
    },
    '.cm-line': {
      padding: '0',
      margin: '0',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
    },
    '&.cm-focused': { outline: 'none' },
  });

  const ext = [
    blockFocusField,
    viewAnchor,
    readonlyFilter,
    blockDecoField,
    createSyntaxTreeChasePlugin(),
    atomicRangesFromHideLines(blockDecoField),
    atomicRangesFromBlockField(blockDecoField, function () {
      return !editorConfig.blockWidgetsEnabled();
    }),
  ]
    .concat(makeLayerPlugin('hide', liveOpts, { atomic: true }, blockFocusField))
    .concat(makeLayerPlugin('style', liveOpts, {}, blockFocusField))
    // 行内 replace（公式 / 任务勾选 / 无序圆点）须 atomic，否则 Backspace 会逐字拆开源码
    .concat(makeLayerPlugin('widget', liveOpts, { atomic: true }, blockFocusField))
    .concat(makeLayerPlugin('line', liveOpts, {}, blockFocusField))
    .concat([
      createDocLineCursorKeymap(blockDecoField),
      linkClick,
      createClickCollapseExtension(),
      createContextMenuExtension(liveOpts),
      createOutlineClickSyncExtension(liveOpts.onHeadingClick),
      createAnnoParagraphSyncExtension(liveOpts.onParagraphClick),
      theme,
      Prec.high(
        keymap.of([
          { key: 'Enter', run: handlePreviewHeadingEnter },
          { key: 'Backspace', run: handlePreviewHeadingBackspace },
          // 定界符隐藏时删除须作用到可见字符，并清掉被删空的定界符对
          { key: 'Backspace', run: handleInlineDelimiterBackspace },
          { key: 'Delete', run: handleInlineDelimiterDelete },
        ])
      ),
      EditorView.domEventHandlers({
        paste: function (event, view) {
          if (createTableMarkdownPasteHandler()(event, view)) return true;
          if (handleMarkdownSyntaxPaste(event, view)) return true;
          return createImagePasteHandler(liveOpts)(event, view);
        },
        copy: handleMarkdownSyntaxCopy,
        cut: handleMarkdownSyntaxCut,
      }),
    ])
    .concat(createWidgetEditableGuardExtension())
    .concat(emptyLineInsert.extensions);
  if (editorConfig.blockWidgetEnabled('image')) {
    ext.push(createImageShortcutKeymap(liveOpts));
    ext.push(createImageKeydownHandler(liveOpts));
    ext.push(createImageSelectionSyncPlugin());
  }
  if (editorConfig.blockWidgetEnabled('mermaid')) {
    ext.push(createMermaidSelectionSyncPlugin());
    ext.push(createMermaidShortcutKeymap(liveOpts));
    ext.push(createMermaidKeydownHandler(liveOpts));
  }
  if (editorConfig.blockWidgetEnabled('code')) {
    ext.push(createCodeShortcutKeymap(liveOpts));
    ext.push(createCodeKeydownHandler(liveOpts));
  }
  if (editorConfig.mathWidgetEnabled('math-inline')) {
    ext.push(createInlineMathShortcutKeymap(liveOpts));
    ext.push(createInlineMathSelectionSyncPlugin());
  }
  ext.push(createBlockSelectionSyncPlugin());
  if (
    editorConfig.blockWidgetEnabled('image') ||
    editorConfig.blockWidgetEnabled('mermaid') ||
    editorConfig.blockWidgetEnabled('code') ||
    editorConfig.blockWidgetEnabled('table') ||
    editorConfig.blockWidgetEnabled('quote-handle') ||
    editorConfig.blockWidgetEnabled('heading-handle') ||
    editorConfig.blockWidgetEnabled('hr') ||
    editorConfig.mathWidgetEnabled('math-inline')
  ) {
    ext.push(createMediaOutsideClickPlugin());
  }
  if (annoMalformedGutter && annoMalformedGutter.length) {
    for (let m = 0; m < annoMalformedGutter.length; m++) ext.push(annoMalformedGutter[m]);
  }
  return ext;
}

function notifyAnnoFilterChanged(view) {
  if (!view || typeof view.dispatch !== 'function') return;
  invalidateLayerBuildCache();
  view.dispatch({
    effects: AnnoFilterRefresh.of(null),
    annotations: Transaction.addToHistory.of(false),
  });
}

module.exports = {
  livePreview: livePreview,
  flattenStyles: flattenStyles,
  buildLayerDecos: buildLayerDecos,
  expandBlockRange: expandBlockRange,
  blockReplaceDeco: blockReplaceDeco,
  createBlockDecoField: createBlockDecoField,
  parseTreeForState: parseTreeForState,
  syntaxTreeBudget: syntaxTreeBudget,
  invalidateLayerBuildCache: invalidateLayerBuildCache,
  notifyAnnoFilterChanged: notifyAnnoFilterChanged,
};

/**
 * M8-B/C 实时预览视图层：语法隐藏（D15 = hide-mark 零宽 mark + atomicRanges）。
 */
'use strict';

const cmView = require('@codemirror/view');
const EditorView = cmView.EditorView;
const Decoration = cmView.Decoration;
const ViewPlugin = cmView.ViewPlugin;
const WidgetType = cmView.WidgetType;
const { RangeSetBuilder, StateField, Transaction } = require('@codemirror/state');
const { syntaxTree, ensureSyntaxTree } = require('@codemirror/language');
const { buildDecorationSpecs, collectSyntaxNodes } = require('./model/build-specs');
const {
  computeRevealRanges,
  enclosingBlockFromTree,
} = require('./model/reveal');
const { HiddenLineWidget } = require('./widgets/hidden-line');
const editorConfig = require('./config');
const { atomicRangesFromPlugin, atomicRangesFromBlockField, atomicRangesFromHideLines } = require('./view/atomic-ranges');
const { createReadonlyChangeFilter } = require('./view/change-filter');
const { collectReadonlyRanges } = require('./model/readonly-blocks');
const { parseFencedCode, expandFenceBlockRange } = require('./model/parse-fence');
const { expandGfmTableRange, expandTableBlockRange } = require('./model/parse-table');
const {
  createBlockFocusField,
  setBlockFocus,
  readBlockFocus,
} = require('./state/block-focus');
const { TableWidget } = require('./widgets/table');
const { ImageWidget } = require('./widgets/image');
const { CodeFenceWidget } = require('./widgets/code');
const { MermaidWidget } = require('./widgets/mermaid');
const { createAnnoGutterField } = require('./anno-gutter');
const { createClickCollapseExtension } = require('./click-collapse');
const {
  createImageSelectionSyncPlugin,
} = require('./widgets/image-selection');
const {
  createMermaidSelectionSyncPlugin,
} = require('./widgets/mermaid-selection');
const { createBlockMenuHandlers } = require('./widgets/block-menu-handlers');
const {
  createMermaidShortcutKeymap,
  createMermaidKeydownHandler,
} = require('./mermaid-shortcuts');
const { createMediaOutsideClickPlugin } = require('./widgets/media-outside-click');
const {
  createImageShortcutKeymap,
  createImagePasteHandler,
  createImageKeydownHandler,
} = require('./image-shortcuts');
const { BlockReplaceWidget, DEFAULT_LINE_HEIGHT } = require('./widgets/block-widget-base');

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
    super(source || '---', opts);
  }
  toDOM(view) {
    const el = document.createElement('hr');
    el.className = 'mda-cm-hr';
    this.bindMeasure(view, el);
    return el;
  }
  eq(other) {
    return other instanceof HrWidget;
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

/** 块级 widget 分阶段闸门，见 editor/config.js（默认 text = 仅标题/正文） */
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
    onOpenZoom: liveOpts.onOpenZoom,
    onScaleImage: liveOpts.onScaleImage,
    getSavedDisplayWidth: liveOpts.getSavedDisplayWidth,
    onDeleteImageBlock: liveOpts.onDeleteImageBlock,
    onReplaceImageBlock: liveOpts.onReplaceImageBlock,
    onMoveImageBlock: liveOpts.onMoveImageBlock,
    onDropReplaceImageBlock: liveOpts.onDropReplaceImageBlock,
    onPasteImageBlock: liveOpts.onPasteImageBlock,
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
    onEditMermaidBlock: liveOpts.onEditMermaidBlock,
    onDeleteMermaidBlock: liveOpts.onDeleteMermaidBlock,
    onMoveMermaidBlock: liveOpts.onMoveMermaidBlock,
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
      s.widget === 'image'
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
          deco: cmView.Decoration.replace({
            widget: new HiddenLineWidget(),
            block: true,
          }),
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
        s.widget === 'image');
    if (
      blockWidgetRanges.length > 0 &&
      !isBlockWidgetSpec &&
      overlapsBlock(s.from, s.to === s.from ? s.from + 1 : s.to, blockWidgetRanges)
    ) {
      continue;
    }

    if (s.kind === 'hide-mark') {
      if (s.from < s.to) {
        hides.push({
          from: s.from,
          to: s.to,
          deco: cmView.Decoration.mark({
            class: 'mda-cm-hide-mark',
            attributes: { 'aria-hidden': 'true' },
          }),
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
          deco: cmView.Decoration.replace({
            widget: new HrWidget(text.slice(br.from, br.to), Object.assign({}, widgetOpts, {
              from: br.from,
              to: br.to,
            })),
            block: true,
          }),
        });
        continue;
      } else if (s.widget === 'table') {
        if (!blockWidgetEnabled('table')) continue;
        const br = expandTableBlockRange(text, s.from, s.to);
        blockWidgets.push({
          from: br.from,
          to: br.to,
          deco: cmView.Decoration.replace({
            widget: new TableWidget(text.slice(br.from, br.to), Object.assign({}, widgetOpts, {
              from: br.from,
              to: br.to,
            })),
            block: true,
          }),
        });
        continue;
      } else if (s.widget === 'code') {
        const br = expandFenceBlockRange(text, s.from, s.to);
        const src = s.source || text.slice(s.from, s.to);
        const parsed = parseFencedCode(src);
        const isMermaid = parsed && /^mermaid$/i.test(parsed.lang || '');
        if (isMermaid ? !blockWidgetEnabled('mermaid') : !blockWidgetEnabled('code')) continue;
        const W = isMermaid ? MermaidWidget : CodeFenceWidget;
        blockWidgets.push({
          from: br.from,
          to: br.to,
          deco: cmView.Decoration.replace({
            widget: new W(src, Object.assign({}, widgetOpts, {
              from: br.from,
              to: br.to,
            })),
            block: true,
          }),
        });
        continue;
      } else if (s.widget === 'image') {
        if (!blockWidgetEnabled('image')) continue;
        const br = expandBlockRange(text, s.from, s.to);
        blockWidgets.push({
          from: br.from,
          to: br.to,
          deco: cmView.Decoration.replace({
            widget: new ImageWidget(s.source || text.slice(s.from, s.to), Object.assign({}, widgetOpts, {
              from: br.from,
              to: br.to,
            })),
            block: true,
          }),
        });
        continue;
      }
      if (deco) widgets.push({ from: from, to: to, deco: deco });
    }
  }

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
 * @param {{ from: number, to: number }[]} lastReveal
 * @param {{ resolveImageUrl?: Function }} [liveOpts]
 * @param {{ composing?: boolean, viewportTo?: number }} [viewHints]
 * @param {import('@codemirror/state').StateField<unknown>} [blockFocusField]
 */
function buildDecosFromState(state, lastReveal, liveOpts, viewHints, blockFocusField) {
  viewHints = viewHints || {};
  try {
    const text = state.doc.toString();
    const upto =
      viewHints.viewportTo != null
        ? Math.min(state.doc.length, viewHints.viewportTo + 4000)
        : state.doc.length;
    const tree = parseTreeForState(state, upto);
    const nodes = collectSyntaxNodes(tree);
    const granularity = 'never';
    const selRanges = [];
    for (let i = 0; i < state.selection.ranges.length; i++) {
      const r = state.selection.ranges[i];
      selRanges.push({ from: r.from, to: r.to, head: r.head, empty: r.empty });
    }
    const reveal = computeRevealRanges({
      docLength: text.length,
      selectionRanges: selRanges,
      granularity: granularity,
      composing: !!viewHints.composing,
      lastRevealRanges: lastReveal,
      enclosingBlock: function (pos) {
        return enclosingBlockFromTree(tree, pos, text.length);
      },
      lineRangeAround: function (pos, pad) {
        const line = state.doc.lineAt(pos);
        const fromLine = state.doc.line(Math.max(1, line.number - pad));
        const toLine = state.doc.line(Math.min(state.doc.lines, line.number + pad));
        return { from: fromLine.from, to: toLine.to };
      },
    });
    const focusedBlock = blockFocusField ? readBlockFocus(state, blockFocusField) : null;
    const specs = buildDecorationSpecs(text, nodes, reveal, {
      focusedBlock: focusedBlock,
      fullHide: true,
      widgetEnabled: function (kind) {
        return blockWidgetEnabled(kind);
      },
    });
    return {
      layers: buildLayerDecos(specs, text, liveOpts),
      reveal: reveal,
      treeLen: tree.length,
    };
  } catch (_) {
    return {
      layers: emptyLayers(),
      reveal: lastReveal || [],
      treeLen: 0,
    };
  }
}

function buildDecos(view, lastReveal, liveOpts, blockFocusField) {
  return buildDecosFromState(view.state, lastReveal, liveOpts, {
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
      const built = buildDecosFromState(state, [], liveOpts, {}, blockFocusField);
      return {
        deco: built.layers.block || cmView.Decoration.none,
        hideLineDeco: built.layers.hideBlock || cmView.Decoration.none,
        reveal: built.reveal,
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
      if (!tr.docChanged && !tr.selectionSet && !focusChanged && !treeStillIncomplete) {
        return prev;
      }
      const built = buildDecosFromState(tr.state, prev.reveal || [], liveOpts, {}, blockFocusField);
      const nextTreeLen = built.treeLen || 0;
      if (
        !tr.docChanged &&
        !tr.selectionSet &&
        !focusChanged &&
        nextTreeLen === prevTreeLen &&
        nextTreeLen >= docLen
      ) {
        return prev;
      }
      return {
        deco: built.layers.block || cmView.Decoration.none,
        hideLineDeco: built.layers.hideBlock || cmView.Decoration.none,
        reveal: built.reveal,
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

function getBuiltLayers(view, lastReveal, liveOpts, blockFocusField) {
  const main = view.state.selection.main;
  const fp =
    main.head +
    ':' +
    view.viewport.from +
    ':' +
    view.viewport.to +
    ':' +
    (view.composing ? '1' : '0') +
    ':' +
    parseTreeForState(view.state, view.state.doc.length).length;
  const focus = blockFocusField ? readBlockFocus(view.state, blockFocusField) : null;
  const focusKey = focus ? focus.from + '-' + focus.to + '-' + (focus.kind || '') : '';
  const fpFull = fp + ':' + focusKey;
  if (
    layerBuildCache.doc === view.state.doc &&
    layerBuildCache.fp === fpFull &&
    layerBuildCache.opts === liveOpts &&
    layerBuildCache.result
  ) {
    return layerBuildCache.result;
  }
  const built = buildDecos(view, lastReveal, liveOpts, blockFocusField);
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
        const built = getBuiltLayers(view, [], liveOpts, blockFocusField);
        this._lastReveal = built.reveal;
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
        if (
          !(
            this._imePending ||
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged ||
            treeGrew ||
            focusChanged
          )
        ) {
          return;
        }
        this._imePending = false;
        this._lastFocusKey = focusKeyNow;
        const built = getBuiltLayers(update.view, this._lastReveal, liveOpts, blockFocusField);
        this._lastReveal = built.reveal;
        this._treeLen = treeLen;
        this.decorations = built.layers[layerKey] || cmView.Decoration.none;
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
    onSoon: opts.onBlockMenuSoon,
    onAiAction: opts.onBlockMenuAi,
  });
  const liveOpts = Object.assign({}, opts, {
    blockMenuHandlers: blockMenuHandlers,
    onFocusBlock: function (block) {
      if (viewHost.view) setBlockFocus(viewHost.view, block);
    },
  });

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
  const annoGutterField = createAnnoGutterField(liveOpts);

  const readonlyFilter = createReadonlyChangeFilter(function (state) {
    const text = state.doc.toString();
    const tree = parseTreeForState(state, state.doc.length);
    const nodes = collectSyntaxNodes(tree);
    return collectReadonlyRanges(text, nodes);
  }, opts.onReadonlyBlocked);

  const linkClick = EditorView.domEventHandlers({
    mousedown: function (event, view) {
      const target = event.target;
      if (target && target.closest) {
        if (
          target.closest(
            '.mda-cm-table-block, .mda-cm-code-block, .mda-cm-mermaid-block, .mda-cm-image-block'
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
    .concat(makeLayerPlugin('widget', liveOpts, {}, blockFocusField))
    .concat(makeLayerPlugin('line', liveOpts, {}, blockFocusField))
    .concat([
      linkClick,
      createClickCollapseExtension(),
      theme,
      EditorView.domEventHandlers({
        paste: createImagePasteHandler(liveOpts),
      }),
    ]);
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
  if (
    editorConfig.blockWidgetEnabled('image') ||
    editorConfig.blockWidgetEnabled('mermaid') ||
    editorConfig.blockWidgetEnabled('code')
  ) {
    ext.push(createMediaOutsideClickPlugin());
  }
  if (annoGutterField) {
    if (Array.isArray(annoGutterField)) {
      for (let i = 0; i < annoGutterField.length; i++) ext.push(annoGutterField[i]);
    } else {
      ext.push(annoGutterField);
    }
  }
  return ext;
}

module.exports = {
  livePreview: livePreview,
  flattenStyles: flattenStyles,
  buildLayerDecos: buildLayerDecos,
  expandBlockRange: expandBlockRange,
  createBlockDecoField: createBlockDecoField,
  parseTreeForState: parseTreeForState,
  syntaxTreeBudget: syntaxTreeBudget,
};

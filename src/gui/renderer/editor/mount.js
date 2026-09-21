/**
 * 创建 / 销毁 CM6 EditorView；BOM 不进模型，由调用方在保存时拼回。
 */
'use strict';

const { EditorState, Transaction } = require('@codemirror/state');
const {
  EditorView,
  keymap,
  drawSelection,
  placeholder,
} = require('@codemirror/view');
const { defaultKeymap, history, historyKeymap, undo, redo } = require('@codemirror/commands');
const { markdown } = require('@codemirror/lang-markdown');
const { GFM } = require('@lezer/markdown');
const { syntaxTree, ensureSyntaxTree } = require('@codemirror/language');
const {
  MODE_PREVIEW,
  MODE_SOURCE,
  createModeCompartments,
  extensionsForMode,
  reconfigureMode,
} = require('./mode');
const { createClickDebugExtension } = require('./click-debug');
const { syncSelectedImageFrameClass } = require('./widgets/image-selection');
const { syncSelectedMermaidFrameClass } = require('./widgets/mermaid-selection');
const { refreshBlockToolbars } = require('./widgets/widget-common');
const { outlineFlashExtension, flashOutlineLine } = require('./outline-flash');
const { findHighlightExtension, applyFindHighlights } = require('./find-highlight');
const {
  getWidgetBlockRanges,
  applyWidgetFindHighlights,
  clearWidgetFindHighlights,
} = require('./widget-find-highlight');
const { getOutlineActiveLine } = require('./outline-scroll');
const { refreshAnnoGutter } = require('./anno-gutter');
const { invalidateLayerBuildCache, notifyAnnoFilterChanged } = require('./live-preview');
const { refreshEmptyLineInsertI18n } = require('./empty-line-insert');
const { sliceDocForClipboard } = require('./syntax-clipboard');
const { getWidgetInlineSelectionText } = require('./widget-editable-guard');
const { adjustCaretForKeyboardNav } = require('./caret-syntax-adjust');
const { createEditorToolbar } = require('./toolbar');
const { createFormatKeymap } = require('./format-commands');
const { createPendingInlineFormatExtension } = require('./state/pending-inline-format');

function stripBom(text) {
  if (typeof text !== 'string') return { text: '', bom: '' };
  if (text.charCodeAt(0) === 0xfeff) {
    return { text: text.slice(1), bom: '\uFEFF' };
  }
  return { text: text, bom: '' };
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.parent
 * @param {string} [opts.doc]
 * @param {'preview'|'source'} [opts.mode]
 * @param {string} [opts.placeholder]
 * @param {(info: { text: string, dirtyHint: boolean }) => void} [opts.onChange]
 * @param {(mode: string) => void} [opts.onModeChange]
 * @param {(href: string) => void} [opts.onOpenLink]
 */
function createEditor(opts) {
  const parent = opts.parent;
  const initial = stripBom(opts.doc || '');
  let bom = initial.bom;
  let mode = opts.mode || MODE_PREVIEW;
  const comps = createModeCompartments();
  const externalToolbar = !!(opts.toolbarHost && opts.toolbarHost.nodeType === 1);

  /** @type {HTMLElement} */
  let toolbarMount;
  if (externalToolbar) {
    toolbarMount = opts.toolbarHost;
  } else {
    toolbarMount = document.createElement('div');
    toolbarMount.className = 'mda-cm-edit-toolbar-host';
    parent.appendChild(toolbarMount);
  }
  const editorParent = document.createElement('div');
  editorParent.className = 'mda-cm-editor-surface';
  parent.appendChild(editorParent);

  /** @type {{ refresh?: () => void, destroy?: () => void } | null} */
  let toolbarApi = null;

  /** @type {{ matches: {start:number,end:number}[], activeIndex: number } | null} */
  let pendingWidgetFind = null;
  /** @type {number} */
  let tableFindRaf = 0;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && typeof opts.onChange === 'function') {
      opts.onChange({
        text: update.state.doc.toString(),
        dirtyHint: true,
      });
    }
    if (update.viewportChanged && typeof opts.onViewportChange === 'function') {
      opts.onViewportChange();
    }
    if (update.selectionSet || update.docChanged || update.focusChanged) {
      if (toolbarApi && typeof toolbarApi.refresh === 'function') toolbarApi.refresh();
    }
    if (
      (update.selectionSet || update.focusChanged) &&
      typeof opts.onSelectionUpdate === 'function'
    ) {
      opts.onSelectionUpdate(update.view);
    }
    if (
      pendingWidgetFind &&
      pendingWidgetFind.matches &&
      pendingWidgetFind.matches.length &&
      (update.docChanged || update.viewportChanged || update.geometryChanged)
    ) {
      if (!tableFindRaf) {
        tableFindRaf = requestAnimationFrame(function () {
          tableFindRaf = 0;
          const p = pendingWidgetFind;
          if (!p || !p.matches || !p.matches.length || view.destroyed) return;
          applyWidgetFindHighlights(view, p.matches, p.activeIndex);
        });
      }
    }
  });

  function buildExtensions(currentMode) {
    const list = [
      history(),
      drawSelection(),
    ]
      .concat([
        markdown({ extensions: GFM }),
        keymap.of(defaultKeymap.concat(historyKeymap)),
        createFormatKeymap({
          t: opts.t,
          onPickImageInsert: opts.onPickImageInsert,
        }),
      ])
      .concat(createPendingInlineFormatExtension())
      .concat([
        updateListener,
        createClickDebugExtension(),
        outlineFlashExtension(),
        findHighlightExtension(),
      ])
      .concat(extensionsForMode(currentMode, comps, opts));
    if (opts.placeholder && currentMode === MODE_SOURCE) {
      list.push(placeholder(opts.placeholder));
    }
    return list;
  }

  const view = new EditorView({
    state: EditorState.create({
      doc: initial.text,
      extensions: buildExtensions(mode),
    }),
    parent: editorParent,
  });

  if (opts.toolbar !== false) {
    toolbarApi = createEditorToolbar(toolbarMount, view, {
      t: opts.t,
      getMode: function () {
        return mode;
      },
      onToggleMode: opts.onToggleMode,
      onFind: opts.onFind,
      onTogglePanel: opts.onTogglePanel,
      onAddAnnotation: opts.onAddAnnotation,
      resolveAddAnnoIntent: opts.resolveAddAnnoIntent,
      getPanelVisible: opts.getPanelVisible,
      onPickImageInsert: opts.onPickImageInsert,
      onSoon: opts.onBlockMenuSoon,
      onCopy: opts.onCopy,
      onCut: opts.onCut,
      onPaste: opts.onPaste,
      onSave: opts.onSave,
      onCopyPreview: opts.onCopyPreview,
      onExportHtml: opts.onExportHtml,
      onExportPdf: opts.onExportPdf,
      onExportDocx: opts.onExportDocx,
    });
  }

  /** @type {ReturnType<typeof setTimeout>|null} */
  let outlineFlashTimer = null;

  return {
    view: view,
    getText: function () {
      return view.state.doc.toString();
    },
    getTextForSave: function () {
      return bom + view.state.doc.toString();
    },
    getBom: function () {
      return bom;
    },
    /**
     * @param {string} raw
     * @param {{ resetHistory?: boolean, keepHistory?: boolean }} [options]
     */
    setText: function (raw, options) {
      const parsed = stripBom(raw || '');
      bom = parsed.bom;
      const resetHistory = options && (options.resetHistory || options.keepHistory === false);
      // 内容未变则不动 view，保留光标 / 选区 / 撤销栈
      if (view.state.doc.toString() === parsed.text) {
        if (resetHistory && toolbarApi && typeof toolbarApi.notifyDocOpened === 'function') {
          toolbarApi.notifyDocOpened();
        }
        return;
      }
      if (!resetHistory) {
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: parsed.text,
          },
        });
        return;
      }
      view.setState(
        EditorState.create({
          doc: parsed.text,
          extensions: buildExtensions(mode),
        })
      );
      if (toolbarApi && typeof toolbarApi.notifyDocOpened === 'function') {
        toolbarApi.notifyDocOpened();
      }
    },
    getMode: function () {
      return mode;
    },
    setMode: function (next) {
      if (next === mode) return;
      // 切换前后核对文档，防止 reconfigure 异常时静默丢字
      const before = view.state.doc.toString();
      mode = next;
      reconfigureMode(view, mode, comps, opts);
      const after = view.state.doc.toString();
      if (before !== after) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: before },
        });
      }
      view.focus();
      if (typeof opts.onModeChange === 'function') opts.onModeChange(mode);
      if (toolbarApi && typeof toolbarApi.refresh === 'function') toolbarApi.refresh();
    },
    focus: function () {
      view.focus();
    },
    /**
     * 批注落盘同步：最小 diff 写入，不进入撤销栈。
     * @param {import('@codemirror/state').ChangeSpec|import('@codemirror/state').ChangeSpec[]} changes
     */
    patchDocNoHistory: function (changes) {
      view.dispatch({
        changes: changes,
        annotations: Transaction.addToHistory.of(false),
      });
    },
    /**
     * 大纲跳转：滚到 1-based 行，光标落行尾，标题闪高亮后清除。
     * @param {number} line1Based
     * @param {{ skipFocus?: boolean, flashMs?: number }} [opts]
     */
    scrollToLine: function (line1Based, opts) {
      const doc = view.state.doc;
      if (doc.lines < 1) return;
      const n = Math.min(Math.max(1, line1Based | 0), doc.lines);
      const line = doc.line(n);
      let pos = line.to;
      while (pos > line.from) {
        const ch = doc.sliceString(pos - 1, pos);
        if (ch !== '\n' && ch !== '\r') break;
        pos -= 1;
      }
      if (pos <= line.from) pos = line.from;
      else pos = adjustCaretForKeyboardNav(view.state, pos);
      view.dispatch({
        selection: { anchor: pos, head: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
      flashOutlineLine(view, n, opts && opts.flashMs, {
        clearTimer: function () {
          if (outlineFlashTimer) {
            clearTimeout(outlineFlashTimer);
            outlineFlashTimer = null;
          }
        },
        setTimer: function (tid) {
          outlineFlashTimer = tid;
        },
      });
      if (!(opts && opts.skipFocus)) {
        view.focus();
        requestAnimationFrame(function () {
          if (!view.destroyed) view.focus();
        });
      }
    },
    /**
     * 选区批注定位：滚到 anchor 并选中对应 UTF-16 区间。
     * @param {{ start: number, end: number }} anchor
     * @param {{ skipFocus?: boolean }} [opts]
     */
    scrollToAnchor: function (anchor, opts) {
      if (!anchor) return;
      const doc = view.state.doc;
      let from = Math.max(0, Math.min(anchor.start | 0, doc.length));
      let to = Math.max(from, Math.min(anchor.end | 0, doc.length));
      from = adjustCaretForKeyboardNav(view.state, from);
      if (to > from) to = adjustCaretForKeyboardNav(view.state, to);
      view.dispatch({
        selection: { anchor: from, head: to },
        effects: EditorView.scrollIntoView(from, { y: 'center' }),
      });
      if (!(opts && opts.skipFocus)) {
        view.focus();
        requestAnimationFrame(function () {
          if (!view.destroyed) view.focus();
        });
      }
    },
    /**
     * 大纲滚动高亮：视口内标题 DOM 真实位置（见 outline-scroll.js）。
     * @param {number[]} headingLines 1-based 标题行号（升序）
     * @returns {number|null}
     */
    getOutlineActiveLine: function (headingLines) {
      return getOutlineActiveLine(view, headingLines);
    },
    hasSelection: function () {
      const sel = view.state.selection.main;
      return sel.from !== sel.to;
    },
    getSelectionText: function () {
      const widgetSel = getWidgetInlineSelectionText();
      if (widgetSel) return widgetSel;
      const sel = view.state.selection.main;
      if (sel.from === sel.to) return '';
      return sliceDocForClipboard(view.state, sel.from, sel.to).text;
    },
    replaceSelection: function (text) {
      view.dispatch(view.state.replaceSelection(text == null ? '' : String(text)));
      view.focus();
    },
    cutSelection: function () {
      const sel = view.state.selection.main;
      if (sel.from === sel.to) return '';
      const slice = sliceDocForClipboard(view.state, sel.from, sel.to);
      view.dispatch({
        changes: { from: slice.from, to: slice.to, insert: '' },
      });
      view.focus();
      return slice.text;
    },
    selectAll: function () {
      view.dispatch({
        selection: { anchor: 0, head: view.state.doc.length },
      });
      view.focus();
    },
    /**
     * 坐标处 Markdown 链接（`[text](url)`）；无则 null。
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{ from: number, to: number, text: string, href: string } | null}
     */
    getLinkAtCoords: function (clientX, clientY) {
      const pos = view.posAtCoords({ x: clientX, y: clientY });
      if (pos == null) return null;
      let node = syntaxTree(view.state).resolveInner(pos, 1);
      const doc = view.state.doc.toString();
      while (node) {
        if (node.name === 'Link') {
          const slice = doc.slice(node.from, node.to);
          const m = /^\[([\s\S]*?)\]\(([\s\S]*?)\)$/.exec(slice);
          if (!m) return null;
          return {
            from: node.from,
            to: node.to,
            text: m[1],
            href: String(m[2] || '').trim(),
          };
        }
        node = node.parent;
      }
      return null;
    },
    /**
     * @param {number} from
     * @param {number} to
     * @param {string} insert
     */
    replaceRange: function (from, to, insert) {
      const text = insert == null ? '' : String(insert);
      view.dispatch({
        changes: { from: from, to: to, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
    },
    /**
     * 全部替换：单次事务写入，撤销一步还原整次替换。
     * @param {{ start: number, end: number }[]} matches
     * @param {string} insert
     */
    replaceAllRanges: function (matches, insert) {
      const rep = insert == null ? '' : String(insert);
      const list = Array.isArray(matches) ? matches : [];
      if (!list.length) return;
      const doc = view.state.doc.toString();
      const sorted = list.slice().sort(function (a, b) {
        return a.start - b.start;
      });
      let last = 0;
      let out = '';
      for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        if (m.end <= m.start) continue;
        out += doc.slice(last, m.start);
        out += rep;
        last = m.end;
      }
      out += doc.slice(last);
      if (out === doc) return;
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: out },
        userEvent: 'input.replaceAll',
      });
      view.focus();
    },
    /**
     * @param {{ start: number, end: number }[]} matches
     * @param {number} activeIndex
     */
    setFindHighlights: function (matches, activeIndex) {
      const idx = activeIndex == null ? -1 : activeIndex;
      const list = Array.isArray(matches) ? matches : [];
      pendingWidgetFind = list.length ? { matches: list, activeIndex: idx } : null;
      const widgetRanges = getWidgetBlockRanges(view);
      applyFindHighlights(view, list, idx, widgetRanges);
      applyWidgetFindHighlights(view, list, idx);
    },
    clearFindHighlights: function () {
      pendingWidgetFind = null;
      applyFindHighlights(view, [], -1);
      clearWidgetFindHighlights(view);
    },
    undo: function () {
      return undo(view);
    },
    redo: function () {
      return redo(view);
    },
    syncSelectedImageFrame: function () {
      syncSelectedImageFrameClass(view.dom);
    },
    syncSelectedMermaidFrame: function () {
      syncSelectedMermaidFrameClass(view.dom);
    },
    destroy: function () {
      if (outlineFlashTimer) {
        clearTimeout(outlineFlashTimer);
        outlineFlashTimer = null;
      }
      if (toolbarApi && typeof toolbarApi.destroy === 'function') toolbarApi.destroy();
      toolbarApi = null;
      view.destroy();
    },
    refreshToolbar: function () {
      if (toolbarApi) {
        if (typeof toolbarApi.refreshI18n === 'function') toolbarApi.refreshI18n();
        if (typeof toolbarApi.refresh === 'function') toolbarApi.refresh();
      }
    },
  };
}

module.exports = {
  createEditor: createEditor,
  stripBom: stripBom,
  refreshDecorations: function (view) {
    if (!view || typeof view.dispatch !== 'function') return;
    invalidateLayerBuildCache();
    refreshAnnoGutter(view);
    view.dispatch({ annotations: Transaction.addToHistory.of(false) });
  },
  notifyAnnoFilterChanged: notifyAnnoFilterChanged,
  refreshWidgetI18n: function (view, t) {
    if (!view || !view.dom || typeof t !== 'function') return;
    refreshBlockToolbars(view.dom, t);
    refreshEmptyLineInsertI18n(view, t);
  },
};

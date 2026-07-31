/**
 * 创建 / 销毁 CM6 EditorView；BOM 不进模型，由调用方在保存时拼回。
 */
'use strict';

const { EditorState, Transaction } = require('@codemirror/state');
const {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  placeholder,
} = require('@codemirror/view');
const { defaultKeymap, history, historyKeymap, undo, redo } = require('@codemirror/commands');
const { markdown } = require('@codemirror/lang-markdown');
const { GFM } = require('@lezer/markdown');
const { syntaxTree, ensureSyntaxTree } = require('@codemirror/language');
const {
  MODE_PREVIEW,
  createModeCompartments,
  extensionsForMode,
  reconfigureMode,
} = require('./mode');
const { createClickDebugExtension } = require('./click-debug');
const { syncSelectedImageFrameClass } = require('./widgets/image-selection');
const { syncSelectedMermaidFrameClass } = require('./widgets/mermaid-selection');
const { refreshBlockToolbars } = require('./widgets/widget-common');

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

  const updateListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    if (typeof opts.onChange === 'function') {
      opts.onChange({
        text: update.state.doc.toString(),
        dirtyHint: true,
      });
    }
  });

  function buildExtensions(currentMode) {
    const list = [
      history(),
      drawSelection(),
      highlightActiveLine(),
      markdown({ extensions: GFM }),
      keymap.of(defaultKeymap.concat(historyKeymap)),
      updateListener,
      createClickDebugExtension(),
      // 预览模式折行由 mode.js lineWrappingComp 提供；须配合 .cm-line pre-wrap
    ].concat(extensionsForMode(currentMode, comps, opts));
    if (opts.placeholder) list.push(placeholder(opts.placeholder));
    return list;
  }

  const view = new EditorView({
    state: EditorState.create({
      doc: initial.text,
      extensions: buildExtensions(mode),
    }),
    parent: parent,
  });

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
      // 内容未变则不动 view，保留光标 / 选区 / 撤销栈
      if (view.state.doc.toString() === parsed.text) return;
      const resetHistory = options && (options.resetHistory || options.keepHistory === false);
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
    },
    focus: function () {
      view.focus();
    },
    hasSelection: function () {
      const sel = view.state.selection.main;
      return sel.from !== sel.to;
    },
    getSelectionText: function () {
      const sel = view.state.selection.main;
      if (sel.from === sel.to) return '';
      return view.state.sliceDoc(sel.from, sel.to);
    },
    replaceSelection: function (text) {
      view.dispatch(view.state.replaceSelection(text == null ? '' : String(text)));
      view.focus();
    },
    cutSelection: function () {
      const sel = view.state.selection.main;
      if (sel.from === sel.to) return '';
      const text = view.state.sliceDoc(sel.from, sel.to);
      view.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' } });
      view.focus();
      return text;
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
      view.destroy();
    },
  };
}

module.exports = {
  createEditor: createEditor,
  stripBom: stripBom,
  refreshDecorations: function (view) {
    if (!view || typeof view.dispatch !== 'function') return;
    view.dispatch({ annotations: Transaction.addToHistory.of(false) });
  },
  refreshWidgetI18n: function (view, t) {
    if (!view || !view.dom || typeof t !== 'function') return;
    refreshBlockToolbars(view.dom, t);
  },
};

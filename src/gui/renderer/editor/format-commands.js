/**
 * 将 editor-assist 纯函数结果应用到 CM6 EditorView。
 */
'use strict';

const { undo, redo, undoDepth, redoDepth } = require('@codemirror/commands');
const { ChangeSet, Prec, Transaction } = require('@codemirror/state');
const { keymap } = require('@codemirror/view');
const assist = require('../editor-assist');
const { buildCodeFenceMask } = require('./model/parse-math');
const { detectFrontMatter } = require('./model/readonly-blocks');
const { showLinkEditPopover } = require('./link-edit-popover');
const {
  insertSnippetAtBlankLine,
  insertSnippetNearBlock,
} = require('./widgets/block-handle-ops');
const {
  captureWidgetEditTarget,
  getEffectiveWidgetEditTarget,
  isFenceWidgetKind,
} = require('./widget-editable-guard');
const {
  applyInlineFormatToTableCell,
  getCellMarkdownContent,
  setCellMarkdownContent,
  getCellInlineFlags,
} = require('./widgets/table-cell-content');
const { getSelectedBlockOfKind } = require('./widgets/block-selection');
const {
  deriveFormatAvailability,
  isFormatCmdAvailable,
} = require('./state/format-availability');
const { getInlineToolbarState, getInlineFlagsAt } = require('./state/block-format');
const {
  togglePendingInlineMark,
  clearPendingInlineFormat,
  toggleWidgetPendingMark,
  clearWidgetPendingMarks,
} = require('./state/pending-inline-format');
const {
  applyInlineMarkToSelection,
  planClearInlineMarks,
} = require('./state/inline-delimiter-ops');
const inlineDbg = require('./state/inline-format-debug');

/**
 * @param {import('@codemirror/state').Text} doc
 * @returns {boolean[]}
 */
function fenceMaskForDoc(doc) {
  const lines = [];
  const n = doc.lines;
  for (let i = 1; i <= n; i++) lines.push(doc.line(i).text);
  return buildCodeFenceMask(lines);
}

/**
 * @param {import('@codemirror/state').EditorState} state
 */
function selectionTouchesFence(state) {
  if (!state) return false;
  const mask = fenceMaskForDoc(state.doc);
  const sel = state.selection.main;
  const fromLine = state.doc.lineAt(sel.from).number - 1;
  const toLine = state.doc.lineAt(Math.max(sel.from, sel.to)).number - 1;
  for (let i = fromLine; i <= toLine; i++) {
    if (mask[i]) return true;
  }
  return false;
}

/**
 * @param {string} oldVal
 * @param {string} newVal
 * @param {{ selectionStart: number, selectionEnd: number }} sel
 */
function diffReplace(oldVal, newVal, sel) {
  let a = 0;
  while (a < oldVal.length && a < newVal.length && oldVal.charAt(a) === newVal.charAt(a)) a++;
  let b = 0;
  while (
    b < oldVal.length - a &&
    b < newVal.length - a &&
    oldVal.charAt(oldVal.length - 1 - b) === newVal.charAt(newVal.length - 1 - b)
  ) {
    b++;
  }
  return {
    from: a,
    to: oldVal.length - b,
    insert: newVal.slice(a, newVal.length - b),
    anchor: sel.selectionStart,
    head: sel.selectionEnd,
  };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ value: string, selectionStart: number, selectionEnd: number } | null} result
 */
function applyAssistResult(view, result) {
  if (!result || !view) return false;
  const oldVal = view.state.doc.toString();
  if (result.value === oldVal) return false;
  const patch = diffReplace(oldVal, result.value, result);
  view.dispatch({
    changes: { from: patch.from, to: patch.to, insert: patch.insert },
    selection: { anchor: patch.anchor, head: patch.head },
  });
  try {
    view.focus();
  } catch (_) {
    /* ignore */
  }
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {(val: string, start: number, end: number, mask: boolean[]) => object | null} fn
 */
function runAssist(view, fn) {
  const state = view.state;
  const sel = state.selection.main;
  const val = state.doc.toString();
  const mask = fenceMaskForDoc(state.doc);
  const result = fn(val, sel.from, sel.to, mask);
  return applyAssistResult(view, result);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} type
 * @param {object} [opts]
 */
function insertTypeAtCursor(view, type, opts) {
  if (!view || !type) return false;
  opts = opts || {};
  const lineFormat = {
    text: 'paragraph',
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    h4: 'h4',
    h5: 'h5',
    h6: 'h6',
    bullet: 'ul',
    ordered: 'ol',
    task: 'task',
  };
  if (Object.prototype.hasOwnProperty.call(lineFormat, type)) {
    return runFormatCommand(view, lineFormat[type], opts);
  }
  if (type === 'image' && typeof opts.onPickImageInsert === 'function') {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    opts.onPickImageInsert('blank', { from: line.from, to: line.to, source: line.text });
    return true;
  }
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const block = { from: line.from, to: line.to, source: line.text };
  if (String(line.text || '').trim() === '') {
    return insertSnippetAtBlankLine(view, block, type);
  }
  const tail = { from: line.to, to: line.to, source: '' };
  return insertSnippetNearBlock(view, tail, 'below', type);
}

function selectionTouchesReadonly(state) {
  if (!state) return false;
  const fm = detectFrontMatter(state.doc.toString());
  if (!fm) return false;
  const sel = state.selection.main;
  return sel.from < fm.to && sel.to > fm.from;
}

const FENCE_BLOCKED_CMDS = {
  bold: 1,
  italic: 1,
  underline: 1,
  strike: 1,
  code: 1,
  link: 1,
  ul: 1,
  ol: 1,
  task: 1,
  quote: 1,
  paragraph: 1,
  h1: 1,
  h2: 1,
  h3: 1,
  h4: 1,
  h5: 1,
  h6: 1,
  'indent-in': 1,
  'indent-out': 1,
  'clear-format': 1,
};

const INLINE_WRAP_CMDS = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  underline: ['~', '~'],
  strike: ['~~', '~~'],
  code: ['`', '`'],
};

const CMD_TO_MARK = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strike',
  code: 'code',
};

/**
 * @param {{ bold: boolean, italic: boolean, underline: boolean, strike: boolean, code: boolean }} a
 * @param {{ bold: boolean, italic: boolean, underline: boolean, strike: boolean, code: boolean }} b
 */
function marksDiffer(a, b) {
  return (
    !!a.bold !== !!b.bold ||
    !!a.italic !== !!b.italic ||
    !!a.underline !== !!b.underline ||
    !!a.strike !== !!b.strike ||
    !!a.code !== !!b.code
  );
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function collapseInlineSelectionToHead(view) {
  const sel = view.state.selection.main;
  if (sel.empty) return;
  view.dispatch({
    selection: { anchor: sel.head, head: sel.head },
    annotations: Transaction.addToHistory.of(false),
  });
}

/**
 * 清除格式：先按定界符规划摘掉选区内的行内标记（可拆分、可留残段），
 * 再在同一次派发的第二段做块级清理（标题 / 列表 / 引用）。
 * @param {import('@codemirror/view').EditorView} view
 */
function runClearFormatCommand(view) {
  const state = view.state;
  const sel = state.selection.main;
  if (sel.empty) {
    collapseInlineSelectionToHead(view);
    return clearPendingInlineFormat(view);
  }
  const plan = planClearInlineMarks(state, sel.from, sel.to);
  if (!plan || !plan.changes.length) {
    return runAssist(view, function (v, a, b, m) {
      return assist.clearFormats(v, a, b, m);
    });
  }
  const set = ChangeSet.of(plan.changes, state.doc.length);
  const text = set.apply(state.doc).toString();
  const from = plan.select ? plan.select.from : set.mapPos(sel.from, 1);
  const to = plan.select ? plan.select.to : set.mapPos(sel.to, -1);
  const specs = [
    {
      changes: plan.changes,
      selection: { anchor: from, head: to },
      userEvent: 'input.format',
    },
  ];
  const block = assist.clearFormats(text, from, to, buildCodeFenceMask(text.split('\n')));
  if (block && block.value !== text) {
    const patch = diffReplace(text, block.value, block);
    specs.push({
      sequential: true,
      changes: { from: patch.from, to: patch.to, insert: patch.insert },
      selection: { anchor: patch.anchor, head: patch.head },
    });
  }
  view.dispatch.apply(view, specs);
  try {
    view.focus();
  } catch (_) {
    /* ignore */
  }
  return true;
}

/**
 * 行内字符格式统一入口：
 * 无选区 → 待输入层；有选区 → 定界符融合规划（相邻同类样式段融合、拆分取消不留空对）。
 * 融合规划无解时才退回 editor-assist 纯函数包裹。
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {'bold'|'italic'|'underline'|'strike'|'code'} markKey
 */
function runInlineMarkCommand(view, markKey) {
  const sel = view.state.selection.main;
  if (sel.empty) return togglePendingInlineMark(view, markKey);
  if (applyInlineMarkToSelection(view, markKey)) return true;
  logAssistInline(view, markKey);
  const pair = INLINE_WRAP_CMDS[markKey];
  return runAssist(view, function (v, a, b) {
    const cov = getInlineToolbarState(view.state)[markKey];
    const fullyOn = !!(cov.on && !cov.mixed);
    if (markKey === 'underline') return assist.applyOrToggleUnderline(v, a, b, fullyOn);
    return assist.applyOrToggleWrap(v, a, b, pair[0], pair[1], fullyOn);
  });
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} cmd
 */
function logAssistInline(view, cmd) {
  const sel = view.state.selection.main;
  inlineDbg.log('cmd.assist', {
    cmd: cmd,
    pos: sel.head,
    state: view.state,
    selFrom: sel.from,
    selTo: sel.to,
    coverage: getInlineToolbarState(view.state),
  });
}

/**
 * 工具栏 mousedown 前置钩子。跨标记选区改由定界符融合规划处理，此处**不再折叠选区**
 * （折叠会让 click 丢失选区，字符格式退化成「只改后续输入」）。
 * @param {import('@codemirror/view').EditorView} view
 */
function prepareInlineFormatToolbar(view) {
  if (!view) return;
  const sel = view.state.selection.main;
  if (sel.empty) return;
  const endPos = Math.max(sel.from, sel.to - 1);
  if (marksDiffer(getInlineFlagsAt(view.state, sel.from), getInlineFlagsAt(view.state, endPos))) {
    inlineDbg.log('toolbar.crossMarkSelection', {
      pos: sel.head,
      state: view.state,
      selFrom: sel.from,
      selTo: sel.to,
    });
  }
}

function isCollapsedWidgetTarget(target) {
  if (!target) return true;
  if (typeof target.visStart === 'number' && typeof target.visEnd === 'number') {
    return target.visEnd <= target.visStart;
  }
  return true;
}

/**
 * widget 内编辑时：代码/公式源码拦截格式；表格格内改 DOM，禁止打到 CM6 表首。
 * 无选区字符格式只改待输入，不改格内已有文本。
 * @returns {boolean | null} null 表示未处理，交给文档命令
 */
function tryWidgetFormatCommand(cmd) {
  const target = getEffectiveWidgetEditTarget() || captureWidgetEditTarget();
  if (!target || !target.el) return null;
  if (isFenceWidgetKind(target.kind)) {
    if (FENCE_BLOCKED_CMDS[cmd] || INLINE_WRAP_CMDS[cmd]) return true;
    return null;
  }
  if (target.kind !== 'table-cell') return null;
  const pair = INLINE_WRAP_CMDS[cmd];
  const collapsed = isCollapsedWidgetTarget(target);
  const mark = CMD_TO_MARK[cmd];
  if (pair && collapsed) {
    const caret = getCellInlineFlags(target.el, target);
    toggleWidgetPendingMark(
      target.el,
      mark,
      caret ? caret.flags : null,
      caret ? caret.pos : null
    );
    return true;
  }
  if (pair) {
    applyInlineFormatToTableCell(target.el, pair[0], pair[1], target.range || null, target);
    return true;
  }
  if (cmd === 'clear-format') {
    if (collapsed) {
      const caret = getCellInlineFlags(target.el, target);
      clearWidgetPendingMarks(target.el, caret ? caret.flags : null, caret ? caret.pos : null);
      return true;
    }
    const md = getCellMarkdownContent(target.el);
    const result = assist.clearFormats(md, 0, md.length, null);
    if (result) setCellMarkdownContent(target.el, result.value);
    try {
      target.el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {
      /* ignore */
    }
    return true;
  }
  if (FENCE_BLOCKED_CMDS[cmd]) return true;
  return null;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} cmd
 * @param {object} [opts]
 */
function runFormatCommand(view, cmd, opts) {
  if (!view) return false;
  opts = opts || {};
  const widgetHandled = tryWidgetFormatCommand(cmd);
  if (widgetHandled !== null) return widgetHandled;
  if (cmd !== 'undo' && cmd !== 'redo') {
    const blocked =
      !!FENCE_BLOCKED_CMDS[cmd] || (cmd && cmd.indexOf('insert:') === 0);
    if (blocked && (selectionTouchesFence(view.state) || selectionTouchesReadonly(view.state))) {
      return false;
    }
  }
  if (getSelectedBlockOfKind('hr')) {
    if (
      cmd === 'undo' ||
      cmd === 'redo' ||
      cmd === 'clear-format' ||
      FENCE_BLOCKED_CMDS[cmd] ||
      cmd === 'paragraph'
    ) {
      return false;
    }
  }
  if (
    cmd === 'bold' ||
    cmd === 'italic' ||
    cmd === 'underline' ||
    cmd === 'strike' ||
    cmd === 'code' ||
    cmd === 'ul' ||
    cmd === 'ol' ||
    cmd === 'task'
  ) {
    const widgetTarget = getEffectiveWidgetEditTarget() || captureWidgetEditTarget();
    const inTableCell = !!(widgetTarget && widgetTarget.kind === 'table-cell');
    if (!inTableCell) {
      const avail = deriveFormatAvailability(view.state);
      if (!isFormatCmdAvailable(cmd, avail)) return false;
    }
  }
  switch (cmd) {
    case 'undo':
      return undo(view);
    case 'redo':
      return redo(view);
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strike':
    case 'code':
      return runInlineMarkCommand(view, cmd);
    case 'link': {
      const sel = view.state.selection.main;
      const val = view.state.doc.toString();
      const selected = sel.from === sel.to ? '' : val.slice(sel.from, sel.to);
      try {
        const coords = view.coordsAtPos(sel.head);
        if (coords) {
          showLinkEditPopover({
            x: coords.left,
            y: coords.bottom + 4,
            text: selected || 'text',
            href: selected || 'url',
            t: opts.t,
            onConfirm: function (text, href) {
              const from = view.state.selection.main.from;
              const to = view.state.selection.main.to;
              const cur = view.state.doc.toString();
              const wrapped = '[' + text + '](' + href + ')';
              let insert = wrapped;
              let anchor = from;
              let head = from + wrapped.length;
              if (from !== to) {
                insert = wrapped;
                anchor = from;
                head = from + wrapped.length;
              }
              view.dispatch({
                changes: { from: from, to: to, insert: insert },
                selection: { anchor: anchor, head: head },
              });
              view.focus();
            },
          });
          return true;
        }
      } catch (_) {
        /* fall through */
      }
      return runAssist(view, function (v, a, b) {
        return assist.insertLink(v, a, b);
      });
    }
    case 'ul':
      return runAssist(view, function (v, a, b, m) {
        return assist.toggleListType(v, a, b, 'ul', m);
      });
    case 'ol':
      return runAssist(view, function (v, a, b, m) {
        return assist.toggleListType(v, a, b, 'ol', m);
      });
    case 'task':
      return runAssist(view, function (v, a, b, m) {
        return assist.toggleListType(v, a, b, 'task', m);
      });
    case 'quote':
      return runAssist(view, function (v, a, b, m) {
        return assist.toggleLinePrefix(v, a, b, '> ', m);
      });
    case 'indent-in':
      return runAssist(view, function (v, a, b, m) {
        return assist.indentLines(v, a, b, 2, m);
      });
    case 'indent-out':
      return runAssist(view, function (v, a, b, m) {
        return assist.indentLines(v, a, b, -2, m);
      });
    case 'clear-format':
      return runClearFormatCommand(view);
    case 'hr':
      return runAssist(view, function (v, p, _e, m) {
        return assist.insertHorizontalRule(v, p, m);
      });
    case 'paragraph':
      return runAssist(view, function (v, a, b, m) {
        return assist.setHeadingLevelRange(v, a, b, 0, m);
      });
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return runAssist(view, function (v, a, b, m) {
        return assist.setHeadingLevelRange(v, a, b, parseInt(cmd.slice(1), 10), m);
      });
    default:
      if (cmd.indexOf('insert:') === 0) {
        const type = cmd.slice(7);
        return insertTypeAtCursor(view, type, opts);
      }
      return false;
  }
}

/**
 * @param {object} [opts]
 */
function createFormatKeymap(opts) {
  opts = opts || {};
  return Prec.high(
    keymap.of([
      { key: 'Mod-b', run: function (v) { return runFormatCommand(v, 'bold', opts); } },
      { key: 'Mod-i', run: function (v) { return runFormatCommand(v, 'italic', opts); } },
      { key: 'Mod-u', run: function (v) { return runFormatCommand(v, 'underline', opts); } },
      { key: 'Mod-k', run: function (v) { return runFormatCommand(v, 'link', opts); } },
      {
        key: 'Mod-Shift-c',
        run: function (v) {
          return runFormatCommand(v, 'code', opts);
        },
      },
      {
        key: 'Mod-Shift-s',
        run: function (v) {
          return runFormatCommand(v, 'strike', opts);
        },
      },
      {
        key: 'Mod-Shift-y',
        run: function (v) {
          return runFormatCommand(v, 'task', opts);
        },
      },
      {
        key: 'Mod-Shift-u',
        run: function (v) {
          return runFormatCommand(v, 'ol', opts);
        },
      },
      {
        key: 'Mod-Shift-i',
        run: function (v) {
          return runFormatCommand(v, 'ul', opts);
        },
      },
      {
        key: 'Mod-Shift-z',
        run: function (v) {
          return redo(v);
        },
      },
      {
        key: 'Mod-y',
        run: function (v) {
          return redo(v);
        },
      },
    ])
  );
}

module.exports = {
  applyAssistResult: applyAssistResult,
  prepareInlineFormatToolbar: prepareInlineFormatToolbar,
  runFormatCommand: runFormatCommand,
  runInlineMarkCommand: runInlineMarkCommand,
  insertTypeAtCursor: insertTypeAtCursor,
  createFormatKeymap: createFormatKeymap,
  fenceMaskForDoc: fenceMaskForDoc,
  selectionTouchesFence: selectionTouchesFence,
  selectionTouchesReadonly: selectionTouchesReadonly,
  undoDepth: undoDepth,
  redoDepth: redoDepth,
};

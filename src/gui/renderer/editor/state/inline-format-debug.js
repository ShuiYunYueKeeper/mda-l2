/**
 * 行内待输入格式调试日志（默认关闭）。
 *
 * 开启：浏览器控制台执行
 *   localStorage.setItem('mda-editor-debug-inline-format', '1'); location.reload();
 * 关闭：
 *   localStorage.setItem('mda-editor-debug-inline-format', '0'); location.reload();
 * 或：window.MDAInlineFormatDebug.disable()
 */
'use strict';

const editorConfig = require('../config');

const LOG_PREFIX = '[mda-inline-format]';
let seq = 0;

function enabled() {
  return editorConfig.inlineFormatDebugEnabled();
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {number} [radius]
 */
function snapDoc(state, pos, radius) {
  if (!state || pos == null || pos < 0) return '';
  radius = radius == null ? 14 : radius;
  const from = Math.max(0, pos - radius);
  const to = Math.min(state.doc.length, pos + radius);
  const left = state.doc.sliceString(from, pos);
  const right = state.doc.sliceString(pos, to);
  return left + '|' + right;
}

/**
 * @param {Record<string, boolean> | null | undefined} flags
 */
function snapFlags(flags) {
  if (!flags) return null;
  return {
    bold: !!flags.bold,
    italic: !!flags.italic,
    underline: !!flags.underline,
    strike: !!flags.strike,
    code: !!flags.code,
  };
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 */
function snapPos(state, pos) {
  if (!state || pos == null) return { pos: pos, line: null, col: null };
  const line = state.doc.lineAt(Math.max(0, Math.min(pos, state.doc.length)));
  return {
    pos: pos,
    line: line.number,
    col: pos - line.from + 1,
    docSnap: snapDoc(state, pos),
  };
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [detail]
 */
function log(event, detail) {
  if (!enabled()) return;
  seq++;
  const payload = Object.assign({ seq: seq, event: event, ts: Date.now() }, detail || {});
  if (payload.state && payload.pos != null) {
    Object.assign(payload, snapPos(/** @type {import('@codemirror/state').EditorState} */ (payload.state), /** @type {number} */ (payload.pos)));
    delete payload.state;
  }
  if (payload.from != null && payload.stateFrom) {
    Object.assign(payload, { fromCtx: snapPos(/** @type {import('@codemirror/state').EditorState} */ (payload.stateFrom), /** @type {number} */ (payload.from)) });
    delete payload.stateFrom;
  }
  if (payload.intended) payload.intended = snapFlags(/** @type {Record<string, boolean>} */ (payload.intended));
  if (payload.current) payload.current = snapFlags(/** @type {Record<string, boolean>} */ (payload.current));
  if (payload.marks) payload.marks = snapFlags(/** @type {Record<string, boolean>} */ (payload.marks));
  if (payload.pending && typeof payload.pending === 'object') {
    const p = /** @type {{ armed?: boolean, marks?: Record<string, boolean> }} */ (payload.pending);
    payload.pending = { armed: !!p.armed, marks: snapFlags(p.marks) };
  }
  console.log(LOG_PREFIX, payload);
}

function installWindowApi() {
  if (typeof window === 'undefined') return;
  const api = {
    isEnabled: enabled,
    enable: function () {
      try {
        localStorage.setItem('mda-editor-debug-inline-format', '1');
      } catch (_) {
        /* ignore */
      }
      console.info(LOG_PREFIX, '已开启；刷新页面后全程记录。');
    },
    disable: function () {
      try {
        localStorage.setItem('mda-editor-debug-inline-format', '0');
      } catch (_) {
        /* ignore */
      }
      console.info(LOG_PREFIX, '已关闭；刷新页面后停止记录。');
    },
    log: log,
  };
  window.MDAInlineFormatDebug = api;
}

installWindowApi();

if (enabled()) {
  console.info(
    LOG_PREFIX,
    '调试已开启。请在编辑区操作（点格式按钮 / 输入 / 中文 IME），日志将以',
    LOG_PREFIX,
    '为前缀输出。关闭：localStorage.setItem("mda-editor-debug-inline-format","0"); location.reload();'
  );
}

module.exports = {
  enabled: enabled,
  log: log,
  snapDoc: snapDoc,
  snapFlags: snapFlags,
  snapPos: snapPos,
};

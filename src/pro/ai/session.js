/**
 * AI 请求会话表（main 进程）。每个请求有独立 requestId 与 AbortController，
 * 事件经单一频道回传渲染层，避免旧请求的 chunk 串进新请求。
 */
'use strict';

const { AiError } = require('./provider');

/** 单个窗口同时在途的请求上限（编辑类 1 + 只读卡片 1 + 要点 1，留 1 余量） */
const MAX_ACTIVE_PER_SENDER = 4;

/**
 * @typedef {{ type: 'chunk', requestId: string, text: string }
 *   | { type: 'done', requestId: string, text: string }
 *   | { type: 'canceled', requestId: string, text: string }
 *   | { type: 'error', requestId: string, code: string, detail: string, text: string }} AiEvent
 */

/**
 * @param {{ emit: (sender: any, event: AiEvent) => void }} deps
 */
function createAiSessionManager(deps) {
  /** @type {Map<string, { sender: any, ctrl: AbortController, startedAt: number }>} */
  const active = new Map();

  function isValidRequestId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
  }

  function cancel(requestId) {
    const s = active.get(requestId);
    if (!s) return false;
    try { s.ctrl.abort(); } catch (_) { /* ignore */ }
    return true;
  }

  /** @param {any} [sender] 省略则取消全部 */
  function cancelAll(sender) {
    for (const [id, s] of active) {
      if (sender === undefined || s.sender === sender) cancel(id);
    }
  }

  function enforceCap(sender) {
    const mine = [...active.entries()]
      .filter(([, s]) => s.sender === sender)
      .sort((a, b) => a[1].startedAt - b[1].startedAt);
    while (mine.length >= MAX_ACTIVE_PER_SENDER) {
      const [id] = /** @type {[string, any]} */ (mine.shift());
      cancel(id);
    }
  }

  /**
   * 启动一个请求；立即返回，结果经 emit 回传。
   * @param {any} sender
   * @param {string} requestId
   * @param {(signal: AbortSignal, onChunk: (text: string) => void) => Promise<string>} run
   */
  function start(sender, requestId, run) {
    if (!isValidRequestId(requestId)) throw new AiError('E_UNKNOWN', 'invalid requestId');
    cancel(requestId);
    active.delete(requestId);
    enforceCap(sender);
    const ctrl = new AbortController();
    const entry = { sender, ctrl, startedAt: Date.now() };
    active.set(requestId, entry);
    let full = '';

    const safeEmit = (ev) => {
      // 同 id 已被新请求顶替：旧请求的任何事件都不能再发，否则会被当成新请求的结果
      if (active.get(requestId) !== entry) return;
      try { deps.emit(sender, ev); } catch (_) { /* 窗口已销毁 */ }
    };

    const onChunk = (text) => {
      if (!text) return;
      full += text;
      safeEmit({ type: 'chunk', requestId, text });
    };

    const finished = Promise.resolve()
      .then(() => {
        // run 在微任务里才启动，此前的 cancel 不会触发 run 内挂的 abort 监听
        if (ctrl.signal.aborted) throw new AiError('E_CANCELED');
        return run(ctrl.signal, onChunk);
      })
      .then((text) => {
        const out = typeof text === 'string' && text ? text : full;
        safeEmit({ type: 'done', requestId, text: out });
      }, (err) => {
        const code = err && err.code ? String(err.code) : 'E_UNKNOWN';
        if (code === 'E_CANCELED' || (ctrl.signal.aborted && code !== 'E_TIMEOUT')) {
          safeEmit({ type: 'canceled', requestId, text: full });
        } else {
          safeEmit({ type: 'error', requestId, code, detail: (err && err.detail) || '', text: full });
        }
      })
      .finally(() => {
        if (active.get(requestId) === entry) active.delete(requestId);
      });

    return { requestId, finished };
  }

  return {
    start,
    cancel,
    cancelAll,
    isValidRequestId,
    activeCount: () => active.size,
  };
}

module.exports = {
  MAX_ACTIVE_PER_SENDER,
  createAiSessionManager,
};

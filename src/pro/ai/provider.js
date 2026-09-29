/**
 * OpenAI-compatible chat completions / models。仅在 main 进程调用；勿把 apiKey 写入日志。
 * 所有失败统一抛 AiError（code 为稳定错误码，文案由渲染层按 code 做 i18n）。
 */
'use strict';

/** @typedef {'E_AUTH'|'E_MODEL'|'E_RATE'|'E_CONTEXT'|'E_TIMEOUT'|'E_NETWORK'|'E_EMPTY'|'E_FORMAT'|'E_CANCELED'|'E_UNKNOWN'} AiErrorCode */

const AI_ERROR_CODES = [
  'E_AUTH', 'E_MODEL', 'E_RATE', 'E_CONTEXT', 'E_TIMEOUT',
  'E_NETWORK', 'E_EMPTY', 'E_FORMAT', 'E_CANCELED', 'E_UNKNOWN',
];

class AiError extends Error {
  /**
   * @param {AiErrorCode} code
   * @param {string} [detail] 已脱敏的补充信息（≤ 200 字）
   */
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AiError';
    this.code = code;
    this.detail = detail || '';
  }
}

/**
 * 脱敏：去掉可能泄漏的 Authorization / key 片段。
 * @param {unknown} err
 */
function sanitizeAiError(err) {
  let msg = (err && /** @type {any} */ (err).message) ? String(/** @type {any} */ (err).message) : String(err || '');
  msg = msg.replace(/sk-[a-zA-Z0-9_-]{8,}/g, 'sk-***');
  msg = msg.replace(/Bearer\s+\S+/gi, 'Bearer ***');
  msg = msg.replace(/api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi, 'api_key=***');
  return msg;
}

function trimDetail(text) {
  return sanitizeAiError({ message: text }).replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * HTTP 状态 + 响应体 → 错误码。
 * @param {number} status
 * @param {string} body
 * @returns {AiErrorCode}
 */
/**
 * 不传 max_tokens 时，部分网关按「吃满上下文」拒绝，正文只有几个字也会回
 * code=context_length_exceeded, message=token limit error。
 * 这句固定文案没有窗口数字，不能当成「正文过长」（额度用尽时 /models 也会回它）。
 */
const DEFAULT_MAX_TOKENS = 2048;

function isBareTokenLimit(body) {
  const b = String(body || '').toLowerCase();
  return /token limit error/.test(b) && !/maximum context length|\d+\s*tokens/.test(b);
}

function classifyHttpError(status, body) {
  const b = String(body || '').toLowerCase();
  if (isBareTokenLimit(b)) return 'E_RATE';
  if (/context[_ ]length|maximum context|too many tokens|context_length_exceeded/.test(b)) {
    return 'E_CONTEXT';
  }
  if (/model[_ ]not[_ ]found|does not exist|no such model|unknown model|invalid model/.test(b)) {
    return 'E_MODEL';
  }
  if (status === 401 || status === 403) return 'E_AUTH';
  if (status === 404) return 'E_MODEL';
  if (status === 429 || /insufficient[_ ]quota|rate limit/.test(b)) return 'E_RATE';
  if (status === 413) return 'E_CONTEXT';
  if (status === 408 || status === 504) return 'E_TIMEOUT';
  return 'E_UNKNOWN';
}

function baseWithoutEndpoint(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  return base.replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '');
}

/** @param {string} baseUrl */
function chatCompletionsUrl(baseUrl) {
  const base = baseWithoutEndpoint(baseUrl);
  if (!base) throw new AiError('E_NETWORK', 'Base URL is empty');
  return `${base}/chat/completions`;
}

/** @param {string} baseUrl */
function modelsUrl(baseUrl) {
  const base = baseWithoutEndpoint(baseUrl);
  if (!base) throw new AiError('E_NETWORK', 'Base URL is empty');
  return `${base}/models`;
}

/**
 * 把外部 signal 与内部超时合并成一个 AbortController；abort 原因记在 state.reason。
 * @param {AbortSignal|undefined} outer
 */
function linkedAbort(outer) {
  const ctrl = new AbortController();
  const state = { reason: /** @type {'canceled'|'timeout'|null} */ (null) };
  let timer = null;
  const onOuter = () => {
    if (!state.reason) state.reason = 'canceled';
    ctrl.abort();
  };
  if (outer) {
    if (outer.aborted) onOuter();
    else outer.addEventListener('abort', onOuter, { once: true });
  }
  return {
    signal: ctrl.signal,
    state,
    /** 重置超时计时器；ms<=0 表示清除 */
    arm(ms) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (ms > 0) {
        timer = setTimeout(() => {
          if (!state.reason) state.reason = 'timeout';
          ctrl.abort();
        }, ms);
      }
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (outer) outer.removeEventListener('abort', onOuter);
    },
  };
}

function abortedError(state) {
  return state.reason === 'timeout' ? new AiError('E_TIMEOUT') : new AiError('E_CANCELED');
}

/**
 * @param {unknown} err
 * @param {{reason: string|null}} state
 */
function toAiError(err, state) {
  if (err instanceof AiError) return err;
  if (state && state.reason) return abortedError(state);
  return new AiError('E_NETWORK', trimDetail(/** @type {any} */ (err) && /** @type {any} */ (err).message));
}

function authHeaders(apiKey, json) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (json !== false) headers['Content-Type'] = 'application/json';
  return headers;
}

async function throwForStatus(res) {
  let body = '';
  try { body = await res.text(); } catch (_) { /* ignore */ }
  throw new AiError(classifyHttpError(res.status, body), `HTTP ${res.status} ${trimDetail(body)}`.trim());
}

/**
 * 流式 chat；逐段回调 onChunk，resolve 完整文本。
 * @param {{
 *   baseUrl: string,
 *   apiKey: string,
 *   model: string,
 *   messages: Array<{role: string, content: string}>,
 *   signal?: AbortSignal,
 *   temperature?: number,
 *   maxTokens?: number,
 *   onChunk?: (text: string) => void,
 *   firstByteTimeoutMs?: number,
 *   idleTimeoutMs?: number,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<string>}
 */
async function streamChat(opts) {
  const doFetch = opts.fetchImpl || fetch;
  if (!opts.apiKey) throw new AiError('E_AUTH', 'API key missing');
  if (!opts.model) throw new AiError('E_MODEL', 'model missing');

  const link = linkedAbort(opts.signal);
  link.arm(opts.firstByteTimeoutMs == null ? 30000 : opts.firstByteTimeoutMs);
  const idleMs = opts.idleTimeoutMs == null ? 60000 : opts.idleTimeoutMs;

  let full = '';
  try {
    /** @type {Record<string, unknown>} */
    const body = {
      model: opts.model,
      messages: opts.messages,
      stream: true,
      temperature: opts.temperature == null ? 0.4 : opts.temperature,
      max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
    };
    const res = await doFetch(chatCompletionsUrl(opts.baseUrl), {
      method: 'POST',
      headers: authHeaders(opts.apiKey),
      body: JSON.stringify(body),
      signal: link.signal,
    });
    if (!res.ok) await throwForStatus(res);
    link.arm(idleMs);

    if (!res.body || typeof res.body.getReader !== 'function') {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        full = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
      } catch (_) {
        full = text;
      }
      if (full && opts.onChunk) opts.onChunk(full);
      return full;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      link.arm(idleMs);
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return full;
        let json;
        try { json = JSON.parse(data); } catch (_) { continue; }
        if (json && json.error) {
          const msg = typeof json.error === 'string' ? json.error : (json.error.message || '');
          throw new AiError(classifyHttpError(0, msg), trimDetail(msg));
        }
        const delta = json.choices && json.choices[0] && json.choices[0].delta
          ? json.choices[0].delta.content
          : '';
        if (delta) {
          full += delta;
          if (opts.onChunk) opts.onChunk(delta);
        }
      }
    }
    return full;
  } catch (err) {
    throw toAiError(err, link.state);
  } finally {
    link.dispose();
  }
}

/**
 * GET {base}/models → model id 列表（OpenAI 标准 data[].id）。
 * @param {{ baseUrl: string, apiKey: string, signal?: AbortSignal, timeoutMs?: number, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<Array<{ id: string, label?: string }>>}
 */
async function listModels(opts) {
  const doFetch = opts.fetchImpl || fetch;
  if (!opts.apiKey) throw new AiError('E_AUTH', 'API key missing');
  const link = linkedAbort(opts.signal);
  link.arm(opts.timeoutMs == null ? 15000 : opts.timeoutMs);
  try {
    const res = await doFetch(modelsUrl(opts.baseUrl), {
      method: 'GET',
      // GET 不带 JSON Content-Type：部分网关会按空 body 去解析，再回一串与额度无关的 400
      headers: authHeaders(opts.apiKey, false),
      signal: link.signal,
    });
    if (!res.ok) await throwForStatus(res);
    let json;
    try {
      json = await res.json();
    } catch (_) {
      throw new AiError('E_FORMAT');
    }
    const list = Array.isArray(json) ? json : (json && Array.isArray(json.data) ? json.data : null);
    if (!list) throw new AiError('E_FORMAT');
    const out = [];
    const seen = new Set();
    for (const item of list) {
      const id = item && typeof item.id === 'string' ? item.id.trim() : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const label = item && typeof item.name === 'string' && item.name.trim() && item.name.trim() !== id
        ? item.name.trim()
        : undefined;
      out.push(label ? { id, label } : { id });
    }
    return out;
  } catch (err) {
    throw toAiError(err, link.state);
  } finally {
    link.dispose();
  }
}

/**
 * 最小 chat 探测：验证 Key / Base URL / 模型 id 可用。
 * @param {{ baseUrl: string, apiKey: string, model: string, signal?: AbortSignal, timeoutMs?: number, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<{ latencyMs: number }>}
 */
async function testChat(opts) {
  const doFetch = opts.fetchImpl || fetch;
  if (!opts.apiKey) throw new AiError('E_AUTH', 'API key missing');
  if (!opts.model) throw new AiError('E_MODEL', 'model missing');
  const link = linkedAbort(opts.signal);
  link.arm(opts.timeoutMs == null ? 15000 : opts.timeoutMs);
  const started = Date.now();
  try {
    const res = await doFetch(chatCompletionsUrl(opts.baseUrl), {
      method: 'POST',
      headers: authHeaders(opts.apiKey),
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: 'user', content: 'ping' }],
        // 1 会被思考型模型当成输出预算不够，回 token limit error
        max_tokens: 16,
        stream: false,
      }),
      signal: link.signal,
    });
    if (!res.ok) await throwForStatus(res);
    try { await res.text(); } catch (_) { /* 仅探测连通，忽略响应体 */ }
    return { latencyMs: Date.now() - started };
  } catch (err) {
    throw toAiError(err, link.state);
  } finally {
    link.dispose();
  }
}

module.exports = {
  AI_ERROR_CODES,
  AiError,
  sanitizeAiError,
  DEFAULT_MAX_TOKENS,
  isBareTokenLimit,
  classifyHttpError,
  chatCompletionsUrl,
  modelsUrl,
  streamChat,
  listModels,
  testChat,
};

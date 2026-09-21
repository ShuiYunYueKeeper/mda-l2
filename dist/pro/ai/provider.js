/**
 * OpenAI-compatible chat completions（streaming）。仅在 main 进程调用；勿把 apiKey 写入日志。
 */
'use strict';

/**
 * 脱敏错误：去掉可能泄漏的 Authorization / key 片段。
 * @param {unknown} err
 */
function sanitizeAiError(err) {
  let msg = (err && err.message) ? String(err.message) : String(err || '未知错误');
  msg = msg.replace(/sk-[a-zA-Z0-9_-]{8,}/g, 'sk-***');
  msg = msg.replace(/Bearer\s+\S+/gi, 'Bearer ***');
  msg = msg.replace(/api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi, 'api_key=***');
  return msg;
}

/**
 * @param {string} baseUrl
 */
function chatCompletionsUrl(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('未配置 Base URL');
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

/**
 * 流式请求；通过 onChunk / onDone / onError 回调（也可配合 AbortSignal 取消）。
 * @param {{
 *   baseUrl: string,
 *   apiKey: string,
 *   model: string,
 *   messages: Array<{role: string, content: string}>,
 *   signal?: AbortSignal,
 *   temperature?: number,
 *   onChunk?: (text: string) => void,
 *   onDone?: (full: string) => void,
 *   onError?: (message: string) => void,
 * }} opts
 */
async function streamChat(opts) {
  const {
    baseUrl,
    apiKey,
    model,
    messages,
    signal,
    temperature,
    onChunk,
    onDone,
    onError,
  } = opts;

  if (!apiKey) {
    const msg = '未配置 API Key';
    if (onError) onError(msg);
    throw new Error(msg);
  }
  if (!model) {
    const msg = '未配置模型';
    if (onError) onError(msg);
    throw new Error(msg);
  }

  let res;
  try {
    res = await fetch(chatCompletionsUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: temperature == null ? 0.4 : temperature,
      }),
      signal,
    });
  } catch (err) {
    if (signal && signal.aborted) {
      const msg = '已取消';
      if (onError) onError(msg);
      throw Object.assign(new Error(msg), { canceled: true });
    }
    const msg = sanitizeAiError(err);
    if (onError) onError(msg);
    throw new Error(msg);
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch (_) { /* ignore */ }
    const safeDetail = sanitizeAiError({ message: detail }).slice(0, 200);
    const msg = `AI 请求失败 (${res.status})${safeDetail ? ': ' + safeDetail : ''}`;
    if (onError) onError(msg);
    throw new Error(msg);
  }

  if (!res.body || typeof res.body.getReader !== 'function') {
    // Node 无流时退回全文 JSON（部分环境）
    const text = await res.text();
    let full = '';
    try {
      const json = JSON.parse(text);
      full = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
    } catch (_) {
      full = text;
    }
    if (onChunk && full) onChunk(full);
    if (onDone) onDone(full);
    return full;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          if (onDone) onDone(full);
          return full;
        }
        try {
          const json = JSON.parse(data);
          const delta = json.choices && json.choices[0] && json.choices[0].delta
            ? json.choices[0].delta.content
            : '';
          if (delta) {
            full += delta;
            if (onChunk) onChunk(delta);
          }
        } catch (_) {
          // 忽略残缺 SSE 行
        }
      }
    }
  } catch (err) {
    if (signal && signal.aborted) {
      const msg = '已取消';
      if (onError) onError(msg);
      throw Object.assign(new Error(msg), { canceled: true });
    }
    const msg = sanitizeAiError(err);
    if (onError) onError(msg);
    throw new Error(msg);
  }

  if (onDone) onDone(full);
  return full;
}

/**
 * 非流式（美化等需要完整结果时可用；仍支持 signal 取消）。
 */
async function completeChat(opts) {
  const { baseUrl, apiKey, model, messages, signal, temperature } = opts;
  if (!apiKey) throw new Error('未配置 API Key');
  if (!model) throw new Error('未配置模型');

  let res;
  try {
    res = await fetch(chatCompletionsUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: temperature == null ? 0.3 : temperature,
      }),
      signal,
    });
  } catch (err) {
    if (signal && signal.aborted) {
      throw Object.assign(new Error('已取消'), { canceled: true });
    }
    throw new Error(sanitizeAiError(err));
  }

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (_) { /* ignore */ }
    throw new Error(`AI 请求失败 (${res.status}): ${sanitizeAiError({ message: detail }).slice(0, 200)}`);
  }

  const json = await res.json();
  return (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
}

module.exports = {
  sanitizeAiError,
  chatCompletionsUrl,
  streamChat,
  completeChat,
};

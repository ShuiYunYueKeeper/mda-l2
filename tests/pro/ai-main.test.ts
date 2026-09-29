/**
 * Pro AI main 进程模块：provider / actions / session / settings（纯 Node，fetch 以桩替代）。
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const provider = require('../../src/pro/ai/provider');
const actions = require('../../src/pro/ai/actions');
const session = require('../../src/pro/ai/session');
const settings = require('../../src/pro/ai/settings');

const ANNO = '[comment]: <> (@anno {"id":"a1","content":"secret-note","tags":[],"level":"info","status":"open","created_at":"2026-01-01T00:00:00Z"})';

function sseResponse(chunks: string[], opts: { delayMs?: number } = {}) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
            if (i >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: enc.encode(chunks[i++]) };
          },
        };
      },
    },
    text: async () => '',
  };
}

function sseData(content: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function errorResponse(status: number, body: string) {
  return { ok: false, status, text: async () => body, json: async () => JSON.parse(body) };
}

describe('pro/ai/provider', () => {
  test('classifyHttpError maps common failures', () => {
    expect(provider.classifyHttpError(401, '')).toBe('E_AUTH');
    expect(provider.classifyHttpError(429, '')).toBe('E_RATE');
    expect(provider.classifyHttpError(400, '{"error":{"code":"model_not_found"}}')).toBe('E_MODEL');
    expect(provider.classifyHttpError(400, 'maximum context length is 8192 tokens')).toBe('E_CONTEXT');
    expect(provider.classifyHttpError(400, '{"error":{"code":"context_length_exceeded","message":"token limit error"}}')).toBe('E_RATE');
    expect(provider.classifyHttpError(500, 'boom')).toBe('E_UNKNOWN');
  });

  test('endpoint URLs tolerate trailing endpoint segments', () => {
    expect(provider.chatCompletionsUrl('https://x.com/v1/')).toBe('https://x.com/v1/chat/completions');
    expect(provider.chatCompletionsUrl('https://x.com/v1/chat/completions')).toBe('https://x.com/v1/chat/completions');
    expect(provider.modelsUrl('https://x.com/v1/chat/completions')).toBe('https://x.com/v1/models');
  });

  test('streamChat concatenates SSE deltas and reports chunks', async () => {
    const got: string[] = [];
    const full = await provider.streamChat({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      model: 'm',
      messages: [],
      onChunk: (t: string) => got.push(t),
      fetchImpl: async () => sseResponse([sseData('你'), sseData('好') + 'data: [DONE]\n\n']),
    });
    expect(full).toBe('你好');
    expect(got).toEqual(['你', '好']);
  });

  test('streamChat sends max_tokens when the caller omits it', async () => {
    let body: any = null;
    await provider.streamChat({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl: async (_url: string, init: any) => {
        body = JSON.parse(init.body);
        return sseResponse(['data: [DONE]\n\n']);
      },
    });
    expect(body.max_tokens).toBe(provider.DEFAULT_MAX_TOKENS);
  });

  test('streamChat maps HTTP 401 to E_AUTH without leaking the key', async () => {
    await expect(provider.streamChat({
      baseUrl: 'https://x/v1',
      apiKey: 'sk-abcdefghijklmnopqrstuvwxyz',
      model: 'm',
      messages: [],
      fetchImpl: async () => errorResponse(401, 'bad key sk-abcdefghijklmnopqrstuvwxyz'),
    })).rejects.toMatchObject({ code: 'E_AUTH', detail: expect.not.stringContaining('sk-abcdefgh') });
  });

  test('streamChat idle timeout → E_TIMEOUT', async () => {
    await expect(provider.streamChat({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      model: 'm',
      messages: [],
      idleTimeoutMs: 20,
      fetchImpl: async (_url: string, init: any) => ({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: () => new Promise((_res, rej) => {
              init.signal.addEventListener('abort', () => rej(new Error('aborted')));
            }),
          }),
        },
      }),
    })).rejects.toMatchObject({ code: 'E_TIMEOUT' });
  });

  test('streamChat external abort → E_CANCELED', async () => {
    const ctrl = new AbortController();
    const p = provider.streamChat({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      model: 'm',
      messages: [],
      signal: ctrl.signal,
      fetchImpl: (_url: string, init: any) => new Promise((_res, rej) => {
        init.signal.addEventListener('abort', () => rej(new Error('aborted')));
      }),
    });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: 'E_CANCELED' });
  });

  test('listModels parses data[].id and dedupes', async () => {
    const list = await provider.listModels({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'a' }, { id: 'b', name: 'Model B' }, { id: 'a' }, { foo: 1 }] }),
      }),
    });
    expect(list).toEqual([{ id: 'a' }, { id: 'b', label: 'Model B' }]);
  });

  test('listModels non-standard JSON → E_FORMAT', async () => {
    await expect(provider.listModels({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ models: 'x' }) }),
    })).rejects.toMatchObject({ code: 'E_FORMAT' });
  });

  test('testChat sends a small but non-1 max_tokens', async () => {
    let body: any = null;
    const r = await provider.testChat({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      model: 'm',
      fetchImpl: async (_url: string, init: any) => {
        body = JSON.parse(init.body);
        return { ok: true, status: 200, text: async () => '{}' };
      },
    });
    expect(body.max_tokens).toBe(16);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('pro/ai/actions', () => {
  test('unknown action is rejected', () => {
    expect(() => actions.buildActionRequest('beautify', {})).toThrow();
  });

  test('rewrite actions require a non-empty scope', () => {
    expect(() => actions.buildActionRequest('polish', { scope: '   ' })).toThrow(/scope/);
  });

  test('annotation lines never reach the model (defense in depth)', () => {
    const req = actions.buildActionRequest('polish', { scope: `正文一\n${ANNO}\n正文二` });
    const all = req.messages.filter((m: any) => m.role !== 'system').map((m: any) => m.content).join('\n');
    expect(all).not.toContain('@anno');
    expect(all).not.toContain('secret-note');
    expect(all).toContain('正文二');
  });

  test('malformed annotation lines are stripped too', () => {
    const out = actions.stripAnnoLines('a\ncomment]: <> (@anno {broken\nb');
    expect(out).not.toContain('@anno');
  });

  test('continue clamps before-context from the tail', () => {
    const before = 'x'.repeat(10000) + 'TAIL';
    const req = actions.buildActionRequest('continue', { before });
    const user = req.messages[1].content;
    expect(user).toContain('TAIL');
    expect(user.length).toBeLessThan(7000);
  });

  test('refine history appends assistant + user turns', () => {
    const req = actions.buildActionRequest('polish', {
      scope: 'abc',
      history: [{ output: 'v1', instruction: '再短一点' }],
    });
    expect(req.messages.slice(-2).map((m: any) => m.role)).toEqual(['assistant', 'user']);
    expect(req.messages[req.messages.length - 1].content).toContain('再短一点');
  });

  test('kinds are exposed for the renderer', () => {
    expect(actions.buildActionRequest('explain', { scope: 'x' }).kind).toBe('read');
    expect(actions.buildActionRequest('translate', { scope: 'x', targetLang: 'ja' }).kind).toBe('rewrite');
    expect(actions.buildActionRequest('write', { instruction: '写一份周报' }).kind).toBe('generate');
  });
});

describe('pro/ai/session', () => {
  function makeManager() {
    const events: any[] = [];
    const mgr = session.createAiSessionManager({ emit: (_s: any, ev: any) => events.push(ev) });
    return { mgr, events };
  }

  test('chunk → done carry the requestId', async () => {
    const { mgr, events } = makeManager();
    const { finished } = mgr.start('w', 'r1', async (_sig: AbortSignal, onChunk: any) => {
      onChunk('a');
      onChunk('b');
      return 'ab';
    });
    await finished;
    expect(events.map((e) => e.type)).toEqual(['chunk', 'chunk', 'done']);
    expect(events.every((e) => e.requestId === 'r1')).toBe(true);
    expect(events[2].text).toBe('ab');
    expect(mgr.activeCount()).toBe(0);
  });

  test('cancel emits canceled with partial text', async () => {
    const { mgr, events } = makeManager();
    let started: () => void = () => {};
    const ready = new Promise<void>((r) => { started = r; });
    const { finished } = mgr.start('w', 'r2', (sig: AbortSignal, onChunk: any) => new Promise((_res, rej) => {
      onChunk('部分');
      sig.addEventListener('abort', () => rej(Object.assign(new Error('x'), { code: 'E_CANCELED' })));
      started();
    }));
    await ready;
    mgr.cancel('r2');
    await finished;
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: 'canceled', requestId: 'r2', text: '部分' });
  });

  test('errors carry code but not raw messages', async () => {
    const { mgr, events } = makeManager();
    const { finished } = mgr.start('w', 'r3', async () => {
      throw new provider.AiError('E_RATE', 'HTTP 429');
    });
    await finished;
    expect(events[0]).toMatchObject({ type: 'error', code: 'E_RATE' });
  });

  test('restarting the same requestId silences the old request', async () => {
    const { mgr, events } = makeManager();
    let releaseOld: (v: string) => void = () => {};
    const old = mgr.start('w', 'r4', () => new Promise<string>((res) => { releaseOld = res; }));
    const fresh = mgr.start('w', 'r4', async () => 'new');
    releaseOld('old');
    await Promise.all([old.finished, fresh.finished]);
    expect(events.filter((e) => e.type === 'done').map((e) => e.text)).toEqual(['new']);
  });

  test('cancel before run starts never calls run', async () => {
    const { mgr, events } = makeManager();
    const run = jest.fn(async () => 'x');
    const { finished } = mgr.start('w', 'r5', run);
    mgr.cancel('r5');
    await finished;
    expect(run).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'canceled', requestId: 'r5', text: '' }]);
  });

  test('rejects malformed requestId', () => {
    const { mgr } = makeManager();
    expect(() => mgr.start('w', '../x', async () => '')).toThrow();
  });
});

describe('pro/ai/settings V2', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-ai-set-'));
  const fakeSafe = {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from('enc:' + s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, ''),
  };

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  });

  test('migrates M7 single model into the provider bucket', () => {
    const v2 = settings.migrate({
      provider: 'deepseek',
      baseUrl: 'https://proxy/v1/',
      model: 'deepseek-v3-pro',
      apiKeyEnc: { enc: 'b64', data: 'eA==' },
    });
    expect(v2.version).toBe(2);
    const b = v2.providers.deepseek;
    expect(b.baseUrl).toBe('https://proxy/v1');
    expect(b.models[0]).toEqual({ id: 'deepseek-v3-pro', enabled: true, source: 'preset' });
    expect(b.defaultModelId).toBe('deepseek-v3-pro');
    expect(b.apiKeyEnc).toBeTruthy();
    expect(v2.providers.openai.apiKeyEnc).toBeUndefined();
  });

  test('normalizeModels falls back when default is disabled', () => {
    const r = settings.normalizeModels(
      [{ id: 'a', enabled: false }, { id: 'b', enabled: true }, { id: 'b', enabled: true }, { id: 'bad id' }],
      'a',
    );
    expect(r.models.map((m: any) => m.id)).toEqual(['a', 'b']);
    expect(r.defaultModelId).toBe('b');
  });

  test('mergeFetchedModels keeps existing enable state', () => {
    const r = settings.mergeFetchedModels(
      [{ id: 'a', enabled: false, source: 'manual' }],
      [{ id: 'a' }, { id: 'c' }],
    );
    expect(r.added).toBe(1);
    expect(r.models).toEqual([
      { id: 'a', enabled: false, source: 'manual' },
      { id: 'c', enabled: true, source: 'fetched' },
    ]);
  });

  test('store keeps keys per provider and never exposes plaintext', () => {
    const store = settings.createAiSettingsStore({ userDataPath: tmp, safeStorage: fakeSafe });
    store.saveSettings({ buckets: { openai: { apiKey: 'sk-openai-key' } } });
    const r = store.saveSettings({
      provider: 'deepseek',
      buckets: { deepseek: { apiKey: 'sk-ds-key', models: [{ id: 'x', enabled: true }], defaultModelId: 'x' } },
    });
    const pub = r.value;
    expect(pub.provider).toBe('deepseek');
    expect(pub.hasKey).toBe(true);
    expect(pub.buckets.openai.hasKey).toBe(true);
    expect(JSON.stringify(pub)).not.toContain('sk-');
    expect(store.getApiKeyPlain('openai')).toBe('sk-openai-key');
    const cfg = store.resolveRequestConfig();
    expect(cfg).toMatchObject({ apiKey: 'sk-ds-key', model: 'x', modelAllowed: true });
    expect(store.resolveRequestConfig({ modelId: 'not-enabled' }).modelAllowed).toBe(false);
    const onDisk = fs.readFileSync(settings.settingsPath(tmp), 'utf8');
    expect(onDisk).not.toContain('sk-ds-key');
  });
});

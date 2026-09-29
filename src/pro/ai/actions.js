/**
 * AI 动作注册表：action id + 渲染层 payload → chat 请求参数。
 * 渲染层已按 ai-context 剔除批注并截断；这里再做一次兜底（批注行过滤 + 长度钳制），
 * 因为 main 不能信任 IPC 入参。
 */
'use strict';

const { AiError } = require('./provider');
const {
  POLISH_STYLES,
  LANG_NAMES,
  refineTurns,
  rewriteMessages,
  generateMessages,
  readMessages,
} = require('./prompts');

/** 宽松识别：只认 `<> (@anno` 标记，容忍方括号缺失 / JSON 残缺（同 GUI ANNO_ISH） */
const ANNO_ISH_LINE = /^[ \t]*\[?comment\]?:?\s*<>\s*\(@anno\b.*$/gm;

const LIMITS = {
  before: 6000,
  after: 1500,
  scope: 8000,
  instruction: 1000,
  historyOutput: 8000,
  historyTurns: 5,
};

/** @typedef {'generate'|'rewrite'|'read'} ActionKind */

/**
 * @type {Record<string, { kind: ActionKind, temperature: number, needsScope?: boolean, needsInstruction?: boolean, build: (p: any, lang: string) => Array<{role:string,content:string}> }>}
 */
const ACTIONS = {
  continue: {
    kind: 'generate',
    temperature: 0.7,
    build: (p, lang) => generateMessages(
      'Continue writing the document from the cursor position. Write one to three paragraphs that follow naturally from the text before the cursor and do not repeat the text after it.',
      p, lang,
    ),
  },
  write: {
    kind: 'generate',
    temperature: 0.7,
    needsInstruction: true,
    build: (p, lang) => generateMessages(
      'Write new Markdown content at the cursor position according to the user request.',
      p, lang,
    ),
  },
  polish: {
    kind: 'rewrite',
    temperature: 0.5,
    needsScope: true,
    build: (p, lang) => rewriteMessages(POLISH_STYLES[p.style] || POLISH_STYLES.quick, p, lang),
  },
  expand: {
    kind: 'rewrite',
    temperature: 0.6,
    needsScope: true,
    build: (p, lang) => rewriteMessages(
      'Expand the text with more detail, examples, or explanation (roughly 1.5–2x the length) while keeping its meaning and structure.',
      p, lang,
    ),
  },
  shorten: {
    kind: 'rewrite',
    temperature: 0.4,
    needsScope: true,
    build: (p, lang) => rewriteMessages(
      'Shorten the text to roughly half its length, keeping the key information.',
      p, lang,
    ),
  },
  grammar: {
    kind: 'rewrite',
    temperature: 0.2,
    needsScope: true,
    build: (p, lang) => rewriteMessages(
      'Fix spelling, grammar, and punctuation errors only. Do not change wording that is already correct.',
      p, lang,
    ),
  },
  translate: {
    kind: 'rewrite',
    temperature: 0.3,
    needsScope: true,
    build: (p) => rewriteMessages(
      `Translate the text into ${LANG_NAMES[p.targetLang] || LANG_NAMES.en}. Keep proper nouns and technical terms accurate.`,
      p, 'fixed',
    ),
  },
  custom: {
    kind: 'rewrite',
    temperature: 0.5,
    needsScope: true,
    needsInstruction: true,
    build: (p, lang) => rewriteMessages(
      `Rewrite the text according to this request: ${p.instruction}`,
      p, lang,
    ),
  },
  explain: {
    kind: 'read',
    temperature: 0.3,
    needsScope: true,
    build: (p, lang) => readMessages(
      'Explain the text to the reader: its meaning, key concepts, and any terms that may be unclear. If it is code, explain what the code does.',
      p, lang,
    ),
  },
  summarize: {
    kind: 'read',
    temperature: 0.3,
    needsScope: true,
    build: (p, lang) => readMessages(
      'Summarize the text: one short overview sentence followed by the key points as a bullet list.',
      p, lang,
    ),
  },
};

function stripAnnoLines(text) {
  return String(text || '').replace(ANNO_ISH_LINE, '');
}

function clampTail(s, n) {
  return s.length > n ? s.slice(s.length - n) : s;
}

function clampHead(s, n) {
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * @param {unknown} raw
 */
function normalizePayload(raw) {
  const p = raw && typeof raw === 'object' ? /** @type {any} */ (raw) : {};
  const history = Array.isArray(p.history)
    ? p.history.slice(-LIMITS.historyTurns).map((h) => ({
      instruction: clampHead(String((h && h.instruction) || ''), LIMITS.instruction),
      output: clampHead(stripAnnoLines((h && h.output) || ''), LIMITS.historyOutput),
    }))
    : [];
  return {
    fileName: clampHead(String(p.fileName || ''), 200),
    headingPath: Array.isArray(p.headingPath)
      ? p.headingPath.slice(0, 6).map((h) => clampHead(String(h || ''), 120))
      : [],
    before: clampTail(stripAnnoLines(p.before), LIMITS.before),
    after: clampHead(stripAnnoLines(p.after), LIMITS.after),
    scope: clampHead(stripAnnoLines(p.scope), LIMITS.scope),
    instruction: clampHead(String(p.instruction || '').trim(), LIMITS.instruction),
    style: typeof p.style === 'string' ? p.style : 'quick',
    targetLang: typeof p.targetLang === 'string' && LANG_NAMES[p.targetLang] ? p.targetLang : 'en',
    inline: !!p.inline,
    history,
  };
}

function isAiAction(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, id);
}

/**
 * @param {string} actionId
 * @param {unknown} rawPayload
 * @param {{ outputLang?: string }} [prefs]
 * @returns {{ kind: ActionKind, temperature: number, messages: Array<{role:string,content:string}> }}
 */
function buildActionRequest(actionId, rawPayload, prefs) {
  if (!isAiAction(actionId)) throw new AiError('E_UNKNOWN', `unknown action: ${String(actionId)}`);
  const def = ACTIONS[actionId];
  const p = normalizePayload(rawPayload);
  if (def.needsScope && !p.scope.trim()) throw new AiError('E_EMPTY', 'scope is empty');
  if (def.needsInstruction && !p.instruction) throw new AiError('E_EMPTY', 'instruction is empty');
  if (def.kind === 'generate' && !p.before.trim() && !p.after.trim() && !p.instruction) {
    throw new AiError('E_EMPTY', 'no context');
  }
  const lang = (prefs && prefs.outputLang) || 'auto';
  const messages = def.build(p, lang).concat(refineTurns(p.history));
  return { kind: def.kind, temperature: def.temperature, messages };
}

module.exports = {
  ACTIONS,
  LIMITS,
  isAiAction,
  normalizePayload,
  stripAnnoLines,
  buildActionRequest,
};

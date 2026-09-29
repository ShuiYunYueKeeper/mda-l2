/**
 * AI 动作 prompt 模板。编辑类动作输出须为纯 Markdown，不带解释性前后缀。
 */
'use strict';

const COMMON_RULES = [
  'You are a writing assistant embedded in MDA, a local Markdown editor.',
  'Never output or modify lines of the form `[comment]: <> (@anno ...)`; they are hidden review annotations.',
];

const EDIT_OUTPUT_RULES = [
  'Output ONLY the resulting Markdown — no preamble, no explanation, no surrounding quotes,',
  'and do not wrap the whole answer in a code fence.',
  'Keep the content of fenced code blocks, inline code, URLs, and math unchanged.',
];

/** 润色风格 → 指令 */
const POLISH_STYLES = {
  quick: 'Polish the text: fix awkward wording and improve flow while keeping the original tone and length.',
  formal: 'Rewrite the text in a more formal, professional tone suitable for business or official documents.',
  casual: 'Rewrite the text in a more casual, conversational tone.',
  literary: 'Rewrite the text with more vivid, literary language while keeping the meaning.',
  concise: 'Rewrite the text to be more concise: remove redundancy and filler without losing information.',
};

const LANG_NAMES = {
  zh: 'Simplified Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
};

/**
 * @param {'auto'|string} outputLang
 */
function languageRule(outputLang) {
  if (outputLang && outputLang !== 'auto' && LANG_NAMES[outputLang]) {
    return `Write the answer in ${LANG_NAMES[outputLang]}.`;
  }
  return 'Write in the same language as the provided text.';
}

/**
 * @param {{ fileName?: string, headingPath?: string[] }} p
 */
function contextHeader(p) {
  const lines = [];
  if (p.fileName) lines.push(`File: ${p.fileName}`);
  if (p.headingPath && p.headingPath.length) lines.push(`Section: ${p.headingPath.join(' > ')}`);
  return lines.join('\n');
}

/**
 * 追加要求：把前几轮结果与指令作为对话历史。
 * @param {Array<{ instruction: string, output: string }>|undefined} history
 */
function refineTurns(history) {
  const out = [];
  for (const h of history || []) {
    if (!h || !h.output) continue;
    out.push({ role: 'assistant', content: String(h.output) });
    if (h.instruction) {
      out.push({
        role: 'user',
        content: `Revise your previous answer according to this request, and output the full revised result only:\n${h.instruction}`,
      });
    }
  }
  return out;
}

function system(parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * 改写类通用构建。
 * @param {string} task
 * @param {any} p
 * @param {string} outputLang
 */
function rewriteMessages(task, p, outputLang) {
  const sys = system([
    ...COMMON_RULES,
    task,
    p.inline
      ? 'The text is part of a single line: do not add line breaks or block-level Markdown.'
      : 'Preserve the Markdown structure (headings, lists, tables) unless the task requires otherwise.',
    ...EDIT_OUTPUT_RULES,
    outputLang === 'fixed' ? '' : languageRule(outputLang),
  ]);
  const user = [
    contextHeader(p),
    '--- TEXT ---',
    p.scope,
    '--- END ---',
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

/**
 * 生成类（续写 / 帮我写）通用构建。
 */
function generateMessages(task, p, outputLang) {
  const sys = system([
    ...COMMON_RULES,
    task,
    'Match the heading levels, list style, and tone of the surrounding document.',
    ...EDIT_OUTPUT_RULES,
    languageRule(outputLang),
  ]);
  const user = [
    contextHeader(p),
    p.before ? '--- BEFORE CURSOR ---\n' + p.before : '',
    p.after ? '--- AFTER CURSOR ---\n' + p.after : '',
    p.instruction ? '--- REQUEST ---\n' + p.instruction : '',
    '--- END ---',
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

function readMessages(task, p, outputLang) {
  const sys = system([
    ...COMMON_RULES,
    task,
    'Answer in concise Markdown (short paragraphs or bullet points). Do not repeat the original text.',
    languageRule(outputLang),
  ]);
  const user = [
    contextHeader(p),
    '--- TEXT ---',
    p.scope,
    '--- END ---',
    p.instruction ? 'Question: ' + p.instruction : '',
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

module.exports = {
  POLISH_STYLES,
  LANG_NAMES,
  languageRule,
  refineTurns,
  rewriteMessages,
  generateMessages,
  readMessages,
};

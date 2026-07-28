/**
 * Pro AI prompt 模板。输出须为纯 Markdown，不包裹解释性前后缀。
 */
'use strict';

const CONTINUE_SYSTEM = [
  'You are a Markdown writing assistant inside MDA.',
  'Continue the document from the cursor in the same language and style.',
  'Output ONLY the continuation Markdown — no preamble, no quotes, no code fences around the whole answer.',
  'Respect existing heading levels, lists, and tables.',
  'Do not invent or modify [comment]: <> (@anno ...) annotation lines.',
].join(' ');

const COMPLETE_SYSTEM = [
  'You are a Markdown completion assistant inside MDA.',
  'Suggest a SHORT completion (usually one phrase to a few lines) at the cursor.',
  'Output ONLY the suggested insertion text — no explanations.',
  'Match the document language and local formatting.',
].join(' ');

const BEAUTIFY_SYSTEM = [
  'You are a Markdown editing assistant inside MDA.',
  'Improve clarity, structure, and wording while preserving meaning and technical terms.',
  'Output ONLY the revised Markdown for the given scope — no preamble.',
  'Keep fenced code blocks unchanged in content.',
  'Never delete or rewrite [comment]: <> (@anno ...) annotation lines; keep them exactly as-is and in place.',
].join(' ');

/**
 * @param {{ textBefore: string, textAfter?: string, selection?: string, fileName?: string }} input
 */
function buildContinueMessages(input) {
  const before = String(input.textBefore || '');
  const after = String(input.textAfter || '');
  const selection = String(input.selection || '');
  const name = input.fileName ? `File: ${input.fileName}\n` : '';
  const user = [
    name,
    '--- BEFORE CURSOR ---',
    before.slice(-12000),
    selection ? '--- SELECTION ---\n' + selection.slice(0, 4000) : '',
    '--- AFTER CURSOR ---',
    after.slice(0, 4000),
    '---',
    'Continue writing after the cursor (or after the selection if present).',
  ].filter(Boolean).join('\n');

  return [
    { role: 'system', content: CONTINUE_SYSTEM },
    { role: 'user', content: user },
  ];
}

/**
 * @param {{ textBefore: string, textAfter?: string, fileName?: string }} input
 */
function buildCompleteMessages(input) {
  const before = String(input.textBefore || '');
  const after = String(input.textAfter || '');
  const name = input.fileName ? `File: ${input.fileName}\n` : '';
  const user = [
    name,
    '--- BEFORE ---',
    before.slice(-6000),
    '--- AFTER ---',
    after.slice(0, 2000),
    '---',
    'Provide a short completion to insert at the cursor.',
  ].join('\n');

  return [
    { role: 'system', content: COMPLETE_SYSTEM },
    { role: 'user', content: user },
  ];
}

/**
 * @param {{ source: string, scope?: 'selection'|'document', fileName?: string }} input
 */
function buildBeautifyMessages(input) {
  const source = String(input.source || '');
  const scope = input.scope === 'document' ? 'document' : 'selection';
  const name = input.fileName ? `File: ${input.fileName}\n` : '';
  const user = [
    name,
    `Scope: ${scope}`,
    '--- MARKDOWN ---',
    source.slice(0, 40000),
    '---',
    'Return the improved Markdown only.',
  ].join('\n');

  return [
    { role: 'system', content: BEAUTIFY_SYSTEM },
    { role: 'user', content: user },
  ];
}

module.exports = {
  CONTINUE_SYSTEM,
  COMPLETE_SYSTEM,
  BEAUTIFY_SYSTEM,
  buildContinueMessages,
  buildCompleteMessages,
  buildBeautifyMessages,
};

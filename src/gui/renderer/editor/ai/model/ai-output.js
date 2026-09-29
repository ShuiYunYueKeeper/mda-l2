/**
 * 模型输出清洗（纯函数）：剥整体围栏包裹 / 客套前缀 / 批注行；行内范围压成单行。
 */
'use strict';

const { findAnnotationHideRanges } = require('../../model/anno-lines');

const WRAP_FENCE_RE = /^\s*(`{3,}|~{3,})[ \t]*(?:markdown|md)?[ \t]*\n([\s\S]*?)\n[ \t]*\1[ \t]*\s*$/i;
const PREAMBLE_RE = /^(?:以下是|下面是|这是|好的[，,]|当然[，,]|here is|here's|sure[,!]|certainly[,!])[^\n]{0,60}[:：]\s*$/i;
const CJK_RE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function stripAnnoLines(text) {
  const ranges = findAnnotationHideRanges(text);
  if (!ranges.length) return text;
  let out = '';
  let p = 0;
  for (const r of ranges) {
    out += text.slice(p, r.from);
    p = r.to;
  }
  return out + text.slice(p);
}

/**
 * 行内合并换行：两侧都是 CJK 字符时直接拼接，否则用一个空格。
 * @param {string} s
 */
function joinLines(s) {
  return s.replace(/[ \t]*\n+[ \t]*/g, (m, offset, whole) => {
    const prev = whole.charAt(offset - 1);
    const next = whole.charAt(offset + m.length);
    return CJK_RE.test(prev) && CJK_RE.test(next) ? '' : ' ';
  });
}

/**
 * @param {string} raw
 * @param {{ inline?: boolean, original?: string }} [opts]
 * @returns {{ text: string, joinedLines: boolean, strippedAnno: boolean }}
 */
function cleanAiOutput(raw, opts) {
  const o = opts || {};
  let text = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n');

  const originalIsFence = o.original != null && /^\s*(`{3,}|~{3,})/.test(o.original);
  if (!originalIsFence) {
    const m = WRAP_FENCE_RE.exec(text);
    if (m) text = m[2];
  }

  const lines = text.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length > 1 && PREAMBLE_RE.test(lines[0].trim())) {
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
  }
  text = lines.join('\n');

  const before = text;
  text = stripAnnoLines(text);
  const strippedAnno = text !== before;

  text = text.replace(/\s+$/, '');

  let joinedLines = false;
  if (o.inline && text.indexOf('\n') >= 0) {
    text = joinLines(text).trim();
    joinedLines = true;
  }
  return { text, joinedLines, strippedAnno };
}

module.exports = {
  cleanAiOutput,
  stripAnnoLines,
  joinLines,
};

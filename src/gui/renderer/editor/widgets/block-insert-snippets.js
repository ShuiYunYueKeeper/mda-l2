/**
 * 块手柄菜单：上/下方插入的 Markdown 片段模板。
 */
'use strict';

/** @type {Record<string, string>} */
const INSERT_SNIPPETS = {
  text: '',
  h1: '# ',
  h2: '## ',
  h3: '### ',
  h4: '#### ',
  h5: '##### ',
  h6: '###### ',
  bullet: '- ',
  ordered: '1. ',
  task: '- [ ] ',
  code: '```\n\n```',
  mermaid: '```mermaid\ngraph TD\n  A-->B\n```',
  // 行末保留空格：hide-mark 不藏「仅空格」行，便于落点输入
  quote: '> ',
  table: '| 列1 | 列2 |\n| --- | --- |\n|  |  |',
  hr: '---',
  image: '![](path/to/image.png)',
};

/**
 * @param {string} type
 * @returns {string | null}
 */
function getInsertSnippet(type) {
  if (!Object.prototype.hasOwnProperty.call(INSERT_SNIPPETS, type)) return null;
  return INSERT_SNIPPETS[type];
}

/**
 * 插入后光标相对 snippet 起点的偏移（落在可输入位置，不含尾随换行）。
 * @param {string} type
 * @param {string} snippet
 * @returns {number}
 */
function caretOffsetInSnippet(type, snippet) {
  const s = String(snippet || '');
  if (type === 'code') {
    // ```\n| \n```
    const nl = s.indexOf('\n');
    return nl >= 0 ? nl + 1 : s.length;
  }
  if (type === 'table') {
    // 落在首个空单元格「|  |」的空格处
    const cell = s.indexOf('|  |');
    return cell >= 0 ? cell + 2 : s.length;
  }
  if (type === 'ordered') {
    return 3; // "1. "
  }
  if (type === 'task') {
    return 6; // "- [ ] "
  }
  // quote / hr / mermaid / image / heading / bullet / text：snippet 末尾
  return s.length;
}

/** @type {Record<string, true>} */
const LINE_ORIENTED_INSERT_TYPES = {
  text: true,
  h1: true,
  h2: true,
  h3: true,
  h4: true,
  h5: true,
  h6: true,
  bullet: true,
  ordered: true,
  task: true,
};

/**
 * 正文 / 标题 / 列表：上/下方插入须独占新行。
 * @param {string} type
 * @returns {boolean}
 */
function isLineOrientedInsertType(type) {
  return !!LINE_ORIENTED_INSERT_TYPES[type];
}

/**
 * @param {'above' | 'below'} where
 * @param {number} lineFrom
 * @param {number} lineTo
 * @param {string} type
 * @param {string} snippet
 * @returns {{ pos: number, insert: string, caret: number }}
 */
function planLineOrientedInsert(where, lineFrom, lineTo, type, snippet) {
  const off = caretOffsetInSnippet(type, snippet);
  if (where === 'above') {
    const insert = snippet + '\n';
    return { pos: lineFrom, insert: insert, caret: lineFrom + off };
  }
  const insert = '\n' + snippet;
  return { pos: lineTo, insert: insert, caret: lineTo + 1 + off };
}

/**
 * HR 紧贴上一段非空行会被 Lezer 解析为 Setext 下划线；插入前补一空行。
 * @param {{ lineAt: (n: number) => { text: string, number: number, from: number, to: number }, sliceString?: (a: number, b: number) => string }} doc
 * @param {number} pos 插入起点
 * @returns {string}
 */
function hrLeadingNewline(doc, pos) {
  if (pos <= 0) return '';
  const line = doc.lineAt(pos);
  if (line.number < 2) return '';
  const prev = doc.line(line.number - 1);
  if (String(prev.text || '').trim() === '') return '';
  if (line.from === pos && String(line.text || '').trim() === '') {
    return '\n';
  }
  if (typeof doc.sliceString === 'function') {
    const gap = doc.sliceString(prev.to, pos);
    if (/\n\s*\n/.test(gap)) return '';
  }
  if (pos <= prev.to) return '\n';
  return '\n';
}

/**
 * @param {string} type
 * @param {string} snippet
 * @param {{ lineAt: (n: number) => { text: string, number: number } }} doc
 * @param {{ number: number }} line
 * @returns {{ insert: string, caretOffset: number }}
 */
function formatBlankLineInsert(type, snippet, doc, line) {
  let insert = snippet;
  if (type === 'hr') {
    const lead = hrLeadingNewline(doc, line.from);
    insert = lead + snippet;
    if (lead) {
      return { insert: insert, caretOffset: 0 };
    }
  }
  return {
    insert: insert,
    caretOffset: caretOffsetInSnippet(type, snippet),
  };
}

/**
 * @param {{ lineAt: Function, line: Function, sliceString?: Function }} doc
 * @param {number} pos
 * @param {string} insert
 * @param {string} snippet
 * @returns {{ insert: string, caret: number }}
 */
function planHrInsertCaret(doc, pos, insert, snippet) {
  const lead = hrLeadingNewline(doc, pos);
  let next = insert;
  if (lead && !next.startsWith(lead)) {
    next = lead + next;
    return { insert: next, caret: pos };
  }
  const snippetStart = pos + next.indexOf(snippet);
  return {
    insert: next,
    caret: snippetStart + caretOffsetInSnippet('hr', snippet),
  };
}

module.exports = {
  INSERT_SNIPPETS: INSERT_SNIPPETS,
  getInsertSnippet: getInsertSnippet,
  caretOffsetInSnippet: caretOffsetInSnippet,
  isLineOrientedInsertType: isLineOrientedInsertType,
  planLineOrientedInsert: planLineOrientedInsert,
  hrLeadingNewline: hrLeadingNewline,
  formatBlankLineInsert: formatBlankLineInsert,
  planHrInsertCaret: planHrInsertCaret,
};

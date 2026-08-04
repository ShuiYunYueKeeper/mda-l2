/**
 * 块手柄菜单：上/下方插入的 Markdown 片段模板。
 */
'use strict';

/** @type {Record<string, string>} */
const INSERT_SNIPPETS = {
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
  return Object.prototype.hasOwnProperty.call(INSERT_SNIPPETS, type)
    ? INSERT_SNIPPETS[type]
    : null;
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
  // quote / hr / mermaid / image：snippet 末尾
  return s.length;
}

module.exports = {
  INSERT_SNIPPETS: INSERT_SNIPPETS,
  getInsertSnippet: getInsertSnippet,
  caretOffsetInSnippet: caretOffsetInSnippet,
};

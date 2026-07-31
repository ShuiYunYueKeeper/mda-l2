/**
 * 块手柄菜单：上/下方插入的 Markdown 片段模板。
 */
'use strict';

/** @type {Record<string, string>} */
const INSERT_SNIPPETS = {
  code: '```\n\n```',
  mermaid: '```mermaid\ngraph TD\n  A-->B\n```',
  quote: '> ',
  highlight: '> [!NOTE]\n> ',
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

module.exports = {
  INSERT_SNIPPETS: INSERT_SNIPPETS,
  getInsertSnippet: getInsertSnippet,
};

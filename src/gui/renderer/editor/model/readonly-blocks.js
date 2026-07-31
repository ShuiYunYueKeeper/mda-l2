/**
 * S18–S21：只读块区间（纯函数）。
 */
'use strict';

/**
 * @param {string} text
 * @returns {{ from: number, to: number, label: string } | null}
 */
function detectFrontMatter(text) {
  const raw = String(text || '');
  if (!raw.startsWith('---')) return null;
  const norm = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = norm.split('\n');
  if (lines[0].trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      let end = 0;
      for (let j = 0; j <= i; j++) {
        end += lines[j].length;
        if (j < i) end += 1;
      }
      return { from: 0, to: Math.min(end, raw.length), label: 'frontMatter' };
    }
  }
  return null;
}

/**
 * @param {string} text
 * @param {{ from: number, to: number, type: string }[]} nodes
 * @returns {{ from: number, to: number, label: string }[]}
 */
function collectReadonlyRanges(text, nodes) {
  const out = [];
  const fm = detectFrontMatter(text);
  if (fm) out.push(fm);
  // S19–S21：后续按语法树 P 类节点扩展；C1 先覆盖 front matter
  return out;
}

module.exports = {
  detectFrontMatter: detectFrontMatter,
  collectReadonlyRanges: collectReadonlyRanges,
};

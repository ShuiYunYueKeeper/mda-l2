/**
 * 围栏代码块切片解析
 */
'use strict';

/**
 * @param {string} slice
 * @returns {{ lang: string, code: string } | null}
 */
function parseFencedCode(slice) {
  const text = String(slice || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const m = /^( {0,3})(`{3,}|~{3,})([^\n`]*)\n([\s\S]*?)\n {0,3}\2\s*$/.exec(text);
  if (!m) {
    // 允许末尾无换行闭合
    const m2 = /^( {0,3})(`{3,}|~{3,})([^\n`]*)\n([\s\S]*?)\n? {0,3}\2\s*$/.exec(text);
    if (!m2) return null;
    return {
      lang: String(m2[3] || '').trim().split(/\s+/)[0] || '',
      code: m2[4] || '',
    };
  }
  return {
    lang: String(m[3] || '').trim().split(/\s+/)[0] || '',
    code: m[4] || '',
  };
}

module.exports = {
  parseFencedCode: parseFencedCode,
};

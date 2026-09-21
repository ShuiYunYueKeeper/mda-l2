/**
 * doc-coords — 编辑器文档坐标 ↔ 磁盘坐标
 *
 * 回归的是一个跨端缺陷：CM6 文档统一 LF/无 BOM，anchor 却要按磁盘原文计偏移。
 * CRLF 文件上每过一个换行差 1，导致 CLI 写的选区批注在 GUI 里「锚点失效」，
 * 反之 GUI 写的 anchor 在 CLI scan 里对不上原文。
 */
// @ts-nocheck
const coords = require('../../src/gui/renderer/doc-coords.js');

const DOC = '# 标题\n\n正文一行\n第二行结束\n';
const DISK_CRLF = DOC.replace(/\n/g, '\r\n');
const DISK_CRLF_BOM = '\uFEFF' + DISK_CRLF;

describe('detectDocCoords', () => {
  test('LF 无 BOM', () => {
    expect(coords.detectDocCoords(DOC)).toEqual({ bomLen: 0, eol: '\n' });
  });

  test('CRLF', () => {
    expect(coords.detectDocCoords(DISK_CRLF)).toEqual({ bomLen: 0, eol: '\r\n' });
  });

  test('CRLF + BOM', () => {
    expect(coords.detectDocCoords(DISK_CRLF_BOM)).toEqual({ bomLen: 1, eol: '\r\n' });
  });

  test('空文本按 LF 处理', () => {
    expect(coords.detectDocCoords('')).toEqual({ bomLen: 0, eol: '\n' });
  });
});

describe('docTextToDisk', () => {
  test('还原 CRLF 与 BOM', () => {
    const c = coords.detectDocCoords(DISK_CRLF_BOM);
    expect(coords.docTextToDisk(DOC, c)).toBe(DISK_CRLF_BOM);
  });

  test('LF 文档原样返回', () => {
    expect(coords.docTextToDisk(DOC, { bomLen: 0, eol: '\n' })).toBe(DOC);
  });
});

describe('偏移换算与磁盘文本一致', () => {
  const cases: Array<[string, string]> = [
    ['LF', DOC],
    ['CRLF', DISK_CRLF],
    ['CRLF+BOM', DISK_CRLF_BOM],
  ];

  test.each(cases)('%s：每个文档偏移都指向磁盘同一字符', (_name, disk) => {
    const c = coords.detectDocCoords(disk);
    for (let i = 0; i < DOC.length; i++) {
      const d = coords.docToDisk(DOC, i, c);
      // 换行字符在 CRLF 下对应 '\r'，其余字符应逐一对应
      const expected = DOC.charAt(i) === '\n' && c.eol === '\r\n' ? '\r' : DOC.charAt(i);
      expect(disk.charAt(d)).toBe(expected);
    }
  });

  test.each(cases)('%s：diskToDoc 是 docToDisk 的逆', (_name, disk) => {
    const c = coords.detectDocCoords(disk);
    for (let i = 0; i <= DOC.length; i++) {
      expect(coords.diskToDoc(DOC, coords.docToDisk(DOC, i, c), c)).toBe(i);
    }
  });

  test('越界偏移被钳制', () => {
    const c = coords.detectDocCoords(DISK_CRLF);
    expect(coords.docToDisk(DOC, -5, c)).toBe(0);
    expect(coords.docToDisk(DOC, 9999, c)).toBe(DISK_CRLF.length);
    expect(coords.diskToDoc(DOC, -5, c)).toBe(0);
    expect(coords.diskToDoc(DOC, 9999, c)).toBe(DOC.length);
  });
});

describe('anchor 换算', () => {
  test('CRLF：文档 anchor 转磁盘后能在磁盘文本上取回同一段文字', () => {
    const c = coords.detectDocCoords(DISK_CRLF);
    const start = DOC.indexOf('正文一行');
    const docAnchor = { start, end: start + 4, quote: '正文一行' };
    const disk = coords.anchorDocToDisk(DOC, docAnchor, c);
    expect(DISK_CRLF.slice(disk.start, disk.end)).toBe('正文一行');
  });

  test('CRLF+BOM：磁盘 anchor 转文档后能在文档文本上取回同一段文字', () => {
    const c = coords.detectDocCoords(DISK_CRLF_BOM);
    const start = DISK_CRLF_BOM.indexOf('第二行结束');
    const diskAnchor = { start, end: start + 5, quote: '第二行结束' };
    const doc = coords.anchorDiskToDoc(DOC, diskAnchor, c);
    expect(DOC.slice(doc.start, doc.end)).toBe('第二行结束');
  });

  test('跨行 quote 的换行随坐标系转换', () => {
    const c = coords.detectDocCoords(DISK_CRLF);
    const start = DOC.indexOf('正文一行');
    const docAnchor = { start, end: start + 10, quote: '正文一行\n第二行结束' };
    const disk = coords.anchorDocToDisk(DOC, docAnchor, c);
    expect(disk.quote).toBe('正文一行\r\n第二行结束');
    expect(DISK_CRLF.slice(disk.start, disk.end)).toBe(disk.quote);
    expect(coords.anchorDiskToDoc(DOC, disk, c)).toEqual(docAnchor);
  });

  test('null anchor 原样返回', () => {
    expect(coords.anchorDocToDisk(DOC, null, { bomLen: 0, eol: '\n' })).toBeNull();
    expect(coords.anchorDiskToDoc(DOC, null, { bomLen: 0, eol: '\n' })).toBeNull();
  });
});

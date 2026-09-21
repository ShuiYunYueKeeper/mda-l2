// 编辑器文档坐标 ↔ 磁盘坐标。
//
// CM6 的文档模型统一用 LF 且不含 BOM，而选区批注的 anchor 要写进 Markdown 文件、
// 与 CLI / MCP 共享，只能按磁盘原文计 UTF-16 偏移。两套坐标在 Windows 的 CRLF
// 文件上每经过一个换行就差 1：GUI 写出的 anchor 在 CLI 里前移、CLI 写入的 anchor
// 在 GUI 里落空（面板显示「锚点失效」）。本模块是两者之间唯一的换算入口。
(function (global) {
  var BOM = '\uFEFF';

  /** 从磁盘原文推断坐标系：是否带 BOM、用哪种换行 */
  function detectDocCoords(diskText) {
    var text = typeof diskText === 'string' ? diskText : '';
    return {
      bomLen: text.charAt(0) === BOM ? 1 : 0,
      eol: text.indexOf('\r\n') >= 0 ? '\r\n' : '\n',
    };
  }

  function normalizeCoords(coords) {
    if (!coords) return { bomLen: 0, eol: '\n' };
    return {
      bomLen: coords.bomLen ? 1 : 0,
      eol: coords.eol === '\r\n' ? '\r\n' : '\n',
    };
  }

  /** 文档文本（LF、无 BOM）还原成磁盘形态，供 anchor 校验与行号换算使用 */
  function docTextToDisk(docText, coords) {
    var c = normalizeCoords(coords);
    var text = typeof docText === 'string' ? docText : '';
    var body = c.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
    return c.bomLen ? BOM + body : body;
  }

  /** 文档偏移 → 磁盘偏移 */
  function docToDisk(docText, offset, coords) {
    var c = normalizeCoords(coords);
    var text = typeof docText === 'string' ? docText : '';
    var n = Math.max(0, Math.min(offset | 0, text.length));
    if (c.eol === '\n') return n + c.bomLen;
    var lf = 0;
    for (var i = 0; i < n; i++) {
      if (text.charCodeAt(i) === 10) lf++;
    }
    return n + c.bomLen + lf;
  }

  /**
   * 磁盘偏移 → 文档偏移。
   * 落在 CRLF 的 CR 上时归到该换行的**行首**侧（即 LF 之前），与 docToDisk 互逆。
   */
  function diskToDoc(docText, offset, coords) {
    var c = normalizeCoords(coords);
    var text = typeof docText === 'string' ? docText : '';
    var target = (offset | 0) - c.bomLen;
    if (target <= 0) return 0;
    if (c.eol === '\n') return Math.min(target, text.length);
    var disk = 0;
    for (var i = 0; i < text.length; i++) {
      if (disk >= target) return i;
      disk += text.charCodeAt(i) === 10 ? 2 : 1;
    }
    return text.length;
  }

  /** anchor 整体换算；quote 跨行时其中的换行同样要跟着坐标系走 */
  function anchorDocToDisk(docText, anchor, coords) {
    if (!anchor) return anchor;
    var c = normalizeCoords(coords);
    var out = {
      start: docToDisk(docText, anchor.start, c),
      end: docToDisk(docText, anchor.end, c),
    };
    if (typeof anchor.quote === 'string') {
      out.quote = c.eol === '\r\n' ? anchor.quote.replace(/\n/g, '\r\n') : anchor.quote;
    }
    return out;
  }

  function anchorDiskToDoc(docText, anchor, coords) {
    if (!anchor) return anchor;
    var c = normalizeCoords(coords);
    var out = {
      start: diskToDoc(docText, anchor.start, c),
      end: diskToDoc(docText, anchor.end, c),
    };
    if (typeof anchor.quote === 'string') {
      out.quote = anchor.quote.replace(/\r\n/g, '\n');
    }
    return out;
  }

  var api = {
    detectDocCoords: detectDocCoords,
    docTextToDisk: docTextToDisk,
    docToDisk: docToDisk,
    diskToDoc: diskToDoc,
    anchorDocToDisk: anchorDocToDisk,
    anchorDiskToDoc: anchorDiskToDoc,
  };

  global.MDADocCoords = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

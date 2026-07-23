// KaTeX 复制预览导出的纯函数；浏览器栅格化仍由 app.js 负责。
(function (global) {
  'use strict';

  function positiveNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function escapeStyleClose(css) {
    return String(css || '').replace(/<\/style/gi, '<\\/style');
  }

  function preferWoff2Sources(css) {
    return String(css || '').replace(
      /src:(url\([^)]+\.woff2\)\s*format\(["']woff2["']\))[^}]+(?=})/gi,
      'src:$1',
    );
  }

  function formulaPadding(isBlock) {
    return isBlock ? { x: 16, y: 12 } : { x: 4, y: 4 };
  }

  function svgToDataUrl(svg) {
    var utf8 = encodeURIComponent(String(svg || '')).replace(/%([0-9A-F]{2})/g, function (_match, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
    return 'data:image/svg+xml;base64,' + btoa(utf8);
  }

  function buildSvgPayload(options) {
    var opts = options || {};
    var logicalWidth = Math.max(1, Math.ceil(positiveNumber(opts.width, 1)));
    var logicalHeight = Math.max(1, Math.ceil(positiveNumber(opts.height, 1)));
    var scale = Math.max(1, Math.min(4, positiveNumber(opts.scale, 2)));
    var pixelWidth = Math.max(1, Math.ceil(logicalWidth * scale));
    var pixelHeight = Math.max(1, Math.ceil(logicalHeight * scale));
    var padX = Math.max(0, Math.ceil(positiveNumber(opts.padX, 10)));
    var padY = Math.max(0, Math.ceil(positiveNumber(opts.padY, 8)));
    var css = escapeStyleClose(opts.css);
    var html = String(opts.html || '');
    var offsetX = Number(opts.offsetX) || 0;
    var offsetY = Number(opts.offsetY) || 0;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + pixelWidth
      + '" height="' + pixelHeight + '" viewBox="0 0 ' + logicalWidth + ' ' + logicalHeight + '">'
      + '<foreignObject x="0" y="0" width="' + logicalWidth + '" height="' + logicalHeight + '">'
      + '<div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;margin:0;padding:'
      + padY + 'px ' + padX + 'px;width:' + logicalWidth + 'px;height:' + logicalHeight
      + 'px;background:#ffffff;color:#222222;display:flex;align-items:center;justify-content:center;'
      + 'line-height:1.2;overflow:visible;">'
      + '<style type="text/css">' + css + '</style>'
      + '<div style="display:inline-block;max-width:none;max-height:none;white-space:nowrap;text-align:center;transform:translate('
      + offsetX + 'px,' + offsetY + 'px);">'
      + html + '</div>'
      + '</div></foreignObject></svg>';

    return {
      svg: svg,
      logicalWidth: logicalWidth,
      logicalHeight: logicalHeight,
      pixelWidth: pixelWidth,
      pixelHeight: pixelHeight,
      scale: scale,
    };
  }

  var api = {
    escapeStyleClose: escapeStyleClose,
    preferWoff2Sources: preferWoff2Sources,
    formulaPadding: formulaPadding,
    svgToDataUrl: svgToDataUrl,
    buildSvgPayload: buildSvgPayload,
  };

  global.MDAKatexExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

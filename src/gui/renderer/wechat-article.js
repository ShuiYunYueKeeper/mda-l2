// 公众号剪贴板 HTML 的纯函数后处理。
// 微信编辑器会丢掉 <a> 上的 color，必须把颜色写进内部 <span>。
// 内容图位图固定 1080 宽：更宽会被微信再压糊，只写 width:100% 又会按栏宽重绘。
// 显示仍用 width:100%，width 属性与 data-w 写位图像素。公式图保持逻辑宽度。
(function (global) {
  'use strict';

  var LINK_COLOR = '#0969da';
  var LINK_STYLE = 'color:' + LINK_COLOR + ';text-decoration:none;';
  // 宽于 1080 时微信会再压到 1080 并明显损失画质；窄于 1080 铺满正文又不够像素。导出统一成这个宽度。
  var IMAGE_EXPORT_WIDTH = 1080;
  var IMAGE_MAX_PIXELS = 6000000;
  var CONTENT_IMAGE_STYLE = 'width:100%;max-width:100%;height:auto;display:block;margin:12px auto;';

  function trimUrl(raw) {
    var url = String(raw || '');
    while (url) {
      var last = url.charAt(url.length - 1);
      if ('.,!?，。、）)]》」』'.indexOf(last) >= 0) {
        url = url.slice(0, -1);
        continue;
      }
      // 句末分号可以剥；HTML 实体结尾的分号不能剥（文本里的 &amp;）
      if (last === ';' && !/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+)$/i.test(url)) {
        url = url.slice(0, -1);
        continue;
      }
      if (last === ':' && !/^https?:$/i.test(url)) {
        url = url.slice(0, -1);
        continue;
      }
      break;
    }
    return url;
  }

  function stashBlocks(html, bucket) {
    return html.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, function (block) {
      bucket.push(block);
      return '\u0000MDA' + (bucket.length - 1) + '\u0000';
    }).replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, function (block) {
      bucket.push(block);
      return '\u0000MDA' + (bucket.length - 1) + '\u0000';
    });
  }

  function restoreBlocks(html, bucket) {
    return html.replace(/\u0000MDA(\d+)\u0000/g, function (_m, index) {
      return bucket[Number(index)] || '';
    });
  }

  function styleHasColor(style) {
    return /(?:^|;)\s*color\s*:/i.test(String(style || ''));
  }

  function ensureLinkStyle(style) {
    var next = String(style || '').trim();
    if (!styleHasColor(next)) {
      next = next ? (next.replace(/;?\s*$/, '') + ';' + LINK_STYLE) : LINK_STYLE;
    } else if (!/text-decoration\s*:/i.test(next)) {
      next = next.replace(/;?\s*$/, '') + ';text-decoration:none;';
    }
    return next;
  }

  function parseAttrs(source) {
    var attrs = {};
    var order = [];
    var re = /([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g;
    var match;
    while ((match = re.exec(source))) {
      var key = match[1];
      var value = match[2] != null ? match[2] : (match[3] != null ? match[3] : (match[4] != null ? match[4] : ''));
      if (!Object.prototype.hasOwnProperty.call(attrs, key)) order.push(key);
      attrs[key] = value;
    }
    return { attrs: attrs, order: order };
  }

  function serializeAttrs(parsed) {
    var parts = [];
    for (var i = 0; i < parsed.order.length; i++) {
      var key = parsed.order[i];
      var value = parsed.attrs[key];
      parts.push(key + '="' + String(value).replace(/"/g, '&quot;') + '"');
    }
    return parts.length ? ' ' + parts.join(' ') : '';
  }

  function hardenAnchor(attrs, inner) {
    var parsed = parseAttrs(attrs);
    parsed.attrs.style = ensureLinkStyle(parsed.attrs.style || '');
    if (parsed.order.indexOf('style') < 0) parsed.order.push('style');
    var body = String(inner || '');
    var already = /^\s*<span\b[^>]*style\s*=\s*(['"])([\s\S]*?)\1[^>]*>[\s\S]*<\/span>\s*$/i.exec(body);
    if (!(already && styleHasColor(already[2]))) {
      body = '<span style="' + LINK_STYLE + '">' + body + '</span>';
    }
    return '<a' + serializeAttrs(parsed) + '>' + body + '</a>';
  }

  function linkifyTextSegments(html) {
    return String(html || '').split(/(<[^>]+>)/g).map(function (part) {
      if (!part || part.charAt(0) === '<') return part;
      return part.replace(/https?:\/\/[^\s<>"']+/gi, function (raw) {
        var url = trimUrl(raw);
        if (!/^https?:\/\//i.test(url)) return raw;
        var rest = raw.slice(url.length);
        return '<a href="' + url + '" style="' + LINK_STYLE + '"><span style="' + LINK_STYLE + '">'
          + url + '</span></a>' + rest;
      });
    }).join('');
  }

  function planWechatBitmapSize(naturalWidth, naturalHeight) {
    var nw = Math.round(Number(naturalWidth) || 0);
    var nh = Math.round(Number(naturalHeight) || 0);
    if (!(nw > 0) || !(nh > 0)) return null;
    var tw = IMAGE_EXPORT_WIDTH;
    var th = Math.max(1, Math.round(nh * tw / nw));
    if (tw * th > IMAGE_MAX_PIXELS) {
      var scale = Math.sqrt(IMAGE_MAX_PIXELS / (tw * th));
      tw = Math.max(1, Math.floor(tw * scale));
      th = Math.max(1, Math.round(nh * tw / nw));
    }
    return { width: tw, height: th };
  }

  function svgIntrinsicSize(svgText) {
    var text = String(svgText || '');
    var viewBox = /viewBox\s*=\s*["']([^"']+)["']/i.exec(text);
    if (viewBox) {
      var parts = viewBox[1].trim().split(/[\s,]+/);
      var vw = parseFloat(parts[2]);
      var vh = parseFloat(parts[3]);
      if (vw > 0 && vh > 0) return { width: vw, height: vh };
    }
    var widthAttr = /\swidth\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/i.exec(text);
    var heightAttr = /\sheight\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/i.exec(text);
    if (widthAttr && heightAttr) {
      var w = parseFloat(widthAttr[1]);
      var h = parseFloat(heightAttr[1]);
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    return null;
  }

  /** 把 width/height="100%" 改成目标像素，浏览器才会按这个尺寸做矢量栅格化，而不是先画很小再放大。 */
  function prepareSvgMarkupForRaster(svgText, width, height) {
    var w = Math.max(1, Math.round(Number(width) || 0));
    var h = Math.max(1, Math.round(Number(height) || 0));
    return String(svgText || '').replace(/<svg\b([^>]*)>/i, function (_match, attrs) {
      var next = String(attrs)
        .replace(/\swidth\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\sheight\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      return '<svg' + next + ' width="' + w + '" height="' + h + '">';
    });
  }

  function decodeSvgDataUrl(src) {
    var match = /^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(String(src || ''));
    if (!match) return '';
    var payload = match[2] || '';
    try {
      if (match[1]) {
        var binary = atob(payload);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 255;
        if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
        return decodeURIComponent(escape(binary));
      }
      return decodeURIComponent(payload);
    } catch (e) {
      return '';
    }
  }

  function isFormulaImageClass(className) {
    return /(?:^|\s)mda-formula-(?:img|table-img)(?:\s|$)/.test(String(className || ''));
  }

  function adaptImgTag(attrsSource) {
    var parsed = parseAttrs(String(attrsSource || '').replace(/\/\s*$/, ''));
    var pixelW = parseInt(parsed.attrs['data-mda-pixel-width'] || '', 10);
    var pixelH = parseInt(parsed.attrs['data-mda-pixel-height'] || '', 10);
    var formula = isFormulaImageClass(parsed.attrs.class || '');
    ['width', 'height', 'data-mda-pixel-width', 'data-mda-pixel-height', 'data-mda-display-width'].forEach(function (key) {
      var at = parsed.order.indexOf(key);
      if (at >= 0) parsed.order.splice(at, 1);
      delete parsed.attrs[key];
    });
    if (!formula) {
      parsed.attrs.style = CONTENT_IMAGE_STYLE;
      if (parsed.order.indexOf('style') < 0) parsed.order.push('style');
    }
    if (pixelW > 0) {
      parsed.attrs['data-w'] = String(pixelW);
      if (parsed.order.indexOf('data-w') < 0) parsed.order.push('data-w');
      if (pixelH > 0) {
        parsed.attrs['data-ratio'] = String(Math.round((pixelH / pixelW) * 1000000) / 1000000);
        if (parsed.order.indexOf('data-ratio') < 0) parsed.order.push('data-ratio');
      }
      // 宽度属性用位图像素。只写 width:100% 时，微信会按栏宽（约 600px）重绘上传。
      if (!formula) {
        parsed.attrs.width = String(pixelW);
        if (parsed.order.indexOf('width') < 0) parsed.order.push('width');
        if (pixelH > 0) {
          parsed.attrs.height = String(pixelH);
          if (parsed.order.indexOf('height') < 0) parsed.order.push('height');
        }
      }
    }
    return '<img' + serializeAttrs(parsed) + '>';
  }

  function stashAnchors(html, bucket) {
    return html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, function (block) {
      bucket.push(block);
      return '\u0000MDA' + (bucket.length - 1) + '\u0000';
    });
  }

  function adaptWechatArticleHtml(html) {
    var bucket = [];
    var source = stashBlocks(String(html || ''), bucket);
    // 先藏起已有链接，避免裸 URL 识别把链接文字再包一层
    source = stashAnchors(source, bucket);
    source = linkifyTextSegments(source);
    source = restoreBlocks(source, bucket);
    source = source.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, function (_match, attrs, inner) {
      return hardenAnchor(attrs, inner);
    });
    source = source.replace(/<img\b([^>]*?)\/?>/gi, function (_match, attrs) {
      return adaptImgTag(attrs);
    });
    return source;
  }

  var api = {
    LINK_COLOR: LINK_COLOR,
    LINK_STYLE: LINK_STYLE,
    IMAGE_EXPORT_WIDTH: IMAGE_EXPORT_WIDTH,
    IMAGE_MAX_PIXELS: IMAGE_MAX_PIXELS,
    CONTENT_IMAGE_STYLE: CONTENT_IMAGE_STYLE,
    planWechatBitmapSize: planWechatBitmapSize,
    svgIntrinsicSize: svgIntrinsicSize,
    prepareSvgMarkupForRaster: prepareSvgMarkupForRaster,
    decodeSvgDataUrl: decodeSvgDataUrl,
    trimUrl: trimUrl,
    adaptWechatArticleHtml: adaptWechatArticleHtml,
  };

  global.MDAWechatArticle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

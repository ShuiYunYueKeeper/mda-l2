// 长图全屏预览的排版。
//
// 缩放遮罩对普通图用 max-height:50vh 把整张塞进视口。长截图（例如 715×15594）
// 会被压成十几像素宽，文字糊成一团。再叠加 transform:scale，放大的仍是这张
// 已经缩过的位图。另外 Chromium 对单边超过纹理上限（常见 8192/16384）的 <img>
// 会先降采样再上屏，所以超高图必须切成 canvas 分片，drawImage 取原像素。
(function (global) {
  /** 单片最大边。留在常见 GPU 纹理上限之下，避免整片再次被降采样。 */
  var TILE = 4096;
  var TALL_ASPECT = 2;
  var TALL_SCREENS = 1.5;
  /** 宽于视口时才缩小，且两侧留一点边。 */
  var VIEW_WIDTH_RATIO = 0.92;

  function isLongBitmap(nw, nh, viewportH) {
    if (!(nw > 0) || !(nh > 0) || !(viewportH > 0)) return false;
    var tall = nh / nw >= TALL_ASPECT && nh >= viewportH * TALL_SCREENS;
    var overTexture = Math.max(nw, nh) > TILE && nh >= nw;
    return tall || overTexture;
  }

  function planTiles(nw, nh) {
    var tiles = [];
    if (Math.max(nw, nh) <= TILE) {
      tiles.push({ sy: 0, sh: nh, sw: nw });
      return tiles;
    }
    var y = 0;
    while (y < nh) {
      var sh = Math.min(TILE, nh - y);
      tiles.push({ sy: y, sh: sh, sw: nw });
      y += sh;
    }
    return tiles;
  }

  /**
   * 长图全屏布局。普通图返回 null，调用方继续走原来的视口内适配。
   * scale 是用户倍率（1 = 初始）。初始尽量 1 个设备像素对 1 个图像像素。
   */
  function planLongImageLayout(opts) {
    opts = opts || {};
    var nw = +opts.nw || 0;
    var nh = +opts.nh || 0;
    var vw = +opts.viewportW || 0;
    var vh = +opts.viewportH || 0;
    var dpr = +opts.dpr > 0 ? +opts.dpr : 1;
    var scale = opts.scale == null ? 1 : +opts.scale;
    if (!isLongBitmap(nw, nh, vh) || !(vw > 0)) return null;
    if (!(scale > 0)) scale = 1;

    var oneToOne = 1 / dpr;
    var fitWidth = (vw * VIEW_WIDTH_RATIO) / nw;
    var display = Math.min(oneToOne, fitWidth) * scale;

    var tiles = planTiles(nw, nh);
    var cssW = Math.max(1, Math.round(nw * display));
    var cssHeights = [];
    var acc = 0;
    var prev = 0;
    for (var i = 0; i < tiles.length; i++) {
      acc += tiles[i].sh;
      var boundary = Math.round(acc * display);
      cssHeights.push(Math.max(0, boundary - prev));
      prev = boundary;
    }
    var cssH = prev;
    var contentW = cssW;
    var contentH = cssH;
    var overflowX = Math.max(0, contentW - vw);
    var overflowY = Math.max(0, contentH - vh);

    return {
      useTiles: Math.max(nw, nh) > TILE,
      displayScale: display,
      contentW: contentW,
      contentH: contentH,
      cssW: cssW,
      cssHeights: cssHeights,
      tiles: tiles,
      // 小图仍把中心留在视口内；长图允许走到首尾，但内容不会完全离开视口。
      maxX: Math.max(vw / 2, overflowX / 2),
      maxY: Math.max(vh / 2, overflowY / 2),
      initialTx: 0,
      initialTy: overflowY > 0 ? overflowY / 2 : 0,
    };
  }

  /** 舞台用 flex 居中，tx/ty 是相对中心的偏移。缩放后保持视口中心对着同一图像位置。 */
  function remapCenteredOffset(offset, oldSize, newSize) {
    if (!(oldSize > 0) || !(newSize > 0)) return offset;
    var point = oldSize / 2 - offset;
    var fraction = point / oldSize;
    return newSize / 2 - fraction * newSize;
  }

  var api = {
    TILE: TILE,
    isLongBitmap: isLongBitmap,
    planLongImageLayout: planLongImageLayout,
    remapCenteredOffset: remapCenteredOffset,
  };

  global.MDAZoomImage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

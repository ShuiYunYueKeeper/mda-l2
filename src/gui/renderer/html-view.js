// HTML 文档只读渲染视图
// 用 sandbox iframe（allow-same-origin、不授权 allow-scripts）直接加载 file:// 文档：
// - 保留文档自带的 <style>/<link> 与相对路径图片，等价浏览器观感；
// - 脚本被 sandbox 禁用，父子同源仅用于拦截点击、不向文档注入任何能力。
(function () {
  'use strict';

  function toFileUrl(filePath) {
    var p = String(filePath || '').replace(/\\/g, '/');
    if (p.charAt(0) !== '/') p = '/' + p;
    // encodeURI 不转义 # / ?，路径里出现会被当成 URL 片段；逐字符补掉。
    return 'file://' + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');
  }

  function mount(parent) {
    if (!parent) return null;
    var host = document.createElement('div');
    host.id = 'html-doc-view';
    host.className = 'hidden';

    var frame = document.createElement('iframe');
    frame.id = 'html-doc-frame';
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', 'HTML');
    host.appendChild(frame);
    parent.appendChild(host);

    var linkHandler = null;
    var currentUrl = '';

    frame.addEventListener('load', function () {
      var doc = null;
      try {
        doc = frame.contentDocument;
      } catch (_) {
        doc = null; // 理论上同源可访问；异常时退化为纯展示，不阻断阅读
      }
      if (!doc) return;
      doc.addEventListener(
        'click',
        function (ev) {
          var node = ev.target;
          while (node && node.nodeType === 1 && node !== doc.documentElement) {
            if (String(node.tagName).toLowerCase() === 'a') break;
            node = node.parentNode;
          }
          if (!node || node.nodeType !== 1) return;
          var href = node.getAttribute('href') || '';
          if (!href || href.charAt(0) === '#') return; // 页内锚点交给文档自身
          ev.preventDefault();
          if (linkHandler) linkHandler(href);
        },
        true
      );
      // 中键不新开窗口（沙箱内也无从新开），避免产生无法关闭的空白页
      doc.addEventListener(
        'auxclick',
        function (ev) {
          if (ev.button === 1) ev.preventDefault();
        },
        true
      );
    });

    return {
      show: function (filePath) {
        var url = toFileUrl(filePath);
        host.classList.remove('hidden');
        if (url === currentUrl) {
          try {
            frame.contentWindow.location.reload();
          } catch (_) {
            frame.src = url;
          }
          return;
        }
        currentUrl = url;
        frame.src = url;
      },
      hide: function () {
        host.classList.add('hidden');
        if (!currentUrl) return;
        currentUrl = '';
        frame.src = 'about:blank';
      },
      isVisible: function () {
        return !host.classList.contains('hidden');
      },
      setLinkHandler: function (fn) {
        linkHandler = typeof fn === 'function' ? fn : null;
      },
      getFrame: function () {
        return frame;
      },
      getHost: function () {
        return host;
      },
    };
  }

  window.MDAHtmlView = {
    mount: mount,
    toFileUrl: toFileUrl,
  };
})();

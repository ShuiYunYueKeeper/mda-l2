// 文档大纲（TOC）面板 — 预览区左侧，可收起；滚动预览时同步高亮当前标题
(function (global) {
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function flattenHeadings(nodes, out) {
    out = out || [];
    if (!nodes) return out;
    for (var i = 0; i < nodes.length; i++) {
      out.push(nodes[i]);
      if (nodes[i].children && nodes[i].children.length) {
        flattenHeadings(nodes[i].children, out);
      }
    }
    return out;
  }

  function renderNodes(nodes, depth) {
    depth = depth || 0;
    if (!nodes || !nodes.length) return '';
    var html = '<ul class="mda-outline-list">';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      html +=
        '<li class="mda-outline-item" style="padding-left:' + (depth * 12) + 'px">' +
          '<button type="button" class="mda-outline-link" data-line="' + n.line + '">' +
            escHtml(n.title) +
          '</button>';
      if (n.children && n.children.length) html += renderNodes(n.children, depth + 1);
      html += '</li>';
    }
    html += '</ul>';
    return html;
  }

  function mount(container, onJump, opts) {
    opts = opts || {};
    var onCollapsedChange = opts.onCollapsedChange;

    function tr(key) {
      return (global.MDAI18n && global.MDAI18n.t) ? global.MDAI18n.t(key) : key;
    }

    container.innerHTML =
      '<div class="mda-outline-panel">' +
        '<div class="mda-outline-head">' +
          '<span class="mda-outline-title"></span>' +
          '<button type="button" id="outline-collapse" class="mda-outline-toggle" title="">‹</button>' +
        '</div>' +
        '<div id="outline-body" class="mda-outline-body"></div>' +
      '</div>';

    var body = container.querySelector('#outline-body');
    var collapseBtn = container.querySelector('#outline-collapse');
    var titleEl = container.querySelector('.mda-outline-title');
    var collapsed = false;
    var flatHeadings = [];
    var activeLine = null;

    function readCollapsedPref() {
      try { return localStorage.getItem('mda-outline-collapsed') === '1'; } catch (e) { return false; }
    }

    function applyLang() {
      if (titleEl) titleEl.textContent = tr('outlineTitle');
      if (collapseBtn) collapseBtn.title = tr('outlineCollapse');
    }

    function setCollapsed(val, skipNotify) {
      collapsed = !!val;
      container.classList.toggle('collapsed', collapsed);
      try { localStorage.setItem('mda-outline-collapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
      applyLang();
      if (!skipNotify && onCollapsedChange) onCollapsedChange(collapsed);
    }

    function setActiveLine(line, opts2) {
      opts2 = opts2 || {};
      if (line == null || isNaN(line)) return;
      if (!opts2.force && activeLine === line) return;
      activeLine = line;
      var links = body.querySelectorAll('.mda-outline-link');
      for (var i = 0; i < links.length; i++) {
        var ln = parseInt(links[i].getAttribute('data-line'), 10);
        var on = ln === line;
        links[i].classList.toggle('active', on);
        if (on && !opts2.skipScroll) {
          var lr = links[i].getBoundingClientRect();
          var br = body.getBoundingClientRect();
          if (lr.top < br.top + 4 || lr.bottom > br.bottom - 4) {
            links[i].scrollIntoView({ block: 'nearest' });
          }
        }
      }
    }

    applyLang();
    setCollapsed(readCollapsedPref(), true);

    collapseBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setCollapsed(true);
    });

    body.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-line]');
      if (!btn) return;
      var line = parseInt(btn.getAttribute('data-line'), 10);
      if (isNaN(line) || !onJump) return;
      e.preventDefault();
      e.stopPropagation();
      setActiveLine(line, { force: true, skipScroll: true });
      onJump(line);
    });

    function setHeadings(roots) {
      flatHeadings = flattenHeadings(roots, []);
      activeLine = null;
      if (!roots || !roots.length) {
        body.innerHTML = '<div class="mda-outline-empty">' + tr('outlineEmpty') + '</div>';
        return;
      }
      body.innerHTML = renderNodes(roots, 0);
    }

    return {
      setHeadings: setHeadings,
      applyLang: applyLang,
      isCollapsed: function () { return collapsed; },
      setCollapsed: setCollapsed,
      toggleCollapsed: function () { setCollapsed(!collapsed); },
      getFlatHeadings: function () { return flatHeadings.slice(); },
      setActiveLine: setActiveLine,
    };
  }

  global.MDAOutlinePanel = { mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = { mount: mount };
})(typeof window !== 'undefined' ? window : global);

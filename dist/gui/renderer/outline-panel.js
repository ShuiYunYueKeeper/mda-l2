// 文档大纲（TOC）面板 — 预览区左侧，可收起；支持子标题折叠；滚动预览时同步高亮当前标题
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
    var lastRoots = [];
    var folded = {}; // line -> true 表示子树收起
    var activeLine = null;

    function rememberLayout() {
      try { return localStorage.getItem('mda-remember-layout') !== '0'; } catch (e) { return true; }
    }

    function readCollapsedPref() {
      if (!rememberLayout()) return false;
      try { return localStorage.getItem('mda-outline-collapsed') === '1'; } catch (e) { return false; }
    }

    function applyLang() {
      if (titleEl) titleEl.textContent = tr('outlineTitle');
      if (collapseBtn) collapseBtn.title = tr('outlineCollapse');
    }

    function setCollapsed(val, skipNotify) {
      collapsed = !!val;
      container.classList.toggle('collapsed', collapsed);
      if (rememberLayout()) {
        try { localStorage.setItem('mda-outline-collapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
      }
      applyLang();
      if (!skipNotify && onCollapsedChange) onCollapsedChange(collapsed);
    }

    function renderNodes(nodes, depth) {
      depth = depth || 0;
      if (!nodes || !nodes.length) return '';
      var html = '<ul class="mda-outline-list">';
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var hasKids = !!(n.children && n.children.length);
        var isFolded = hasKids && !!folded[n.line];
        html +=
          '<li class="mda-outline-item' + (hasKids ? ' has-children' : '') + (isFolded ? ' is-folded' : '') + '">' +
            '<div class="mda-outline-row" style="padding-left:' + (depth * 14) + 'px">' +
              (hasKids
                ? '<button type="button" class="mda-outline-fold" data-fold-line="' + n.line + '"' +
                  ' aria-expanded="' + (isFolded ? 'false' : 'true') + '"' +
                  ' title="' + escHtml(isFolded ? tr('outlineExpandChildren') : tr('outlineCollapseChildren')) + '">' +
                  (isFolded ? '\u25B8' : '\u25BE') +
                  '</button>'
                : '<span class="mda-outline-fold-spacer" aria-hidden="true"></span>') +
              '<button type="button" class="mda-outline-link" data-line="' + n.line + '">' +
                escHtml(n.title) +
              '</button>' +
            '</div>';
        if (hasKids && !isFolded) html += renderNodes(n.children, depth + 1);
        html += '</li>';
      }
      html += '</ul>';
      return html;
    }

    function paint() {
      if (!lastRoots || !lastRoots.length) {
        body.innerHTML = '<div class="mda-outline-empty">' + tr('outlineEmpty') + '</div>';
        return;
      }
      body.innerHTML = renderNodes(lastRoots, 0);
    }

    /** 高亮目标若在折叠子树内，展开祖先后重绘 */
    function ensureAncestorsExpanded(line) {
      var changed = false;
      function walk(nodes, ancestors) {
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          if (n.line === line) {
            for (var a = 0; a < ancestors.length; a++) {
              if (folded[ancestors[a].line]) {
                delete folded[ancestors[a].line];
                changed = true;
              }
            }
            return true;
          }
          if (n.children && n.children.length) {
            if (walk(n.children, ancestors.concat([n]))) return true;
          }
        }
        return false;
      }
      if (lastRoots && lastRoots.length) walk(lastRoots, []);
      return changed;
    }

    function refreshActiveHighlight(opts2) {
      opts2 = opts2 || {};
      if (activeLine == null) return;
      var links = body.querySelectorAll('.mda-outline-link');
      for (var i = 0; i < links.length; i++) {
        var ln = parseInt(links[i].getAttribute('data-line'), 10);
        var on = ln === activeLine;
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

    function setActiveLine(line, opts2) {
      opts2 = opts2 || {};
      if (line == null || isNaN(line)) return;
      if (!opts2.force && activeLine === line) return;
      activeLine = line;
      if (opts2.expandAncestors !== false && ensureAncestorsExpanded(line)) paint();
      refreshActiveHighlight(opts2);
    }

    applyLang();
    setCollapsed(readCollapsedPref(), true);

    collapseBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setCollapsed(true);
    });

    body.addEventListener('click', function (e) {
      var foldBtn = e.target.closest('[data-fold-line]');
      if (foldBtn) {
        e.preventDefault();
        e.stopPropagation();
        var fl = parseInt(foldBtn.getAttribute('data-fold-line'), 10);
        if (isNaN(fl)) return;
        if (folded[fl]) delete folded[fl];
        else folded[fl] = true;
        paint();
        refreshActiveHighlight({ skipScroll: true });
        return;
      }
      var btn = e.target.closest('.mda-outline-link[data-line]');
      if (!btn) return;
      var line = parseInt(btn.getAttribute('data-line'), 10);
      if (isNaN(line) || !onJump) return;
      e.preventDefault();
      e.stopPropagation();
      setActiveLine(line, { force: true, skipScroll: true });
      onJump(line);
    });

    function setHeadings(roots) {
      lastRoots = roots || [];
      flatHeadings = flattenHeadings(lastRoots, []);
      activeLine = null;
      // 丢弃已不存在的折叠键
      if (lastRoots.length) {
        var alive = {};
        for (var i = 0; i < flatHeadings.length; i++) alive[flatHeadings[i].line] = true;
        Object.keys(folded).forEach(function (k) {
          if (!alive[k]) delete folded[k];
        });
      } else {
        folded = {};
      }
      paint();
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

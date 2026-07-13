// MDA 工作区文件树侧栏（打开文件夹后展示 Markdown 文件列表）
(function (global) {
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {HTMLElement} container
   * @param {{ railEl?: HTMLElement, onOpenFile: function(string): void, onRefresh?: function(): void }} cb
   */
  function mount(container, cb) {
    cb = cb || {};
    var railEl = cb.railEl || container.parentElement;
    container.innerHTML =
      '<button type="button" id="fs-expand" class="mda-fs-expand-tab" title="展开文件树 (Ctrl+\\)">›</button>' +
      '<div class="mda-file-sidebar">' +
        '<div class="mda-file-sidebar-head">' +
          '<span class="mda-file-sidebar-title">文件</span>' +
          '<div class="mda-file-sidebar-actions">' +
            '<button type="button" id="fs-refresh" class="mda-file-sidebar-icon" title="刷新">↻</button>' +
            '<button type="button" id="fs-collapse" class="mda-file-sidebar-icon" title="收起侧栏 (Ctrl+\\)">‹</button>' +
          '</div>' +
        '</div>' +
        '<div id="fs-tree" class="mda-file-tree"></div>' +
      '</div>';

    var treeEl = container.querySelector('#fs-tree');
    var refreshBtn = container.querySelector('#fs-refresh');
    var collapseBtn = container.querySelector('#fs-collapse');
    var expandBtn = container.querySelector('#fs-expand');
    var activePath = null;
    var expandedDirs = {};
    var collapsed = false;

    function readCollapsedPref() {
      try { return localStorage.getItem('mda-file-sidebar-collapsed') === '1'; } catch (e) { return false; }
    }

    function setCollapsed(val) {
      collapsed = !!val;
      if (railEl) railEl.classList.toggle('collapsed', collapsed);
      try { localStorage.setItem('mda-file-sidebar-collapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    }

    function toggleCollapsed() {
      setCollapsed(!collapsed);
    }

    refreshBtn.addEventListener('click', function () {
      if (cb.onRefresh) cb.onRefresh();
    });
    collapseBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setCollapsed(true);
    });
    expandBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setCollapsed(false);
    });

    setCollapsed(readCollapsedPref());

    treeEl.addEventListener('click', function (e) {
      var row = e.target.closest('[data-node-path]');
      if (!row) return;
      var nodePath = row.getAttribute('data-node-path');
      var isDir = row.getAttribute('data-is-dir') === '1';
      if (isDir) {
        expandedDirs[nodePath] = !expandedDirs[nodePath];
        render(lastTree);
        return;
      }
      if (cb.onOpenFile) cb.onOpenFile(nodePath);
    });

    var lastTree = [];

    function renderNode(node, depth) {
      depth = depth || 0;
      var pad = depth * 14;
      if (node.isDir) {
        var open = expandedDirs[node.path] !== false;
        var html =
          '<div class="mda-fs-row dir" data-node-path="' + escHtml(node.path) + '" data-is-dir="1" style="padding-left:' + pad + 'px">' +
            '<span class="mda-fs-chevron">' + (open ? '▾' : '▸') + '</span>' +
            '<span class="mda-fs-name">' + escHtml(node.name) + '</span>' +
          '</div>';
        if (open && node.children) {
          for (var i = 0; i < node.children.length; i++) {
            html += renderNode(node.children[i], depth + 1);
          }
        }
        return html;
      }
      var active = activePath && node.path === activePath ? ' active' : '';
      return (
        '<div class="mda-fs-row file' + active + '" data-node-path="' + escHtml(node.path) + '" data-is-dir="0" style="padding-left:' + pad + 'px">' +
          '<span class="mda-fs-chevron"></span>' +
          '<span class="mda-fs-name">' + escHtml(node.name) + '</span>' +
        '</div>'
      );
    }

    function render(tree) {
      lastTree = tree || [];
      if (!lastTree.length) {
        treeEl.innerHTML = '<div class="mda-fs-empty">此文件夹中没有 Markdown 文件</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < lastTree.length; i++) html += renderNode(lastTree[i], 0);
      treeEl.innerHTML = html;
    }

    function setTree(tree) {
      render(tree || []);
    }

    function setActive(filePath) {
      activePath = filePath || null;
      render(lastTree);
    }

    return {
      setTree: setTree,
      setActive: setActive,
      render: render,
      setCollapsed: setCollapsed,
      toggleCollapsed: toggleCollapsed,
      isCollapsed: function () { return collapsed; },
    };
  }

  global.MDAFileSidebar = { mount: mount };
})(window);

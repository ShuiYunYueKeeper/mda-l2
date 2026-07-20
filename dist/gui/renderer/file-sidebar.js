// MDA 工作区文件列表侧栏（打开文件夹后展示 Markdown 文件列表）

(function (global) {

  function escHtml(s) {

    return String(s)

      .replace(/&/g, '&amp;')

      .replace(/</g, '&lt;')

      .replace(/>/g, '&gt;')

      .replace(/"/g, '&quot;');

  }



  function dirnamePath(filePath) {

    var i = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));

    return i >= 0 ? filePath.slice(0, i) : '';

  }



  function basenamePath(filePath) {

    var i = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));

    return i >= 0 ? filePath.slice(i + 1) : filePath;

  }



  function modKey() {

    return (navigator.platform || '').toLowerCase().indexOf('mac') >= 0 ? '\u2318' : 'Ctrl+';

  }



  /** DFS 收集全部 Markdown 文件路径（与侧栏树序一致，含折叠目录内） */

  function collectFiles(nodes, out) {

    out = out || [];

    if (!nodes) return out;

    for (var i = 0; i < nodes.length; i++) {

      var n = nodes[i];

      if (n.isDir) collectFiles(n.children, out);

      else out.push(n.path);

    }

    return out;

  }



  /**

   * @param {HTMLElement} container

   * @param {object} cb

   */

  function mount(container, cb) {

    cb = cb || {};

    var railEl = cb.railEl || container.parentElement;

    container.innerHTML =

      '<button type="button" id="fs-expand" class="mda-fs-expand-tab" title="">›</button>' +

      '<div class="mda-file-sidebar">' +

        '<div class="mda-file-sidebar-head">' +

          '<span class="mda-file-sidebar-title"></span>' +

          '<div class="mda-file-sidebar-actions">' +

            '<button type="button" id="fs-clear-list" class="mda-file-sidebar-icon" title="">✕</button>' +

            '<button type="button" id="fs-refresh" class="mda-file-sidebar-icon" title="">↻</button>' +

            '<button type="button" id="fs-collapse" class="mda-file-sidebar-icon" title="">‹</button>' +

          '</div>' +

        '</div>' +

        '<div id="fs-tree" class="mda-file-tree" tabindex="0" title=""></div>' +

      '</div>';



    var treeEl = container.querySelector('#fs-tree');

    var refreshBtn = container.querySelector('#fs-refresh');

    var clearListBtn = container.querySelector('#fs-clear-list');

    var collapseBtn = container.querySelector('#fs-collapse');

    var expandBtn = container.querySelector('#fs-expand');

    var titleEl = container.querySelector('.mda-file-sidebar-title');

    var activePath = null;

    var expandedDirs = {};

    var workspaceKey = '';

    var collapsed = false;

    var dropTargetEl = null;
    var dropTargetDir = null;
    var lastDropIsCopy = false;

    function pathsEqual(a, b) {
      return String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();
    }

    function findDirRow(dirPath) {
      if (!dirPath || !treeEl) return null;
      var rows = treeEl.querySelectorAll('.mda-fs-row.dir[data-node-path]');
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-node-path') === dirPath) return rows[i];
      }
      return null;
    }

    function setDropTargetDir(dirPath) {
      if (!dirPath) {
        clearDropTarget();
        return;
      }
      var row = findDirRow(dirPath);
      if (!row) {
        clearDropTarget();
        dropTargetDir = dirPath;
        return;
      }
      if (dropTargetEl !== row) {
        clearDropTarget();
        dropTargetEl = row;
        dropTargetDir = dirPath;
        row.classList.add('drop-target');
      } else {
        dropTargetDir = dirPath;
      }
    }

    function resolveDropDestDir(e) {
      if (dropTargetDir) return dropTargetDir;
      var dirRow = e.target.closest('.mda-fs-row.dir[data-node-path]');
      if (dirRow) return dirRow.getAttribute('data-node-path');
      var fileRow = e.target.closest('.mda-fs-row.file[data-node-path]');
      if (fileRow) return dirnamePath(fileRow.getAttribute('data-node-path'));
      return workspaceKey || null;
    }



    function tr(key) {

      return (global.MDAI18n && global.MDAI18n.t) ? global.MDAI18n.t(key) : key;

    }



    function applyLang() {

      if (titleEl) titleEl.textContent = tr('fsTitle');

      if (expandBtn) expandBtn.title = tr('fsExpand');

      if (collapseBtn) collapseBtn.title = tr('fsCollapse');

      if (refreshBtn) refreshBtn.title = tr('fsRefresh');

      if (clearListBtn) clearListBtn.title = tr('fsClearList');

      if (treeEl) treeEl.title = tr('fsNavHint');

      if (lastTree && lastTree.length === 0) {

        treeEl.innerHTML = '<div class="mda-fs-empty">' + tr('fsEmpty') + '</div>';

      }

    }



    function rememberLayout() {

      try { return localStorage.getItem('mda-remember-layout') !== '0'; } catch (e) { return true; }

    }



    function readCollapsedPref() {

      if (!rememberLayout()) return false;

      try { return localStorage.getItem('mda-file-sidebar-collapsed') === '1'; } catch (e) { return false; }

    }



    function loadExpandedDirs() {

      if (!workspaceKey || !rememberLayout()) {

        expandedDirs = {};

        return;

      }

      try {

        var all = JSON.parse(localStorage.getItem('mda-fs-expanded-dirs') || '{}');

        expandedDirs = (all && all[workspaceKey]) ? all[workspaceKey] : {};

      } catch (e) {

        expandedDirs = {};

      }

    }



    function saveExpandedDirs() {

      if (!workspaceKey || !rememberLayout()) return;

      try {

        var all = JSON.parse(localStorage.getItem('mda-fs-expanded-dirs') || '{}');

        if (!all || typeof all !== 'object') all = {};

        all[workspaceKey] = expandedDirs;

        localStorage.setItem('mda-fs-expanded-dirs', JSON.stringify(all));

      } catch (e) { /* ignore */ }

    }



    function setCollapsed(val) {

      collapsed = !!val;

      if (railEl) railEl.classList.toggle('collapsed', collapsed);

      if (rememberLayout()) {

        try { localStorage.setItem('mda-file-sidebar-collapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }

      }

      if (cb.onCollapsedChange) cb.onCollapsedChange(collapsed);

    }



    function toggleCollapsed() {

      setCollapsed(!collapsed);

    }



    function getClip() {

      return cb.getFsClip ? cb.getFsClip() : null;

    }



    function hasPasteClip() {

      var clip = getClip();

      return !!(clip && clip.paths && clip.paths.length);

    }



    function getPasteTargetDir() {

      if (!workspaceKey) return null;

      if (!activePath) return workspaceKey;

      return dirnamePath(activePath) || workspaceKey;

    }



    function clearDropTarget() {

      if (dropTargetEl) {

        dropTargetEl.classList.remove('drop-target');

        dropTargetEl = null;

      }

      dropTargetDir = null;

    }



    refreshBtn.addEventListener('click', function () {

      if (cb.onRefresh) cb.onRefresh();

    });

    if (clearListBtn) {
      clearListBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (cb.onClearList) cb.onClearList();
      });
    }

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

      if (!row) {

        treeEl.focus();

        return;

      }

      var nodePath = row.getAttribute('data-node-path');

      var isDir = row.getAttribute('data-is-dir') === '1';

      if (isDir) {

        expandedDirs[nodePath] = !expandedDirs[nodePath];

        saveExpandedDirs();

        render(lastTree);

        treeEl.focus();

        return;

      }

      treeEl.focus();

      if (cb.onOpenFile) cb.onOpenFile(nodePath);

    });



    var fsMenuEl = null;

    var fsMenuDismiss = null;



    function removeFsContextMenu() {

      if (fsMenuEl) { fsMenuEl.remove(); fsMenuEl = null; }

      if (fsMenuDismiss) {

        document.removeEventListener('click', fsMenuDismiss, true);

        document.removeEventListener('contextmenu', fsMenuDismiss, true);

        window.removeEventListener('blur', fsMenuDismiss);

        fsMenuDismiss = null;

      }

    }



    function menuKey(label) {

      return '<span class="mda-menu-key">' + label + '</span>';

    }



    function showFsContextMenu(x, y, opts) {

      opts = opts || {};

      removeFsContextMenu();

      var mk = modKey();

      var menu = document.createElement('div');

      menu.className = 'mda-context-menu';

      var html = '';

      if (opts.isDir) {

        html += '<div class="mda-menu-item' + (hasPasteClip() ? '' : ' disabled') + '" data-act="paste">' +

          '<span>' + tr('fsPasteFile') + '</span>' + menuKey(mk + 'V') + '</div>';

      } else {

        html +=

          '<div class="mda-menu-item" data-act="copy-name"><span>' + tr('fsCopyName') + '</span></div>' +

          '<div class="mda-menu-item" data-act="copy-file"><span>' + tr('fsCopyFile') + '</span>' + menuKey(mk + 'C') + '</div>' +

          '<div class="mda-menu-item" data-act="cut-file"><span>' + tr('fsCutFile') + '</span>' + menuKey(mk + 'X') + '</div>' +

          '<div class="mda-menu-item' + (hasPasteClip() ? '' : ' disabled') + '" data-act="paste">' +

            '<span>' + tr('fsPasteFile') + '</span>' + menuKey(mk + 'V') + '</div>' +

          '<div class="mda-menu-item" data-act="rename"><span>' + tr('fsRename') + '</span>' + menuKey(mk + 'R') + '</div>' +

          '<div class="mda-menu-item" data-act="delete"><span>' + tr('fsDelete') + '</span>' + menuKey('Delete') + '</div>';

      }

      menu.innerHTML = html;

      document.body.appendChild(menu);

      menu.style.left = Math.min(x, window.innerWidth - menu.offsetWidth - 4) + 'px';

      menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 4) + 'px';

      menu.addEventListener('click', function (e) {

        var item = e.target.closest('[data-act]');

        if (!item || item.classList.contains('disabled')) return;

        var act = item.dataset.act;

        removeFsContextMenu();

        if (act === 'copy-name' && cb.onCopyFileName) cb.onCopyFileName(opts.filePath, opts.fileName);

        if (act === 'copy-file' && cb.onCopyFile) cb.onCopyFile(opts.filePath);

        if (act === 'cut-file' && cb.onCutFile) cb.onCutFile(opts.filePath);

        if (act === 'paste' && cb.onPasteToDir) cb.onPasteToDir(opts.pasteDir || getPasteTargetDir());

        if (act === 'rename' && cb.onRenameFile) cb.onRenameFile(opts.filePath, opts.fileName);

        if (act === 'delete' && cb.onDeleteFile) cb.onDeleteFile(opts.filePath, opts.fileName);

      });

      fsMenuEl = menu;

      fsMenuDismiss = function (ev) {

        if (ev.type === 'click' && menu.contains(ev.target)) return;

        removeFsContextMenu();

      };

      setTimeout(function () {

        document.addEventListener('click', fsMenuDismiss, true);

        document.addEventListener('contextmenu', fsMenuDismiss, true);

        window.addEventListener('blur', fsMenuDismiss);

      }, 0);

    }



    treeEl.addEventListener('contextmenu', function (e) {

      var fileRow = e.target.closest('.mda-fs-row.file[data-node-path]');

      var dirRow = e.target.closest('.mda-fs-row.dir[data-node-path]');

      if (!fileRow && !dirRow) return;

      e.preventDefault();

      e.stopPropagation();

      if (dirRow) {

        showFsContextMenu(e.clientX, e.clientY, {

          isDir: true,

          pasteDir: dirRow.getAttribute('data-node-path'),

        });

        return;

      }

      showFsContextMenu(e.clientX, e.clientY, {

        filePath: fileRow.getAttribute('data-node-path'),

        fileName: basenamePath(fileRow.getAttribute('data-node-path') || ''),

        pasteDir: getPasteTargetDir(),

      });

    });



    treeEl.addEventListener('dragstart', function (e) {

      var row = e.target.closest('.mda-fs-row.file[data-node-path]');

      if (!row) return;

      var nodePath = row.getAttribute('data-node-path');

      e.dataTransfer.setData('text/plain', nodePath);

      e.dataTransfer.effectAllowed = 'copyMove';

      row.classList.add('dragging');

    });



    treeEl.addEventListener('dragend', function (e) {

      var row = e.target.closest('.mda-fs-row.file[data-node-path]');

      if (row) row.classList.remove('dragging');

      clearDropTarget();

    });



    treeEl.addEventListener('dragover', function (e) {

      if (!e.dataTransfer.types || !Array.prototype.indexOf.call(e.dataTransfer.types, 'text/plain')) return;

      e.preventDefault();

      lastDropIsCopy = !!(e.ctrlKey || e.metaKey);

      e.dataTransfer.dropEffect = lastDropIsCopy ? 'copy' : 'move';

      var dirRow = e.target.closest('.mda-fs-row.dir[data-node-path]');

      if (dirRow) {

        setDropTargetDir(dirRow.getAttribute('data-node-path'));

        return;

      }

      var fileRow = e.target.closest('.mda-fs-row.file[data-node-path]');

      if (fileRow) {

        setDropTargetDir(dirnamePath(fileRow.getAttribute('data-node-path')));

        return;

      }

      clearDropTarget();

    });



    treeEl.addEventListener('dragleave', function (e) {

      if (!treeEl.contains(e.relatedTarget)) clearDropTarget();

    });



    treeEl.addEventListener('drop', function (e) {

      var src = e.dataTransfer.getData('text/plain');

      if (!src) return;

      e.preventDefault();

      e.stopPropagation();

      var destDir = resolveDropDestDir(e);

      var isCopy = lastDropIsCopy;

      clearDropTarget();

      if (!destDir || !cb.onDropFile) return;

      if (!isCopy && pathsEqual(dirnamePath(src), destDir)) return;

      if (pathsEqual(src, destDir)) return;

      cb.onDropFile(src, destDir, isCopy);

    });



    treeEl.addEventListener('keydown', function (e) {

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {

        var k = (e.key || '').toLowerCase();

        if (k === 'c' && activePath) {

          e.preventDefault();

          e.stopPropagation();

          if (cb.onCopyFile) cb.onCopyFile(activePath);

          return;

        }

        if (k === 'x' && activePath) {

          e.preventDefault();

          e.stopPropagation();

          if (cb.onCutFile) cb.onCutFile(activePath);

          return;

        }

        if (k === 'v') {

          e.preventDefault();

          e.stopPropagation();

          if (cb.onPasteToDir) cb.onPasteToDir(getPasteTargetDir());

          return;

        }

        if (k === 'z') {

          e.preventDefault();

          e.stopPropagation();

          if (cb.onUndoFs) cb.onUndoFs();

          return;

        }

        if (k === 'r' && activePath) {

          e.preventDefault();

          e.stopPropagation();

          if (cb.onRenameFile) cb.onRenameFile(activePath, basenamePath(activePath));

          return;

        }

      }

      if ((e.key === 'Delete' || e.key === 'Del') && activePath && !e.ctrlKey && !e.metaKey && !e.altKey) {

        e.preventDefault();

        e.stopPropagation();

        if (cb.onDeleteFile) cb.onDeleteFile(activePath, basenamePath(activePath));

        return;

      }

      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      e.preventDefault();

      e.stopPropagation();

      openAdjacent(e.key === 'ArrowDown' ? 1 : -1);

    });



    var lastTree = [];

    applyLang();



    function openAdjacent(delta) {

      if (collapsed) return;

      var files = collectFiles(lastTree);

      if (!files.length) return;

      var idx = activePath ? files.indexOf(activePath) : -1;

      var next = idx < 0 ? (delta > 0 ? 0 : files.length - 1) : idx + delta;

      if (next < 0 || next >= files.length) return;

      if (cb.onOpenFile) cb.onOpenFile(files[next]);

    }



    function renderNode(node, depth) {

      depth = depth || 0;

      var pad = depth * 14;

      var clip = getClip();

      if (node.isDir) {

        var open = expandedDirs[node.path] !== false;

        var html =

          '<div class="mda-fs-row dir" data-node-path="' + escHtml(node.path) + '" data-is-dir="1" title="' + escHtml(node.path) + '" style="padding-left:' + pad + 'px">' +

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

      var cutPending = clip && clip.mode === 'cut' && clip.paths.indexOf(node.path) >= 0;

      var extraCls = (cutPending ? ' cut-pending' : '') + active;

      return (

        '<div class="mda-fs-row file' + extraCls + '" draggable="true" data-node-path="' + escHtml(node.path) + '" data-is-dir="0" title="' + escHtml(node.path) + '" style="padding-left:' + pad + 'px">' +

          '<span class="mda-fs-chevron"></span>' +

          '<span class="mda-fs-name">' + escHtml(node.name) + '</span>' +

        '</div>'

      );

    }



    function scrollActiveIntoView() {

      var row = treeEl.querySelector('.mda-fs-row.active');

      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });

    }



    function render(tree) {

      lastTree = tree || [];

      if (!lastTree.length) {

        treeEl.innerHTML = '<div class="mda-fs-empty">' + tr('fsEmpty') + '</div>';

        return;

      }

      var html = '';

      for (var i = 0; i < lastTree.length; i++) html += renderNode(lastTree[i], 0);

      treeEl.innerHTML = html;

      scrollActiveIntoView();

    }



    function setTree(tree) {

      render(tree || []);

    }



    function setActive(filePath) {

      activePath = filePath || null;

      render(lastTree);

    }



    function focusList() {

      if (!collapsed && treeEl) treeEl.focus();

    }



    function setWorkspaceKey(root) {

      workspaceKey = root || '';

      loadExpandedDirs();

      render(lastTree);

    }



    function refreshClipState() {

      render(lastTree);

    }



    return {

      setTree: setTree,

      setActive: setActive,

      render: render,

      setWorkspaceKey: setWorkspaceKey,

      getFileList: function () { return collectFiles(lastTree); },

      getActivePath: function () { return activePath; },

      refreshClipState: refreshClipState,

      setCollapsed: setCollapsed,

      toggleCollapsed: toggleCollapsed,

      isCollapsed: function () { return collapsed; },

      openAdjacent: openAdjacent,

      focusList: focusList,

      applyLang: applyLang,

    };

  }



  global.MDAFileSidebar = { mount: mount };

})(window);


// MDA 欢迎页（WELCOME 空态）：新建 / 打开 / 打开文件夹 / 最近文件
(function (global) {
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function basename(p) {
    return String(p || '').replace(/\\/g, '/').split('/').pop() || p;
  }

  /**
   * @param {HTMLElement} hostEl 挂载容器（通常为 #content-row）
   * @param {{ onNew: Function, onOpenFile: Function, onOpenFolder: Function, onOpenRecent: Function }} cb
   */
  function mount(hostEl, cb) {
    var el = document.createElement('div');
    el.id = 'welcome-pane';
    el.className = 'mda-welcome hidden';
    el.innerHTML =
      '<div class="mda-welcome-inner">' +
        '<h1 class="mda-welcome-title">MDA</h1>' +
        '<p class="mda-welcome-lead">Markdown 批注管理工具 — 预览、编辑、批注与文件管理</p>' +
        '<div class="mda-welcome-actions">' +
          '<button type="button" class="mda-welcome-btn primary" data-act="new">新建文档 <kbd>Ctrl+N</kbd></button>' +
          '<button type="button" class="mda-welcome-btn" data-act="open">打开文件 <kbd>Ctrl+O</kbd></button>' +
          '<button type="button" class="mda-welcome-btn" data-act="folder">打开文件夹 <kbd>Ctrl+Alt+O</kbd></button>' +
        '</div>' +
        '<div class="mda-welcome-recent">' +
          '<div class="mda-welcome-recent-head">最近打开</div>' +
          '<ul id="welcome-recent-list" class="mda-welcome-recent-list"></ul>' +
          '<div id="welcome-recent-empty" class="mda-welcome-recent-empty">暂无最近文件</div>' +
        '</div>' +
      '</div>';
    hostEl.appendChild(el);

    var recentList = el.querySelector('#welcome-recent-list');
    var recentEmpty = el.querySelector('#welcome-recent-empty');

    el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'new' && cb.onNew) cb.onNew();
      else if (act === 'open' && cb.onOpenFile) cb.onOpenFile();
      else if (act === 'folder' && cb.onOpenFolder) cb.onOpenFolder();
    });

    recentList.addEventListener('click', function (e) {
      var li = e.target.closest('[data-path]');
      if (!li) return;
      var p = li.getAttribute('data-path');
      if (p && cb.onOpenRecent) cb.onOpenRecent(p);
    });

    function setRecents(files) {
      recentList.innerHTML = '';
      var items = files || [];
      recentEmpty.style.display = items.length ? 'none' : 'block';
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var p = item.path || item;
        var li = document.createElement('li');
        li.setAttribute('data-path', p);
        li.innerHTML =
          '<span class="mda-welcome-recent-name">' + escHtml(basename(p)) + '</span>' +
          '<span class="mda-welcome-recent-path">' + escHtml(p) + '</span>';
        recentList.appendChild(li);
      }
    }

    function show() { el.classList.remove('hidden'); }
    function hide() { el.classList.add('hidden'); }

    return { el: el, show: show, hide: hide, setRecents: setRecents };
  }

  global.MDAWelcome = { mount: mount };
})(window);

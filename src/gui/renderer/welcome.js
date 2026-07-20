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

  function tr(key) {
    return (global.MDAI18n && global.MDAI18n.t) ? global.MDAI18n.t(key) : key;
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
        '<p class="mda-welcome-lead" data-i18n="welcomeLead"></p>' +
        '<p class="mda-welcome-pitch" data-i18n="welcomePitch"></p>' +
        '<div class="mda-welcome-actions">' +
          '<button type="button" class="mda-welcome-btn primary" data-act="new"><span data-i18n="welcomeNew"></span> <kbd>Ctrl+N</kbd></button>' +
          '<button type="button" class="mda-welcome-btn" data-act="open"><span data-i18n="welcomeOpen"></span> <kbd>Ctrl+O</kbd></button>' +
          '<button type="button" class="mda-welcome-btn" data-act="folder"><span data-i18n="welcomeFolder"></span> <kbd>Ctrl+Alt+O</kbd></button>' +
        '</div>' +
        '<div class="mda-welcome-recent">' +
          '<div class="mda-welcome-recent-head" data-i18n="welcomeRecent"></div>' +
          '<ul id="welcome-recent-list" class="mda-welcome-recent-list"></ul>' +
          '<div id="welcome-recent-empty" class="mda-welcome-recent-empty" data-i18n="welcomeRecentEmpty"></div>' +
        '</div>' +
      '</div>';
    hostEl.appendChild(el);

    var recentList = el.querySelector('#welcome-recent-list');
    var recentEmpty = el.querySelector('#welcome-recent-empty');

    function applyLang() {
      el.querySelectorAll('[data-i18n]').forEach(function (node) {
        var k = node.getAttribute('data-i18n');
        if (k) node.textContent = tr(k);
      });
    }
    applyLang();

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
        li.title = p;
        li.innerHTML =
          '<span class="mda-welcome-recent-name">' + escHtml(basename(p)) + '</span>' +
          '<span class="mda-welcome-recent-path">' + escHtml(p) + '</span>';
        recentList.appendChild(li);
      }
    }

    function show() { el.classList.remove('hidden'); }
    function hide() { el.classList.add('hidden'); }

    return { el: el, show: show, hide: hide, setRecents: setRecents, applyLang: applyLang };
  }

  global.MDAWelcome = { mount: mount };
})(window);

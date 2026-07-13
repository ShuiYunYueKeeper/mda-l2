// 文档大纲（TOC）面板 — 绑定 core extractHeadings
(function (global) {
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function mount(container, onJump) {
    container.innerHTML =
      '<div class="mda-outline-panel">' +
        '<div class="mda-outline-head">' +
          '<span>大纲</span>' +
          '<button type="button" id="outline-collapse" class="mda-outline-toggle" title="收起">▾</button>' +
        '</div>' +
        '<div id="outline-body" class="mda-outline-body"></div>' +
      '</div>';

    var body = container.querySelector('#outline-body');
    var collapseBtn = container.querySelector('#outline-collapse');
    var collapsed = false;

    collapseBtn.addEventListener('click', function () {
      collapsed = !collapsed;
      body.classList.toggle('hidden', collapsed);
      collapseBtn.textContent = collapsed ? '▸' : '▾';
      collapseBtn.title = collapsed ? '展开' : '收起';
    });

    body.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-line]');
      if (!btn) return;
      var line = parseInt(btn.getAttribute('data-line'), 10);
      if (!isNaN(line) && onJump) onJump(line);
    });

    function setHeadings(roots) {
      if (!roots || !roots.length) {
        body.innerHTML = '<div class="mda-outline-empty">无标题</div>';
        return;
      }
      body.innerHTML = renderNodes(roots, 0);
    }

    return { setHeadings: setHeadings };
  }

  global.MDAOutlinePanel = { mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = { mount: mount };
})(typeof window !== 'undefined' ? window : global);

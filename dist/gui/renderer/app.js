// MDA Renderer — Markdown 批注管理工具 GUI
// 复用 @mda/core（经 preload 暴露）完成解析/渲染/写入；本层负责交互与视图。

(function () {
  var api = window.mdaAPI;
  var currentFilePath = null;
  var currentText = '';           // 当前文件磁盘内容（编辑模式下预览的兜底源）
  var annotations = [];
  var paragraphs = [];
  var selectedAnnotationId = null;
  var cursorLine = null;
  var htmlContent = '';

  var editorVisible = false;      // 左侧源码编辑栏是否展开
  var panelVisible = true;        // 右侧批注栏是否展开（默认展开）
  var dirty = false;              // 编辑器内容是否有未保存修改
  var previewTimer = null;        // 实时预览防抖
  var closePromptOpen = false;    // 防止重复弹出关闭确认框

  var filterStatus = { open: true, resolved: true, wontfix: true };
  var filterLevel = { critical: true, major: true, minor: true, info: true };
  var filterTags = {};

  var LEVEL_COLORS = (api && api.levelColors) || { critical: '#e74c3c', major: '#e67e22', minor: '#f1c40f', info: '#95a5a6' };
  var LEVEL_ORDER = (api && api.levelSeverity) || { critical: 3, major: 2, minor: 1, info: 0 };

  // DOM 元素
  var previewEl, annoListEl, statusFiltersEl, levelFiltersEl, tagFiltersEl, tagFiltersRow;
  var previewPaneEl, editorPaneEl, editorEl, panelPaneEl;
  var srcGutterEl, srcHighlightEl, splitLeftEl, splitRightEl;
  var tbEditBtn, tbPanelBtn, tbFileNameEl, addBtn;

  var MOD_KEY = (navigator.platform || '').toLowerCase().indexOf('mac') >= 0 ? '\u2318' : 'Ctrl+';

  // ---- 初始化 ----
  function init() {
    buildLayout();
    initTheme();
    initMermaid();

    api.onFileOpened(function (filePath) { requestOpen(filePath); });
    api.onReload(function () { if (currentFilePath) requestOpen(currentFilePath); });
    api.onMenuShowInFolder(function () {
      if (currentFilePath) api.showItemInFolder(currentFilePath);
      else uiAlert('请先打开一个文件');
    });
    api.onMenuToggleTheme(function () { toggleTheme(); });
    api.onMenuToggleEdit(function () { toggleEditor(); });
    api.onMenuTogglePanel(function () { togglePanel(); });
    api.onMenuSave(function () { saveFile(); });
    api.onAppCloseRequest(function () { handleAppCloseRequest(); });

    setupDragAndDrop();
    // 兜底：Ctrl+S 保存（菜单快捷键之外再拦一层）
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 's') {
        e.preventDefault();
        saveFile();
      }
    });

    setTitle(null);
    updateToolbar();
  }

  // ---- 布局 ----
  function buildLayout() {
    var root = document.getElementById('root');
    root.innerHTML =
      '<div class="toolbar">' +
        '<button id="tb-edit" class="tool-btn" title="编辑栏 (Ctrl+E)">编辑</button>' +
        '<button id="tb-panel" class="tool-btn" title="批注栏 (Ctrl+B)">批注</button>' +
        '<span class="spacer"></span>' +
        '<span id="tb-filename" class="file-name"></span>' +
      '</div>' +
      '<div id="content-row">' +
        '<div id="editor-pane">' +
          '<div class="mda-src-editor">' +
            '<div id="src-gutter" class="src-gutter"></div>' +
            '<div class="src-scroll">' +
              '<pre id="src-highlight" class="src-highlight" aria-hidden="true"><code class="language-markdown"></code></pre>' +
              '<textarea id="editor" class="src-input" spellcheck="false" wrap="off" placeholder="在此编辑 Markdown 源码…"></textarea>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="split-left" class="mda-splitter hidden"></div>' +
        '<div id="preview-pane"><div id="preview-content"></div></div>' +
        '<div id="split-right" class="mda-splitter"></div>' +
        '<div id="panel-pane">' +
          '<div class="panel-head">' +
            '<button id="btn-add" class="btn-primary" disabled>+ 添加批注</button>' +
          '</div>' +
          '<div class="filter-box">' +
            '<div style="margin-bottom:4px"><b>状态</b> <span id="status-filters"></span></div>' +
            '<div style="margin-bottom:4px"><b>级别</b> <span id="level-filters"></span></div>' +
            '<div id="tag-filters-row" style="display:none"><b>标签</b> <span id="tag-filters"></span></div>' +
          '</div>' +
          '<div id="anno-list"></div>' +
        '</div>' +
      '</div>';

    previewEl = document.getElementById('preview-content');
    previewPaneEl = document.getElementById('preview-pane');
    editorPaneEl = document.getElementById('editor-pane');
    editorEl = document.getElementById('editor');
    srcGutterEl = document.getElementById('src-gutter');
    srcHighlightEl = document.querySelector('#src-highlight code');
    splitLeftEl = document.getElementById('split-left');
    splitRightEl = document.getElementById('split-right');
    panelPaneEl = document.getElementById('panel-pane');
    statusFiltersEl = document.getElementById('status-filters');
    levelFiltersEl = document.getElementById('level-filters');
    tagFiltersEl = document.getElementById('tag-filters');
    tagFiltersRow = document.getElementById('tag-filters-row');
    annoListEl = document.getElementById('anno-list');
    tbEditBtn = document.getElementById('tb-edit');
    tbPanelBtn = document.getElementById('tb-panel');
    tbFileNameEl = document.getElementById('tb-filename');
    addBtn = document.getElementById('btn-add');

    addBtn.addEventListener('click', function () { showEditDialog('add', null, cursorLine); });
    tbEditBtn.addEventListener('click', function () { toggleEditor(); });
    tbPanelBtn.addEventListener('click', function () { togglePanel(); });

    // 编辑器输入 → 按与磁盘内容是否一致决定 dirty（Ctrl+Z 撤回原点后自动取消标脏）
    editorEl.addEventListener('input', function () {
      setDirtyState(editorEl.value !== currentText);
      refreshEditorDecorations();
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(function () {
        parseAndRender(editorEl.value, currentFilePath);
      }, 250);
    });
    // 滚动同步：textarea 为可交互滚动层，高亮层与行号槽跟随
    editorEl.addEventListener('scroll', function () {
      var hp = srcHighlightEl.parentNode; // <pre>
      hp.scrollTop = editorEl.scrollTop;
      hp.scrollLeft = editorEl.scrollLeft;
      srcGutterEl.scrollTop = editorEl.scrollTop;
    });

    setupSplitter(splitLeftEl, editorPaneEl, 'left');
    setupSplitter(splitRightEl, panelPaneEl, 'right');

    // 预览区点击：链接拦截默认导航；段落点击定位批注
    previewPaneEl.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a) {
        e.preventDefault();
        handleLinkClick(a.getAttribute('href'));
        return;
      }
      var block = e.target.closest('[data-line]');
      if (block) {
        cursorLine = parseInt(block.getAttribute('data-line'), 10) || null;
        highlightCursorBlock(block);
        var p = findParagraphForLine(cursorLine);
        if (p && p.annotations && p.annotations.length) {
          selectAnnotation(p.annotations[0].id, false);
        }
      }
    });
  }

  // ---- 主题（深色模式）----
  function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('mda-theme'); } catch (e) { /* ignore */ }
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved);
    } else {
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
      // 未手动设置时跟随系统变化
      if (window.matchMedia) {
        try {
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (ev) {
            var pref = null;
            try { pref = localStorage.getItem('mda-theme'); } catch (e) { /* ignore */ }
            if (pref !== 'dark' && pref !== 'light') {
              applyTheme(ev.matches ? 'dark' : 'light');
              rerenderPreview();
            }
          });
        } catch (e) { /* 旧版无 addEventListener */ }
      }
    }
  }

  function toggleTheme() {
    var next = isDark() ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('mda-theme', next); } catch (e) { /* ignore */ }
    rerenderPreview(); // 让 mermaid 跟随主题重绘
  }

  function rerenderPreview() {
    if (currentFilePath) parseAndRender(getPreviewSource(), currentFilePath);
  }

  // 预览源：有未保存编辑时以编辑器缓冲为准，否则用磁盘内容
  function getPreviewSource() {
    return dirty ? editorEl.value : currentText;
  }

  // ---- mermaid ----
  function getMermaid() {
    if (window.mermaid) return window.mermaid;
    var ns = window.__esbuild_esm_mermaid_nm && window.__esbuild_esm_mermaid_nm.mermaid;
    if (ns) return ns.default || ns;
    return null;
  }

  function initMermaid() {
    var m = getMermaid();
    if (m) {
      try { m.initialize({ startOnLoad: false, theme: isDark() ? 'dark' : 'default', securityLevel: 'strict' }); } catch (e) { /* ignore */ }
    }
  }

  async function renderMermaidBlocks() {
    var blocks = previewEl.querySelectorAll('pre > code.language-mermaid');
    if (!blocks.length) return;
    var m = getMermaid();
    for (var i = 0; i < blocks.length; i++) {
      var code = blocks[i];
      var pre = code.parentNode;
      var holder = document.createElement('div');
      if (!m) {
        holder.className = 'mda-mermaid-error';
        holder.textContent = '流程图渲染失败: mermaid 未加载';
        pre.parentNode.replaceChild(holder, pre);
        continue;
      }
      holder.className = 'mda-mermaid';
      pre.parentNode.replaceChild(holder, pre);
      var src = code.textContent.replace(/\n$/, '');
      var id = 'mmd-' + Date.now() + '-' + i;
      try {
        try { m.initialize({ startOnLoad: false, theme: isDark() ? 'dark' : 'default', securityLevel: 'strict' }); } catch (e) { /* ignore */ }
        var out = await m.render(id, src);
        holder.innerHTML = out.svg;
        if (out.bindFunctions) out.bindFunctions(holder);
        holder.addEventListener('click', function () {
          var svg = this.querySelector('svg');
          if (svg) openZoom(svg.cloneNode(true));
        });
      } catch (err) {
        holder.className = 'mda-mermaid-error';
        holder.textContent = '流程图渲染失败: ' + ((err && err.message) ? err.message : String(err));
      }
    }
  }

  // ---- 编辑栏 / 批注栏（两侧独立开关，可同时展开：源码 | 预览 | 批注）----
  function toggleEditor() {
    if (!currentFilePath) { uiAlert('请先打开一个文件'); return; }
    editorVisible = !editorVisible;
    if (editorVisible) {
      if (!dirty) editorEl.value = currentText; // 无脏改动时同步磁盘内容
      editorPaneEl.classList.add('visible');
      splitLeftEl.classList.remove('hidden');
      refreshEditorDecorations();
      requestAnimationFrame(function () { editorEl.focus(); });
    } else {
      editorPaneEl.classList.remove('visible');
      splitLeftEl.classList.add('hidden');
    }
    updateToolbar();
  }

  function togglePanel() {
    panelVisible = !panelVisible;
    panelPaneEl.classList.toggle('hidden', !panelVisible);
    splitRightEl.classList.toggle('hidden', !panelVisible);
    updateToolbar();
  }

  // 刷新编辑器语法高亮层与行号槽（与 textarea 内容对齐）
  function refreshEditorDecorations() {
    var text = editorEl.value;
    if (srcHighlightEl) {
      srcHighlightEl.innerHTML = (api.highlightSource ? api.highlightSource(text) : escHtml(text));
    }
    if (srcGutterEl) {
      var n = text.split('\n').length;
      var nums = new Array(n);
      for (var i = 0; i < n; i++) nums[i] = i + 1;
      srcGutterEl.textContent = nums.join('\n');
    }
    // 同步一次滚动位置（内容变化后保持对齐）
    var hp = srcHighlightEl ? srcHighlightEl.parentNode : null;
    if (hp) { hp.scrollTop = editorEl.scrollTop; hp.scrollLeft = editorEl.scrollLeft; }
    if (srcGutterEl) srcGutterEl.scrollTop = editorEl.scrollTop;
  }

  // 分栏默认宽度（用于双击复位）
  var PANE_DEFAULT = { editor: 380, panel: 320 };

  // 分栏拖拽调宽：side='left' 调左侧（编辑栏）宽度；side='right' 调右侧（批注栏）宽度；
  // 双击手柄 → 复位到默认宽度。
  function setupSplitter(splitter, paneEl, side) {
    var defW = side === 'left' ? PANE_DEFAULT.editor : PANE_DEFAULT.panel;
    splitter.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var startX = e.clientX;
      var startW = paneEl.getBoundingClientRect().width;
      function move(ev) {
        var dx = ev.clientX - startX;
        var w = side === 'left' ? startW + dx : startW - dx;
        w = Math.max(220, Math.min(w, window.innerWidth * 0.7));
        paneEl.style.flex = '0 0 ' + w + 'px';
      }
      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.body.style.cursor = 'col-resize';
    });
    splitter.addEventListener('dblclick', function () {
      paneEl.style.flex = '0 0 ' + defW + 'px';
    });
    splitter.title = '拖动调整宽度，双击复位';
  }

  // ---- 缩放遮罩（图片 / 流程图共用）----
  function openZoom(node) {
    var ov = document.createElement('div');
    ov.className = 'mda-zoom';
    var stage = document.createElement('div');
    stage.className = 'mda-zoom-stage';
    stage.appendChild(node);
    var bar = document.createElement('div');
    bar.className = 'mda-zoom-bar';
    bar.innerHTML = '<button data-z="in" title="放大">+</button>' +
      '<button data-z="out" title="缩小">\u2212</button>' +
      '<button data-z="reset" title="复位">\u21ba</button>' +
      '<button data-z="close" title="关闭">\u2715</button>';
    ov.appendChild(bar);
    ov.appendChild(stage);
    document.body.appendChild(ov);

    var MIN_SCALE = 0.3, MAX_SCALE = 8;
    var scale = 1, tx = 0, ty = 0;
    // 平移边界：保证内容中心始终留在视口内，避免被拖到不可见区域
    function clampPan() {
      var maxX = window.innerWidth / 2;
      var maxY = window.innerHeight / 2;
      tx = Math.max(-maxX, Math.min(maxX, tx));
      ty = Math.max(-maxY, Math.min(maxY, ty));
    }
    function apply() { clampPan(); stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
    function zoom(factor) { scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor)); apply(); }
    function reset() { scale = 1; tx = 0; ty = 0; apply(); }

    ov.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    var dragging = false, sx = 0, sy = 0;
    stage.addEventListener('mousedown', function (e) { dragging = true; sx = e.clientX - tx; sy = e.clientY - ty; e.preventDefault(); });
    function onMove(e) { if (!dragging) return; tx = e.clientX - sx; ty = e.clientY - sy; apply(); }
    function onUp() { dragging = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    function close() {
      ov.remove();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    // 仅在内容本身双击才复位（避免连点 +/- 按钮误触发复位）
    stage.addEventListener('dblclick', function (e) { e.stopPropagation(); reset(); });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      var z = b.getAttribute('data-z');
      if (z === 'in') zoom(1.2);
      else if (z === 'out') zoom(1 / 1.2);
      else if (z === 'reset') reset();
      else close();
    });
    // 吞掉工具栏上的双击，避免冒泡触发其它复位逻辑
    bar.addEventListener('dblclick', function (e) { e.stopPropagation(); });
  }

  function setDirtyState(val) {
    if (dirty === val) return;
    dirty = val;
    if (api.setDirty) api.setDirty(val);
    updateToolbar();
  }

  function saveFile(onSuccess) {
    if (!currentFilePath || !dirty) {
      if (typeof onSuccess === 'function') onSuccess();
      return;
    }
    var content = editorEl.value;
    var bad = (api.findMalformedAnnotations && api.findMalformedAnnotations(content)) || [];
    var proceed = bad.length
      ? uiConfirm('第 ' + bad.join('、') + ' 行的批注格式不正确，将无法被识别为批注。仍要保存吗？')
      : Promise.resolve(true);
    proceed.then(function (yes) {
      if (!yes) return;
      api.saveFile(currentFilePath, content).then(function (r) {
        if (r.success) {
          currentText = content;
          setDirtyState(false);
          if (typeof onSuccess === 'function') onSuccess();
          else {
            // 保存后仅刷新预览与批注面板，不重新 openFile（避免滚动位置回到开头）
            parseAndRender(content, currentFilePath);
            refreshEditorDecorations();
            updateToolbar();
          }
        } else {
          uiAlert('保存失败: ' + r.error);
        }
      });
    });
  }

  function handleAppCloseRequest() {
    if (!dirty) { api.confirmClose(); return; }
    if (closePromptOpen) return;
    closePromptOpen = true;
    uiCloseConfirm().then(function (choice) {
      closePromptOpen = false;
      if (choice === 'cancel') return;
      if (choice === 'discard') { api.confirmClose(); return; }
      // 保存后关闭
      saveFile(function () { api.confirmClose(); });
    });
  }

  function guardDiscard() {
    if (!dirty) return Promise.resolve(true);
    return uiConfirm('有未保存的修改，确定放弃吗？');
  }

  function requestOpen(filePath) {
    guardDiscard().then(function (yes) {
      // 仅切换到不同文件时回到文档开头；同文件重载（如 Ctrl+R）保留滚动位置
      if (yes) openFile(filePath, { scrollToTop: filePath !== currentFilePath });
    });
  }

  function updateToolbar() {
    if (tbEditBtn) {
      tbEditBtn.classList.toggle('active', editorVisible);
      tbEditBtn.disabled = !currentFilePath;
    }
    if (tbPanelBtn) tbPanelBtn.classList.toggle('active', panelVisible);
    if (tbFileNameEl) {
      var name = currentFilePath ? currentFilePath.replace(/\\/g, '/').split('/').pop() : '';
      tbFileNameEl.innerHTML = name ? (escHtml(name) + (dirty ? '<span class="dirty-dot">●</span>' : '')) : '';
    }
    if (addBtn) addBtn.disabled = !currentFilePath || dirty;
  }

  // ---- 拖拽打开 ----
  function setupDragAndDrop() {
    window.addEventListener('dragover', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var p = files[0].path;
      if (!p) return;
      if (/\.(md|markdown|txt)$/i.test(p)) requestOpen(p);
      else uiAlert('仅支持打开 .md / .markdown / .txt 文件');
    });
  }

  // ---- 预览区链接 ----
  function handleLinkClick(href) {
    if (!href) return;
    if (href.charAt(0) === '#') return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) { api.openExternal(href); return; }
    var clean = href.split('#')[0].split('?')[0];
    try { clean = decodeURIComponent(clean); } catch (e) { /* keep */ }
    if (!clean) return;
    if (/\.(md|markdown|txt)$/i.test(clean)) {
      var target = currentFilePath ? api.resolvePath(currentFilePath, clean) : clean;
      if (target) requestOpen(target);
      return;
    }
    var resolved = currentFilePath ? api.resolvePath(currentFilePath, clean) : clean;
    if (resolved) api.openExternal('file://' + resolved.replace(/\\/g, '/'));
  }

  function highlightCursorBlock(block) {
    var prev = previewEl.querySelector('.mda-cursor-block');
    if (prev) prev.classList.remove('mda-cursor-block');
    if (block) block.classList.add('mda-cursor-block');
  }

  // ---- 段落 ↔ 批注 ↔ DOM 映射 ----
  function mostSevere(annos) {
    var best = annos[0];
    for (var i = 1; i < annos.length; i++) {
      if ((LEVEL_ORDER[annos[i].level] || 0) > (LEVEL_ORDER[best.level] || 0)) best = annos[i];
    }
    return best;
  }

  function paragraphElement(p) {
    return p ? previewEl.querySelector('[data-line="' + p.startLine + '"]') : null;
  }

  function findParagraphForLine(line) {
    for (var i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].startLine <= line && line <= paragraphs[i].endLine) return paragraphs[i];
    }
    return null;
  }

  function findParagraphByAnnotationId(id) {
    for (var i = 0; i < paragraphs.length; i++) {
      var as = paragraphs[i].annotations || [];
      for (var j = 0; j < as.length; j++) {
        if (as[j].id === id) return paragraphs[i];
      }
    }
    return null;
  }

  function decorateParagraphs() {
    for (var i = 0; i < paragraphs.length; i++) {
      var p = paragraphs[i];
      if (!p.annotations || !p.annotations.length) continue;
      var el = paragraphElement(p);
      if (!el) continue;
      el.classList.add('mda-anno-block');
      el.style.borderLeft = '4px solid ' + LEVEL_COLORS[mostSevere(p.annotations).level];
      el.style.paddingLeft = '10px';
      el.style.cursor = 'pointer';
    }
  }

  function selectAnnotation(id, scrollPreview) {
    selectedAnnotationId = id;
    renderPanel();
    var item = annoListEl.querySelector('[data-anno-id="' + id + '"]');
    if (item) item.scrollIntoView({ block: 'nearest' });
    if (scrollPreview) {
      var el = paragraphElement(findParagraphByAnnotationId(id));
      if (el) { el.scrollIntoView({ block: 'center' }); highlightCursorBlock(el); }
    }
  }

  // ---- 文件操作 ----
  async function openFile(filePath, opts) {
    opts = opts || {};
    var scrollToTop = !!opts.scrollToTop;
    var savedScroll = null;
    if (!scrollToTop && editorEl) {
      savedScroll = {
        editorTop: editorEl.scrollTop,
        editorLeft: editorEl.scrollLeft,
        gutterTop: srcGutterEl ? srcGutterEl.scrollTop : 0,
        previewTop: previewPaneEl ? previewPaneEl.scrollTop : 0,
        selStart: editorEl.selectionStart,
        selEnd: editorEl.selectionEnd,
      };
    }
    var result = await api.readFile(filePath);
    if (!result.success) { uiAlert('无法打开文件: ' + result.error); return; }
    currentFilePath = filePath;
    currentText = result.content;
    setDirtyState(false);
    editorEl.value = result.content;
    if (scrollToTop) {
      editorEl.selectionStart = editorEl.selectionEnd = 0;
    } else if (savedScroll) {
      var len = result.content.length;
      editorEl.selectionStart = Math.min(savedScroll.selStart, len);
      editorEl.selectionEnd = Math.min(savedScroll.selEnd, len);
    }
    refreshEditorDecorations();
    setTitle(filePath);
    parseAndRender(result.content, filePath);
    updateToolbar();
    if (scrollToTop) {
      resetScrollTop();
      requestAnimationFrame(resetScrollTop);
    } else if (savedScroll) {
      editorEl.scrollTop = savedScroll.editorTop;
      editorEl.scrollLeft = savedScroll.editorLeft;
      if (srcGutterEl) srcGutterEl.scrollTop = savedScroll.gutterTop;
      if (srcHighlightEl) {
        var hp = srcHighlightEl.parentNode;
        hp.scrollTop = savedScroll.editorTop;
        hp.scrollLeft = savedScroll.editorLeft;
      }
      if (previewPaneEl) previewPaneEl.scrollTop = savedScroll.previewTop;
    }
  }

  // 编辑区（textarea/高亮层/行号槽）与预览区滚动位置归零
  function resetScrollTop() {
    if (editorEl) { editorEl.scrollTop = 0; editorEl.scrollLeft = 0; }
    if (srcHighlightEl) { var hp = srcHighlightEl.parentNode; hp.scrollTop = 0; hp.scrollLeft = 0; }
    if (srcGutterEl) srcGutterEl.scrollTop = 0;
    if (previewPaneEl) previewPaneEl.scrollTop = 0;
  }

  function setTitle(filePath) {
    if (filePath) {
      var name = filePath.replace(/\\/g, '/').split('/').pop();
      api.setTitle('MDA - ' + name);
    } else {
      api.setTitle('MDA');
    }
  }

  function reloadFile() { if (currentFilePath) openFile(currentFilePath, { scrollToTop: false }); }

  function parseAndRender(text, filePath) {
    var parsed = api.parseAnnotations(text);
    annotations = parsed.annotations;
    paragraphs = parsed.paragraphs;
    for (var i = 0; i < annotations.length; i++) {
      annotations[i].file = filePath || currentFilePath;
    }
    buildTagFilters();
    renderMarkdownContent(text);
    renderPanel();
  }

  // ---- Markdown 渲染 ----
  function renderMarkdownContent(text) {
    var result = api.renderMarkdown(text);
    if (!result.success) {
      previewEl.innerHTML = '<p style="color:var(--danger)">渲染错误: ' + escHtml(result.error) + '</p>';
      return;
    }
    htmlContent = result.html;
    previewEl.innerHTML = htmlContent;

    resolveImages();       // 相对/本地图片 → 绝对 file:// URL
    setupImageFallback();
    renderMermaidBlocks().then(function () {
      enhanceCodeBlocks(); // mermaid 块已被替换，剩余代码块加行号/复制/菜单
      decorateParagraphs();
    });
  }

  // ---- 图片：相对/本地路径 → 绝对 file://，并绑定点击放大 ----
  function resolveImages() {
    var imgs = previewEl.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.getAttribute('src') || '';
      if (src && !/^(https?:|data:|file:)/i.test(src) && currentFilePath) {
        var abs = api.resolvePath(currentFilePath, src);
        if (abs) img.setAttribute('src', 'file:///' + abs.replace(/\\/g, '/').replace(/^\/+/, ''));
      }
      if (!img.dataset.zoomReady) {
        img.dataset.zoomReady = '1';
        img.addEventListener('click', function (e) {
          e.stopPropagation();
          var z = new Image();
          z.src = this.src;
          openZoom(z);
        });
      }
    }
  }

  function setupImageFallback() {
    var imgs = previewEl.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        if (img.dataset.fallbackReady) return;
        img.dataset.fallbackReady = '1';
        img.addEventListener('error', function () {
          img.style.display = 'none';
          var next = img.nextElementSibling;
          if (next && next.classList.contains('md-image-alt')) next.style.display = 'inline';
        });
      })(imgs[i]);
    }
  }

  // ---- 代码块增强 ----
  function enhanceCodeBlocks() {
    var pres = previewEl.querySelectorAll('pre');
    for (var i = 0; i < pres.length; i++) {
      var pre = pres[i];
      if (pre.parentNode && pre.parentNode.classList && pre.parentNode.classList.contains('mda-code-scroll')) continue;
      var code = pre.querySelector('code');
      if (!code) continue;
      enhanceOneCodeBlock(pre, code);
    }
  }

  function enhanceOneCodeBlock(pre, code) {
    var rawText = code.textContent.replace(/\n$/, '');
    var lineCount = rawText.split('\n').length;

    var nums = [];
    for (var n = 1; n <= lineCount; n++) nums.push(n);
    var gutter = document.createElement('div');
    gutter.className = 'mda-code-gutter';
    gutter.setAttribute('aria-hidden', 'true');
    gutter.textContent = nums.join('\n');

    var scroll = document.createElement('div');
    scroll.className = 'mda-code-scroll';

    var container = document.createElement('div');
    container.className = 'mda-code';
    container.setAttribute('tabindex', '0');

    var copyBtn = document.createElement('button');
    copyBtn.className = 'mda-code-copy';
    copyBtn.type = 'button';
    copyBtn.textContent = '复制';

    pre.classList.add('mda-code-pre');
    pre.parentNode.insertBefore(container, pre);
    scroll.appendChild(pre);
    container.appendChild(copyBtn);
    container.appendChild(gutter);
    container.appendChild(scroll);

    copyBtn.addEventListener('click', function (e) { e.stopPropagation(); copyCode(rawText, copyBtn); });
    container.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showCodeContextMenu(e.clientX, e.clientY, code, rawText, copyBtn);
    });
    container.addEventListener('keydown', function (e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      var key = (e.key || '').toLowerCase();
      if (key === 'a') { e.preventDefault(); selectCodeContents(code); }
      else if (key === 'c') {
        e.preventDefault();
        var sel = window.getSelection ? String(window.getSelection()) : '';
        copyCode(sel || rawText, copyBtn);
      }
    });
  }

  function selectCodeContents(code) {
    var range = document.createRange();
    range.selectNodeContents(code);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function copyCode(text, btn) {
    api.copyToClipboard(text);
    if (btn) {
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1200);
    }
  }

  var codeMenuDismiss = null;

  function removeCodeContextMenu() {
    var m = document.getElementById('mda-code-menu');
    if (m) m.remove();
    if (codeMenuDismiss) {
      document.removeEventListener('click', codeMenuDismiss, true);
      document.removeEventListener('contextmenu', codeMenuDismiss, true);
      window.removeEventListener('blur', codeMenuDismiss);
      codeMenuDismiss = null;
    }
  }

  function showCodeContextMenu(x, y, code, rawText, btn) {
    removeCodeContextMenu();
    var menu = document.createElement('div');
    menu.id = 'mda-code-menu';
    menu.className = 'mda-context-menu';
    menu.innerHTML =
      '<div class="mda-menu-item" data-act="copy"><span>拷贝</span><span class="mda-menu-key">' + MOD_KEY + 'C</span></div>' +
      '<div class="mda-menu-item" data-act="copy-all"><span>拷贝全部</span><span class="mda-menu-key">' + MOD_KEY + 'A</span></div>';
    document.body.appendChild(menu);
    menu.style.left = Math.min(x, window.innerWidth - menu.offsetWidth - 4) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 4) + 'px';

    menu.addEventListener('click', function (e) {
      var item = e.target.closest('[data-act]');
      if (!item) return;
      if (item.dataset.act === 'copy') {
        var sel = window.getSelection ? String(window.getSelection()) : '';
        copyCode(sel || rawText, btn);
      } else {
        copyCode(rawText, btn);
      }
      removeCodeContextMenu();
    });

    codeMenuDismiss = function (ev) {
      if (ev.type === 'click' && menu.contains(ev.target)) return;
      removeCodeContextMenu();
    };
    setTimeout(function () {
      document.addEventListener('click', codeMenuDismiss, true);
      document.addEventListener('contextmenu', codeMenuDismiss, true);
      window.addEventListener('blur', codeMenuDismiss);
    }, 0);
  }

  // ---- 批注面板 ----
  function buildTagFilters() {
    var allTags = {};
    for (var i = 0; i < annotations.length; i++) {
      var tags = annotations[i].tags || [];
      for (var t = 0; t < tags.length; t++) allTags[tags[t]] = true;
    }
    filterTags = {};
    var keys = Object.keys(allTags).sort();
    for (var k = 0; k < keys.length; k++) filterTags[keys[k]] = true;
  }

  function renderTagFilterUI() {
    var keys = Object.keys(filterTags).sort();
    if (keys.length === 0) { tagFiltersRow.style.display = 'none'; return; }
    tagFiltersRow.style.display = '';
    var html = '';
    for (var k = 0; k < keys.length; k++) {
      var c = filterTags[keys[k]] ? 'checked' : '';
      html += '<label style="margin-right:8px;cursor:pointer;font-size:11px">' +
        '<input type="checkbox" ' + c + ' data-tag="' + escHtml(keys[k]) + '">' + escHtml(keys[k]) + '</label>';
    }
    tagFiltersEl.innerHTML = html;
    var cbs = tagFiltersEl.querySelectorAll('input[type=checkbox]');
    for (var c = 0; c < cbs.length; c++) {
      cbs[c].addEventListener('change', function () { filterTags[this.dataset.tag] = this.checked; renderPanel(); });
    }
  }

  function renderStatusFilterUI() {
    var html = '';
    ['open', 'resolved', 'wontfix'].forEach(function (s) {
      var c = filterStatus[s] ? 'checked' : '';
      html += '<label style="margin-right:8px;cursor:pointer;font-size:11px">' +
        '<input type="checkbox" ' + c + ' data-status="' + s + '">' + s + '</label>';
    });
    statusFiltersEl.innerHTML = html;
    var cbs = statusFiltersEl.querySelectorAll('input');
    for (var c = 0; c < cbs.length; c++) {
      cbs[c].addEventListener('change', function () { filterStatus[this.dataset.status] = this.checked; renderPanel(); });
    }
  }

  function renderLevelFilterUI() {
    var html = '';
    ['critical', 'major', 'minor', 'info'].forEach(function (l) {
      var c = filterLevel[l] ? 'checked' : '';
      html += '<label style="margin-right:8px;cursor:pointer;font-size:11px">' +
        '<input type="checkbox" ' + c + ' data-level="' + l + '">' +
        '<span style="color:' + LEVEL_COLORS[l] + ';font-weight:bold">' + l + '</span></label>';
    });
    levelFiltersEl.innerHTML = html;
    var cbs = levelFiltersEl.querySelectorAll('input');
    for (var c = 0; c < cbs.length; c++) {
      cbs[c].addEventListener('change', function () { filterLevel[this.dataset.level] = this.checked; renderPanel(); });
    }
  }

  function getFilteredAnnotations() {
    return annotations.filter(function (a) {
      if (!filterStatus[a.status]) return false;
      if (!filterLevel[a.level]) return false;
      if (a.tags.length > 0 && Object.keys(filterTags).length > 0) {
        var hasTag = false;
        for (var t = 0; t < a.tags.length; t++) { if (filterTags[a.tags[t]]) { hasTag = true; break; } }
        if (!hasTag) return false;
      }
      return true;
    }).sort(function (a, b) { return (a.line || 0) - (b.line || 0); });
  }

  function renderPanel() {
    renderStatusFilterUI();
    renderLevelFilterUI();
    renderTagFilterUI();

    var filtered = getFilteredAnnotations();
    var html = '';

    for (var i = 0; i < filtered.length; i++) {
      var a = filtered[i];
      var selCls = a.id === selectedAnnotationId ? ' selected' : '';
      var content = (a.content || '').length > 50 ? a.content.slice(0, 50) + '…' : (a.content || '');

      html += '<div class="anno-item' + selCls + '" data-anno-id="' + escHtml(a.id) + '">' +
        '<div class="anno-meta">' +
        '<span style="border-left:3px solid ' + LEVEL_COLORS[a.level] + ';padding-left:4px;margin-right:8px"></span>' +
        '行' + (a.line || '?') + ' · ' +
        '<span style="color:' + LEVEL_COLORS[a.level] + ';font-weight:bold">' + a.level + '</span> · ' +
        '<span>' + a.status + '</span> · ' + (a.created_at || '').slice(0, 10) +
        '</div>' +
        '<div class="anno-content">' + escHtml(content) + '</div>' +
        '<div class="anno-tags">' +
        (a.tags || []).map(function (t) { return '<span class="anno-tag">' + escHtml(t) + '</span>'; }).join('') +
        '</div>' +
        '<div class="anno-actions">' +
        '<button class="btn-mini btn-edit" data-id="' + escHtml(a.id) + '">编辑</button>' +
        '<button class="btn-mini danger btn-del" data-id="' + escHtml(a.id) + '">删除</button>' +
        '</div></div>';
    }

    if (filtered.length === 0) html = '<div class="anno-empty">无批注</div>';

    annoListEl.innerHTML = html;
    if (addBtn) addBtn.disabled = !currentFilePath || dirty;

    var items = annoListEl.querySelectorAll('[data-anno-id]');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        selectAnnotation(this.dataset.annoId, true);
      });
    }
    var edits = annoListEl.querySelectorAll('.btn-edit');
    for (var e = 0; e < edits.length; e++) {
      edits[e].addEventListener('click', function (e) { e.stopPropagation(); editAnnotation(this.dataset.id); });
    }
    var dels = annoListEl.querySelectorAll('.btn-del');
    for (var d = 0; d < dels.length; d++) {
      dels[d].addEventListener('click', function (e) { e.stopPropagation(); deleteAnnotation(this.dataset.id); });
    }
  }

  function ensureNotDirty() {
    if (dirty) { uiAlert('存在未保存的编辑，请先保存或撤销后再操作批注'); return false; }
    return true;
  }

  function editAnnotation(id) {
    if (!ensureNotDirty()) return;
    var anno = findAnno(id);
    if (!anno) return;
    showEditDialog('edit', anno, null);
  }

  function deleteAnnotation(id) {
    if (!ensureNotDirty()) return;
    uiConfirm('确认删除此批注？').then(function (yes) {
      if (!yes) return;
      api.removeAnnotation(currentFilePath, id).then(function (r) {
        if (r.success) {
          if (selectedAnnotationId === id) selectedAnnotationId = null;
          reloadFile();
        } else { uiAlert('删除失败: ' + r.error); }
      });
    });
  }

  function findAnno(id) {
    for (var i = 0; i < annotations.length; i++) { if (annotations[i].id === id) return annotations[i]; }
    return null;
  }

  // ---- DOM 弹窗 ----
  function uiModal(message, withCancel) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      var btns = withCancel ? '<button id="ui-cancel" class="btn-ghost">取消</button>' : '';
      overlay.innerHTML =
        '<div class="modal-box" style="min-width:280px;max-width:420px">' +
          '<div style="font-size:14px;margin-bottom:20px;line-height:1.6">' + escHtml(message) + '</div>' +
          '<div class="modal-actions">' + btns +
            '<button id="ui-ok" class="btn-ok">确定</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      function close(val) { overlay.remove(); resolve(val); }
      overlay.querySelector('#ui-ok').addEventListener('click', function () { close(true); });
      var cancelBtn = overlay.querySelector('#ui-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', function () { close(false); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
      var ok = overlay.querySelector('#ui-ok');
      if (ok) ok.focus();
    });
  }

  function uiConfirm(message) { return uiModal(message, true); }
  function uiAlert(message) { return uiModal(message, false); }

  // 关闭应用前三选一：保存 / 不保存 / 取消（DOM 弹窗，不用原生 dialog）
  function uiCloseConfirm() {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML =
        '<div class="modal-box" style="min-width:320px">' +
          '<div style="font-size:14px;margin-bottom:20px;line-height:1.6">有未保存的修改，是否在关闭前保存？</div>' +
          '<div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">' +
            '<button id="ui-discard" class="btn-ghost">不保存</button>' +
            '<button id="ui-cancel" class="btn-ghost">取消</button>' +
            '<button id="ui-save" class="btn-ok">保存</button>' +
          '</div></div>';
      document.body.appendChild(overlay);
      function close(val) { overlay.remove(); resolve(val); }
      overlay.querySelector('#ui-save').addEventListener('click', function () { close('save'); });
      overlay.querySelector('#ui-discard').addEventListener('click', function () { close('discard'); });
      overlay.querySelector('#ui-cancel').addEventListener('click', function () { close('cancel'); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close('cancel'); });
      overlay.querySelector('#ui-save').focus();
    });
  }

  // ---- 编辑/添加批注弹窗 ----
  function showEditDialog(mode, anno, defaultLine) {
    if (!ensureNotDirty()) return;
    var existing = document.getElementById('edit-dialog');
    if (existing) existing.remove();

    var isAdd = mode === 'add';
    var title = isAdd ? '添加批注' : '编辑批注';

    var overlay = document.createElement('div');
    overlay.id = 'edit-dialog';
    overlay.className = 'modal-overlay';

    var formHtml = '<div class="modal-box" style="width:440px"><h3>' + title + '</h3>';

    if (isAdd) {
      formHtml += '<div class="modal-field"><label>行号</label>' +
        '<input id="ed-line" type="number" min="1" value="' + (defaultLine || '') + '"></div>';
    }

    formHtml +=
      '<div class="modal-field"><label>内容</label>' +
        '<textarea id="ed-content" rows="3">' + (anno ? escHtml(anno.content) : '') + '</textarea></div>' +
      '<div class="modal-field"><label>标签（逗号分隔）</label>' +
        '<input id="ed-tags" value="' + (anno ? (anno.tags || []).join(', ') : '') + '"></div>' +
      '<div style="display:flex;gap:12px" class="modal-field">' +
        '<div style="flex:1"><label>级别</label>' +
          '<select id="ed-level">' +
          '<option value="info"' + (anno && anno.level === 'info' ? ' selected' : '') + '>info</option>' +
          '<option value="minor"' + (anno && anno.level === 'minor' ? ' selected' : '') + '>minor</option>' +
          '<option value="major"' + (anno && anno.level === 'major' ? ' selected' : '') + '>major</option>' +
          '<option value="critical"' + (anno && anno.level === 'critical' ? ' selected' : '') + '>critical</option>' +
          '</select></div>';

    if (!isAdd) {
      formHtml +=
        '<div style="flex:1"><label>状态</label>' +
          '<select id="ed-status">' +
          '<option value="open"' + (anno && anno.status === 'open' ? ' selected' : '') + '>open</option>' +
          '<option value="resolved"' + (anno && anno.status === 'resolved' ? ' selected' : '') + '>resolved</option>' +
          '<option value="wontfix"' + (anno && anno.status === 'wontfix' ? ' selected' : '') + '>wontfix</option>' +
          '</select></div>';
    }

    formHtml += '</div>';
    formHtml +=
      '<div class="modal-actions">' +
      '<button id="ed-cancel" class="btn-ghost">取消</button>' +
      '<button id="ed-save" class="btn-ok">保存</button>' +
      '</div></div>';

    overlay.innerHTML = formHtml;
    document.body.appendChild(overlay);

    document.getElementById('ed-cancel').addEventListener('click', function () { overlay.remove(); });
    document.getElementById('ed-save').addEventListener('click', function () {
      var content = document.getElementById('ed-content').value.trim();
      if (!content) { uiAlert('请输入批注内容'); return; }
      var tags = document.getElementById('ed-tags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
      var level = document.getElementById('ed-level').value;
      if (isAdd) {
        var line = parseInt(document.getElementById('ed-line').value, 10);
        if (isNaN(line) || line < 1) { uiAlert('请输入有效行号'); return; }
        doAdd(line, content, tags, level);
      } else {
        var status = document.getElementById('ed-status').value;
        doEdit(anno.id, content, tags, level, status);
      }
      overlay.remove();
    });

    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(function () {
      var first = document.getElementById(isAdd ? 'ed-line' : 'ed-content');
      if (first) first.focus();
    });
  }

  function doAdd(line, content, tags, level) {
    api.addAnnotation(currentFilePath, line, { content: content, tags: tags, level: level })
      .then(function (r) { if (r.success) reloadFile(); else uiAlert('添加失败: ' + r.error); });
  }

  function doEdit(id, content, tags, level, status) {
    api.editAnnotation(currentFilePath, id, { content: content, tags: tags, level: level, status: status })
      .then(function (r) { if (r.success) reloadFile(); else uiAlert('编辑失败: ' + r.error); });
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  init();
})();

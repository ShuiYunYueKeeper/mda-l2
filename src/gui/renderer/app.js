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

  // 文档状态机：welcome | untitled | open（见 P2 §4.1）
  var docState = 'welcome';
  var workspaceRoot = null;
  var welcomePane = null;
  var fileSidebar = null;
  var contentRowEl = null;
  var leftRailEl = null;
  var syncScrollCtrl = null;
  var findReplaceUi = null;
  var outlinePanelUi = null;
  var assist = null;
  var selAnchor = null;
  var anchorHl = null;
  var selectionMenuDismiss = null;
  var previewSelectionSnap = null;
  var previewPointer = { down: false, dragged: false, x: 0, y: 0 };

  var filterStatus = { open: true, resolved: true, wontfix: true };
  var filterLevel = { critical: true, major: true, minor: true, info: true };
  var filterTags = {};

  var LEVEL_COLORS = (api && api.levelColors) || { critical: '#e74c3c', major: '#e67e22', minor: '#f1c40f', info: '#95a5a6' };
  var LEVEL_ORDER = (api && api.levelSeverity) || { critical: 3, major: 2, minor: 1, info: 0 };

  // DOM 元素
  var previewEl, annoListEl, statusFiltersEl, levelFiltersEl, tagFiltersEl, tagFiltersRow;
  var previewPaneEl, editorPaneEl, editorEl, panelPaneEl;
  var srcGutterEl, srcHighlightEl, srcFindMarkEl, splitLeftEl, splitRightEl;
  var findMatchState = null; // { matches: [{start,end}], index: number }
  var tbEditBtn, tbPanelBtn, tbFileNameEl, addBtn;

  var MOD_KEY = (navigator.platform || '').toLowerCase().indexOf('mac') >= 0 ? '\u2318' : 'Ctrl+';

  // ---- 初始化 ----
  function init() {
    buildLayout();
    initTheme();
    initMermaid();

    api.onFileOpened(function (filePath) { requestOpen(filePath); });
    api.onSessionWelcome(function () { setDocState('welcome'); });
    api.onReload(function () { if (currentFilePath) requestOpen(currentFilePath); });
    api.onMenuShowInFolder(function () {
      if (currentFilePath) api.showItemInFolder(currentFilePath);
      else uiAlert('请先打开一个文件');
    });
    api.onMenuToggleTheme(function () { toggleTheme(); });
    api.onMenuToggleEdit(function () { toggleEditor(); });
    api.onMenuTogglePanel(function () { togglePanel(); });
    api.onMenuSave(function () { saveFile(); });
    api.onMenuSaveAs(function () { saveAs(); });
    api.onMenuNewDocument(function () { newDocument(); });
    api.onMenuOpenFolder(function () { openWorkspaceFolder(); });
    api.onMenuShowHelp(function () { showHelpDialog(); });
    api.onMenuCopyArticle(function () { copyPreviewForArticle(); });
    api.onMenuExportHtml(function () { exportPreviewHtml(); });
    api.onMenuExportPdf(function () { exportPreviewPdf(); });
    api.onAppCloseRequest(function () { handleAppCloseRequest(); });

    setupDragAndDrop();
    window.addEventListener('keydown', function (e) {
      if (findReplaceUi && findReplaceUi.isOpen()) {
        var t = e.target;
        if (t && t.closest && t.closest('#find-replace-bar')) return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        showHelpDialog();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      var k = (e.key || '').toLowerCase();
      if (k === 's' && e.shiftKey) {
        e.preventDefault();
        saveAs();
        return;
      }
      if (k === 'f' && !e.shiftKey) {
        if (docState !== 'welcome' && findReplaceUi) {
          e.preventDefault();
          if (!editorVisible) showEditorPane(true);
          findReplaceUi.show('find');
        }
        return;
      }
      if (k === 'h' && !e.shiftKey) {
        if (docState !== 'welcome' && findReplaceUi) {
          e.preventDefault();
          if (!editorVisible) showEditorPane(true);
          findReplaceUi.show('replace');
        }
        return;
      }
      if (k === 'g' && !e.shiftKey) {
        e.preventDefault();
        showGotoLineDialog();
        return;
      }
      if (k === 'n') {
        e.preventDefault();
        newDocument();
        return;
      }
      if (k === '\\' && !e.shiftKey) {
        if (workspaceRoot && leftRailEl && !leftRailEl.classList.contains('hidden') && fileSidebar) {
          e.preventDefault();
          fileSidebar.toggleCollapsed();
        }
        return;
      }
      if (k === 's') {
        e.preventDefault();
        saveFile();
      }
    });

    mountFileUi();
    mountM3Modules();
    mountM4Modules();
    refreshWelcomeRecents();
    updateToolbar();
  }

  function mountM3Modules() {
    assist = window.MDAEditorAssist || null;
    if (window.MDAFindReplace && editorPaneEl) {
      findReplaceUi = window.MDAFindReplace.mount(editorPaneEl, editorEl, function () {
        setDirtyState(editorEl.value !== currentText);
      }, {
        onMatchesChange: function (matches, index, opts) {
          opts = opts || {};
          if (!opts.query) {
            findMatchState = null;
          } else {
            findMatchState = {
              matches: matches || [],
              index: index,
              query: opts.query,
              caseSensitive: !!opts.caseSensitive,
              regex: !!opts.regex,
            };
          }
          updateFindHighlights();
        },
        syncEditorScroll: syncEditorScrollLayers,
      });
    }
    var outlineHost = document.getElementById('outline-host');
    if (window.MDAOutlinePanel && outlineHost) {
      outlinePanelUi = window.MDAOutlinePanel.mount(outlineHost, function (line) {
        if (!editorVisible) showEditorPane(true);
        if (syncScrollCtrl) syncScrollCtrl.scrollEditorToLine(line);
        else jumpEditorToLine(line);
      });
    }
    if (window.MDASyncScroll && editorEl && previewPaneEl && previewEl) {
      syncScrollCtrl = window.MDASyncScroll.attach(editorEl, previewPaneEl, previewEl, function () {
        return editorEl.value;
      });
    }
    setupEditorAssistKeys();
  }

  function getSourceText() {
    if (dirty && editorEl) return editorEl.value;
    return currentText || (editorEl ? editorEl.value : '');
  }

  function mountM4Modules() {
    selAnchor = window.MDASelectionAnchor || null;
    anchorHl = window.MDAAnchorHighlights || null;
    setupSelectionContextMenus();
  }

  function applyAnchorHighlights() {
    if (!anchorHl || !previewEl) return;
    if (!annotations.length) {
      anchorHl.clearAnnotationHighlights(previewEl);
      return;
    }
    anchorHl.applyAnnotationHighlights(previewEl, annotations, getSourceText(), {
      validateAnchor: selAnchor ? selAnchor.validateAnchor : null,
      anchorToPreviewRange: selAnchor ? selAnchor.anchorToPreviewRange : null,
      isAnchorStale: selAnchor ? selAnchor.isAnchorStale : null,
    });
  }

  function scrollPreviewToRange(range) {
    if (!range || !previewPaneEl) return;
    try {
      var rect = range.getBoundingClientRect();
      var pane = previewPaneEl.getBoundingClientRect();
      var relTop = rect.top - pane.top + previewPaneEl.scrollTop;
      previewPaneEl.scrollTop = Math.max(0, relTop - previewPaneEl.clientHeight * 0.35);
    } catch (e) { /* ignore */ }
  }

  function resolveSelectionAnchor(source, snapshot) {
    if (!selAnchor) return null;
    var text = getSourceText();
    if (source === 'preview') {
      var snap = snapshot || previewSelectionSnap;
      var r = selAnchor.selectionFromPreview(previewEl, text, snap || undefined);
      return r;
    }
    return selAnchor.selectionFromEditor(editorEl);
  }

  function capturePreviewSelection(sel) {
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var quote = sel.toString();
    if (!quote) return null;
    try {
      return { quote: quote, range: sel.getRangeAt(0).cloneRange() };
    } catch (e) {
      return null;
    }
  }

  function clearPreviewSelectionSnap() {
    previewSelectionSnap = null;
  }

  function removeSelectionContextMenu() {
    var m = document.getElementById('mda-selection-menu');
    if (m) m.remove();
    if (selectionMenuDismiss) {
      document.removeEventListener('click', selectionMenuDismiss, true);
      document.removeEventListener('contextmenu', selectionMenuDismiss, true);
      window.removeEventListener('blur', selectionMenuDismiss);
      selectionMenuDismiss = null;
    }
  }

  function showSelectionContextMenu(x, y, source, snapshot) {
    if (docState === 'welcome' || !currentFilePath) return;
    if (!ensureNotDirty()) return;
    if (source === 'preview') {
      previewSelectionSnap = snapshot || previewSelectionSnap;
      if (!previewSelectionSnap) return;
      if (selAnchor && selAnchor.isSelectionUiChrome(previewSelectionSnap.range.commonAncestorContainer)) {
        return;
      }
    }
    removeSelectionContextMenu();
    var menu = document.createElement('div');
    menu.id = 'mda-selection-menu';
    menu.className = 'mda-context-menu';
    menu.innerHTML = '<div class="mda-menu-item" data-act="anno"><span>添加选区批注</span></div>';
    document.body.appendChild(menu);
    menu.style.left = Math.min(x, window.innerWidth - menu.offsetWidth - 4) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 4) + 'px';
    menu.addEventListener('click', function (e) {
      var item = e.target.closest('[data-act]');
      if (!item) return;
      var anchor = resolveSelectionAnchor(source, source === 'preview' ? previewSelectionSnap : null);
      removeSelectionContextMenu();
      clearPreviewSelectionSnap();
      if (!anchor) {
        uiAlert('无法识别选区，请尝试在源码编辑区选择');
        return;
      }
      var line = selAnchor.anchorToLine(getSourceText(), anchor.start);
      showEditDialog('add', null, line, anchor);
    });
    selectionMenuDismiss = function (ev) {
      if (ev.type === 'click' && menu.contains(ev.target)) return;
      removeSelectionContextMenu();
      clearPreviewSelectionSnap();
    };
    setTimeout(function () {
      document.addEventListener('click', selectionMenuDismiss, true);
      document.addEventListener('contextmenu', selectionMenuDismiss, true);
      window.addEventListener('blur', selectionMenuDismiss);
    }, 0);
  }

  function setupSelectionContextMenus() {
    if (previewPaneEl) {
      previewPaneEl.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        previewPointer.down = true;
        previewPointer.dragged = false;
        previewPointer.x = e.clientX;
        previewPointer.y = e.clientY;
      });
      previewPaneEl.addEventListener('mousemove', function (e) {
        if (!previewPointer.down) return;
        if (Math.abs(e.clientX - previewPointer.x) > 4 || Math.abs(e.clientY - previewPointer.y) > 4) {
          previewPointer.dragged = true;
        }
      });
      document.addEventListener('mouseup', function () {
        previewPointer.down = false;
      });
      previewPaneEl.addEventListener('contextmenu', function (e) {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
        if (!previewEl || !previewEl.contains(sel.anchorNode)) return;
        if (selAnchor && selAnchor.isSelectionUiChrome(sel.anchorNode)) return;
        if (selAnchor && selAnchor.isFenceCodeNode(sel.anchorNode)) return;
        e.preventDefault();
        e.stopPropagation();
        previewSelectionSnap = capturePreviewSelection(sel);
        if (!previewSelectionSnap) return;
        showSelectionContextMenu(e.clientX, e.clientY, 'preview', previewSelectionSnap);
      }, true);
    }
    if (editorEl) {
      editorEl.addEventListener('contextmenu', function (e) {
        if (editorEl.selectionStart === editorEl.selectionEnd) return;
        e.preventDefault();
        showSelectionContextMenu(e.clientX, e.clientY, 'editor');
      });
    }
  }

  function getFenceMask() {
    if (!api.buildCodeFenceMask || !editorEl) return null;
    return api.buildCodeFenceMask(editorEl.value.split('\n'));
  }

  function syncEditorScrollLayers() {
    if (!editorEl) return;
    var hp = srcHighlightEl ? srcHighlightEl.parentNode : null;
    if (hp) {
      hp.scrollTop = editorEl.scrollTop;
      hp.scrollLeft = editorEl.scrollLeft;
    }
    if (srcFindMarkEl) {
      srcFindMarkEl.scrollTop = editorEl.scrollTop;
      srcFindMarkEl.scrollLeft = editorEl.scrollLeft;
    }
    if (srcGutterEl) srcGutterEl.scrollTop = editorEl.scrollTop;
  }

  function updateFindMarkLayer() {
    if (!srcFindMarkEl) return;
    var code = srcFindMarkEl.querySelector('code') || srcFindMarkEl;
    if (!findMatchState || !findMatchState.matches.length) {
      code.innerHTML = '';
      return;
    }
    var text = editorEl.value;
    var matches = findMatchState.matches;
    var activeIndex = findMatchState.index;
    var html = '';
    var last = 0;
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      html += escHtml(text.slice(last, m.start));
      var cls = i === activeIndex ? 'mda-find-active' : 'mda-find-mark';
      html += '<span class="' + cls + '">' + escHtml(text.slice(m.start, m.end)) + '</span>';
      last = m.end;
    }
    html += escHtml(text.slice(last));
    code.innerHTML = html;
  }

  function updateFindHighlights() {
    updateFindMarkLayer();
    updateFindPreviewHighlights();
  }

  function clearPreviewFindHighlights() {
    if (!previewEl) return;
    var marks = previewEl.querySelectorAll('mark.mda-preview-find, mark.mda-preview-find-active');
    for (var i = 0; i < marks.length; i++) {
      var mark = marks[i];
      var parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if (parent.normalize) parent.normalize();
    }
  }

  function getActiveFindLine() {
    if (!findMatchState || !findMatchState.matches.length || findMatchState.index < 0) return null;
    var m = findMatchState.matches[findMatchState.index];
    return editorEl.value.slice(0, m.start).split('\n').length;
  }

  function updateFindPreviewHighlights() {
    clearPreviewFindHighlights();
    if (!previewEl || !findMatchState || !findMatchState.query) return;
    if (!window.MDAFindReplace || !window.MDAFindReplace.findAll) return;

    var query = findMatchState.query;
    var opts = {
      caseSensitive: findMatchState.caseSensitive,
      regex: findMatchState.regex,
    };
    var activeLine = getActiveFindLine();
    var activeRef = { el: null };
    var walker = document.createTreeWalker(previewEl, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('code, pre, .mda-code')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (var n = 0; n < nodes.length; n++) {
      highlightPreviewTextNode(nodes[n], query, opts, activeLine, activeRef);
    }

    if (activeRef.el) {
      activeRef.el.scrollIntoView({ block: 'center', behavior: 'auto' });
    } else if (activeLine) {
      var block = previewEl.querySelector('[data-line="' + activeLine + '"]');
      if (block) block.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }

  function highlightPreviewTextNode(node, query, opts, activeLine, activeRef) {
    if (!node || !node.textContent) return;
    var matches = window.MDAFindReplace.findAll(node.textContent, query, opts);
    if (!matches.length) return;
    for (var i = matches.length - 1; i >= 0; i--) {
      var m = matches[i];
      if (m.end > node.textContent.length) continue;
      var range = document.createRange();
      range.setStart(node, m.start);
      range.setEnd(node, m.end);
      var mark = document.createElement('mark');
      var block = node.parentElement ? node.parentElement.closest('[data-line]') : null;
      var line = block ? parseInt(block.getAttribute('data-line'), 10) : -1;
      var isActive = activeLine && line === activeLine && !activeRef.el;
      mark.className = isActive ? 'mda-preview-find-active' : 'mda-preview-find';
      try {
        range.surroundContents(mark);
        if (isActive) activeRef.el = mark;
      } catch (e) { /* 跨节点边界时跳过 */ }
    }
  }

  function clearFindMarkLayer() {
    findMatchState = null;
    updateFindHighlights();
  }

  function jumpEditorToLine(line) {
    if (!editorEl) return;
    var lines = editorEl.value.split('\n');
    var idx = Math.max(0, Math.min(line - 1, lines.length - 1));
    var pos = lines.slice(0, idx).join('\n').length + (idx > 0 ? 1 : 0);
    editorEl.focus();
    editorEl.selectionStart = editorEl.selectionEnd = pos;
    editorEl.scrollTop = Math.max(0, (line - 1) * 21 - editorEl.clientHeight * 0.3);
  }

  function setupEditorAssistKeys() {
    if (!editorEl || !assist) return;
    document.addEventListener('keydown', function (e) {
      if (!tryEditorAssistShortcut(e)) return;
    }, true);
  }

  function tryEditorAssistShortcut(e) {
    if (docState === 'welcome' || !editorVisible) return false;
    if (findReplaceUi && findReplaceUi.isOpen()) return false;
    var ae = document.activeElement;
    if (ae && ae.closest && (ae.closest('#find-replace-bar') || ae.closest('.modal-overlay'))) return false;
    if (e.key === 'Tab' && ae !== editorEl) return false;
    if (ae !== editorEl) {
      if (!(e.ctrlKey || e.metaKey) && e.key !== 'Tab') return false;
      editorEl.focus();
    }

    var mod = e.ctrlKey || e.metaKey;
    if (!mod && e.key !== 'Tab') return false;

    var start = editorEl.selectionStart;
    var end = editorEl.selectionEnd;
    var val = editorEl.value;
    var mask = getFenceMask();
    var result = null;

    if (mod && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      result = assist.wrapSelection(val, start, end, '**', '**', 'text');
    } else if (mod && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      result = assist.wrapSelection(val, start, end, '*', '*', 'text');
    } else if (mod && !e.shiftKey && e.key === '`') {
      e.preventDefault();
      result = assist.wrapSelection(val, start, end, '`', '`', 'code');
    } else if (mod && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      result = assist.wrapSelection(val, start, end, '~~', '~~', 'text');
    } else if (mod && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      result = assist.insertLink(val, start, end);
    } else if (mod && e.shiftKey && e.key === '`') {
      e.preventDefault();
      result = assist.wrapCodeFence(val, start, end, '');
    } else if (mod && e.shiftKey && e.key === '-') {
      e.preventDefault();
      result = assist.insertHorizontalRule(val, start, mask);
    } else if (mod && e.shiftKey && isHeadingUpKey(e)) {
      e.preventDefault();
      result = assist.toggleHeadingLevel(val, start, 1, mask);
    } else if (mod && e.shiftKey && isHeadingDownKey(e)) {
      e.preventDefault();
      result = assist.toggleHeadingLevel(val, start, -1, mask);
    } else if (mod && e.shiftKey && e.key === '8') {
      e.preventDefault();
      result = assist.toggleLinePrefix(val, start, end, '- ', mask);
    } else if (mod && e.shiftKey && e.key === '7') {
      e.preventDefault();
      result = assist.toggleLinePrefix(val, start, end, '1. ', mask);
    } else if (mod && e.shiftKey && e.key === '.') {
      e.preventDefault();
      result = assist.toggleLinePrefix(val, start, end, '> ', mask);
    } else if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      result = assist.duplicateLine(val, start, mask);
    } else if (mod && !e.shiftKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      result = assist.setHeadingLevel(val, start, parseInt(e.key, 10), mask);
    } else if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      result = assist.moveLine(val, start, -1, mask);
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      result = assist.moveLine(val, start, 1, mask);
    } else if (e.key === 'Tab' && !mod) {
      e.preventDefault();
      result = assist.indentLines(val, start, end, e.shiftKey ? -2 : 2, mask);
    }

    if (result) {
      applyAssistResult(result);
      return true;
    }
    return false;
  }

  function isHeadingUpKey(e) {
    return e.code === 'BracketRight' || e.key === ']' || e.key === '}';
  }

  function isHeadingDownKey(e) {
    return e.code === 'BracketLeft' || e.key === '[' || e.key === '{';
  }

  function applyAssistResult(result) {
    if (!assist || !result) return false;
    return assist.applyEdit(editorEl, result);
  }

  function showGotoLineDialog() {
    if (docState === 'welcome') { uiAlert('请先打开文档'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box" style="min-width:280px">' +
        '<h3>跳转到行</h3>' +
        '<div class="modal-field"><input id="goto-line" type="number" min="1" style="width:100%;padding:8px" placeholder="行号" /></div>' +
        '<div class="modal-actions">' +
          '<button id="goto-cancel" class="btn-ghost">取消</button>' +
          '<button id="goto-ok" class="btn-ok">跳转</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    var input = overlay.querySelector('#goto-line');
    function close() { overlay.remove(); }
    overlay.querySelector('#goto-cancel').addEventListener('click', close);
    overlay.querySelector('#goto-ok').addEventListener('click', function () {
      var n = parseInt(input.value, 10);
      if (isNaN(n) || n < 1) { uiAlert('请输入有效行号'); return; }
      if (!editorVisible) showEditorPane(true);
      if (syncScrollCtrl) syncScrollCtrl.scrollEditorToLine(n);
      else jumpEditorToLine(n);
      close();
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    input.focus();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') overlay.querySelector('#goto-ok').click();
      if (e.key === 'Escape') close();
    });
  }

  function updateOutline(text) {
    if (!outlinePanelUi || !api.extractHeadings) return;
    outlinePanelUi.setHeadings(api.extractHeadings(text || ''));
  }

  function wrapPreviewTables() {
    if (!previewEl) return;
    var tables = previewEl.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      if (t.parentElement && t.parentElement.classList.contains('table-wrap')) continue;
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    }
  }

  /** 树遍历顺序与侧栏展示一致，返回第一个 Markdown 文件路径 */
  function firstMarkdownInTree(nodes) {
    if (!nodes || !nodes.length) return null;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.isDir) return n.path;
      if (n.children && n.children.length) {
        var found = firstMarkdownInTree(n.children);
        if (found) return found;
      }
    }
    return null;
  }

  function mountFileUi() {
    contentRowEl = document.getElementById('content-row');
    leftRailEl = document.getElementById('left-rail');
    if (window.MDAWelcome && contentRowEl) {
      welcomePane = window.MDAWelcome.mount(contentRowEl, {
        onNew: function () { newDocument(); },
        onOpenFile: function () { pickAndOpenFile(); },
        onOpenFolder: function () { openWorkspaceFolder(); },
        onOpenRecent: function (p) { requestOpen(p); },
      });
    }
    var fsRoot = document.getElementById('file-sidebar-root');
    if (window.MDAFileSidebar && fsRoot) {
      fileSidebar = window.MDAFileSidebar.mount(fsRoot, {
        railEl: leftRailEl,
        onOpenFile: function (p) { requestOpen(p); },
        onRefresh: function () { refreshWorkspaceTree(); },
      });
    }
  }

  function setDocState(state) {
    docState = state;
    if (state === 'welcome') {
      if (welcomePane) welcomePane.show();
      if (contentRowEl) contentRowEl.classList.add('welcome-mode');
    } else {
      if (welcomePane) welcomePane.hide();
      if (contentRowEl) contentRowEl.classList.remove('welcome-mode');
    }
    updateToolbar();
    setTitle(currentFilePath);
  }

  function refreshWelcomeRecents() {
    if (!welcomePane || !api.getRecentFiles) return;
    api.getRecentFiles().then(function (r) {
      if (r.success) welcomePane.setRecents(r.files || []);
    });
  }

  function pickAndOpenFile() {
    if (!api.showOpenFileDialog) return;
    api.showOpenFileDialog().then(function (r) {
      if (r.success && r.filePath) requestOpen(r.filePath);
    });
  }

  function newDocument() {
    guardDiscard().then(function (ok) {
      if (!ok) return;
      currentFilePath = null;
      currentText = '';
      editorEl.value = '';
      annotations = [];
      paragraphs = [];
      selectedAnnotationId = null;
      previewEl.innerHTML = '';
      setDirtyState(false);
      setDocState('untitled');
      showEditorPane(true);
      parseAndRender('', null);
      resetScrollTop();
      requestAnimationFrame(function () { editorEl.focus(); });
    });
  }

  function showEditorPane(visible) {
    editorVisible = !!visible;
    if (editorVisible) {
      editorPaneEl.classList.add('visible');
      splitLeftEl.classList.remove('hidden');
      refreshEditorDecorations();
    } else {
      editorPaneEl.classList.remove('visible');
      splitLeftEl.classList.add('hidden');
    }
    updateToolbar();
  }

  function openWorkspaceFolder() {
    if (!api.showOpenFolderDialog) return;
    api.showOpenFolderDialog().then(function (r) {
      if (!r.success || !r.folderPath) return;
      workspaceRoot = r.folderPath;
      if (leftRailEl) leftRailEl.classList.remove('hidden');
      refreshWorkspaceTree();
    });
  }

  function refreshWorkspaceTree() {
    if (!workspaceRoot || !api.listMarkdownTree) return;
    api.listMarkdownTree(workspaceRoot).then(function (r) {
      if (!r.success) {
        uiAlert('读取文件夹失败: ' + (r.error || '未知错误'));
        return;
      }
      var tree = r.tree || [];
      if (fileSidebar) {
        fileSidebar.setTree(tree);
        if (currentFilePath) fileSidebar.setActive(currentFilePath);
      }
      if (!currentFilePath) {
        var first = firstMarkdownInTree(tree);
        if (first) requestOpen(first);
      }
    });
  }

  function saveAs(onSuccess) {
    var suggestedName = '未命名.md';
    if (currentFilePath) {
      suggestedName = currentFilePath.replace(/\\/g, '/').split('/').pop() || suggestedName;
    }
    api.showSaveDialog({
      defaultPath: workspaceRoot || undefined,
      suggestedName: suggestedName,
    }).then(function (dlg) {
      if (!dlg.success || !dlg.filePath) return;
      writeToPath(dlg.filePath, onSuccess);
    });
  }

  function writeToPath(filePath, onSuccess) {
    var content = editorEl.value;
    var bad = (api.findMalformedAnnotations && api.findMalformedAnnotations(content)) || [];
    var proceed = bad.length
      ? uiConfirm('第 ' + bad.join('、') + ' 行的批注格式不正确，将无法被识别为批注。仍要保存吗？')
      : Promise.resolve(true);
    proceed.then(function (yes) {
      if (!yes) return;
      api.saveFile(filePath, content).then(function (r) {
        if (!r.success) {
          uiAlert('保存失败: ' + r.error);
          return;
        }
        currentFilePath = filePath;
        currentText = content;
        setDocState('open');
        setDirtyState(false);
        if (api.addRecentFile) {
          api.addRecentFile(filePath).then(function () { refreshWelcomeRecents(); });
        }
        setTitle(filePath);
        parseAndRender(content, filePath);
        refreshEditorDecorations();
        if (fileSidebar) fileSidebar.setActive(filePath);
        if (workspaceRoot) refreshWorkspaceTree();
        updateToolbar();
        if (typeof onSuccess === 'function') onSuccess();
      });
    });
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
        '<div id="left-rail" class="mda-left-rail hidden">' +
          '<div id="file-sidebar-root"></div>' +
        '</div>' +
        '<div id="editor-pane">' +
          '<div class="mda-src-editor">' +
            '<div id="src-gutter" class="src-gutter"></div>' +
            '<div class="src-scroll">' +
              '<pre id="src-highlight" class="src-highlight" aria-hidden="true"><code class="language-markdown"></code></pre>' +
              '<pre id="src-find-mark" class="src-find-mark" aria-hidden="true"><code></code></pre>' +
              '<textarea id="editor" class="src-input" spellcheck="false" wrap="off" placeholder="在此编辑 Markdown 源码…"></textarea>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="split-left" class="mda-splitter hidden"></div>' +
        '<div id="preview-pane">' +
          '<div id="outline-host"></div>' +
          '<div id="preview-content"></div>' +
        '</div>' +
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
    srcFindMarkEl = document.getElementById('src-find-mark');
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
      syncEditorScrollLayers();
    });

    setupSplitter(splitLeftEl, editorPaneEl, 'left');
    setupSplitter(splitRightEl, panelPaneEl, 'right');

    // 预览区点击：链接拦截默认导航；段落点击定位批注（拖选文字时不触发）
    previewPaneEl.addEventListener('click', function (e) {
      if (previewPointer.dragged) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;

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
        if (cursorLine && syncScrollCtrl) syncScrollCtrl.scrollEditorToLine(cursorLine);
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
        holder.setAttribute('data-mermaid-src', src);
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
    if (docState === 'welcome') { uiAlert('请先新建或打开文档'); return; }
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
    updateFindMarkLayer();
    if (srcGutterEl) {
      var n = text.split('\n').length;
      var nums = new Array(n);
      for (var i = 0; i < n; i++) nums[i] = i + 1;
      srcGutterEl.textContent = nums.join('\n');
    }
    syncEditorScrollLayers();
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
    if (docState === 'welcome') return;
    if (!currentFilePath) {
      saveAs(onSuccess);
      return;
    }
    if (!dirty) {
      if (typeof onSuccess === 'function') onSuccess();
      return;
    }
    writeToPath(currentFilePath, onSuccess);
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
      tbEditBtn.disabled = docState === 'welcome';
    }
    if (tbPanelBtn) tbPanelBtn.classList.toggle('active', panelVisible);
    if (tbFileNameEl) {
      var name = '';
      if (docState === 'untitled') name = '未命名.md';
      else if (currentFilePath) name = currentFilePath.replace(/\\/g, '/').split('/').pop();
      tbFileNameEl.innerHTML = name ? (escHtml(name) + (dirty ? '<span class="dirty-dot">●</span>' : '')) : '';
    }
    if (addBtn) addBtn.disabled = docState !== 'open' || !currentFilePath || dirty;
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
      if (api.isMarkdownPath && api.isMarkdownPath(p)) requestOpen(p);
      else uiAlert('仅支持打开 .md / .markdown / .txt / .mdc 文件');
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
    if (api.isMarkdownPath && api.isMarkdownPath(clean)) {
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
    if (!scrollPreview) return;

    var anno = null;
    for (var i = 0; i < annotations.length; i++) {
      if (annotations[i].id === id) { anno = annotations[i]; break; }
    }

    if (anno && anno.anchor && selAnchor && selAnchor.validateAnchor(getSourceText(), anno.anchor)) {
      var domRange = selAnchor.anchorToPreviewRange(previewEl, getSourceText(), anno.anchor);
      if (domRange) scrollPreviewToRange(domRange);
      if (!editorVisible) showEditorPane(true);
      selAnchor.scrollEditorToAnchor(editorEl, anno.anchor, syncEditorScrollLayers);
      return;
    }

    var p = findParagraphByAnnotationId(id);
    var el = paragraphElement(p);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      highlightCursorBlock(el);
    }
    if (p) {
      cursorLine = p.startLine;
      if (!editorVisible) showEditorPane(true);
      if (syncScrollCtrl) syncScrollCtrl.scrollEditorToLine(p.startLine);
      else jumpEditorToLine(p.startLine);
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
    setDocState('open');
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
    if (api.addRecentFile) {
      api.addRecentFile(filePath).then(function () { refreshWelcomeRecents(); });
    }
    if (fileSidebar) fileSidebar.setActive(filePath);
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
    if (docState === 'untitled') {
      api.setTitle('MDA - 未命名.md');
    } else if (filePath) {
      var name = filePath.replace(/\\/g, '/').split('/').pop();
      api.setTitle('MDA - ' + name);
    } else if (docState === 'welcome') {
      api.setTitle('MDA');
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
    updateOutline(text);
    renderMarkdownContent(text);
    renderPanel();
  }

  // ---- Markdown 渲染 ----
  function renderMarkdownContent(text) {
    var result = api.renderMarkdown(text);
    if (!result.success) {
      previewEl.innerHTML = '<p style="color:var(--danger)">渲染错误: ' + escHtml(result.error) + '</p>';
      updateToolbar();
      return;
    }
    htmlContent = result.html;
    previewEl.innerHTML = htmlContent;

    resolveImages();       // 相对/本地图片 → 绝对 file:// URL
    setupImageFallback();
    updateToolbar();
    renderMermaidBlocks().then(function () {
      enhanceCodeBlocks();
      decorateParagraphs();
      wrapPreviewTables();
      if (syncScrollCtrl) {
        syncScrollCtrl.refreshMap();
        syncScrollCtrl.syncPreviewToEditor();
      }
      if (findMatchState && findMatchState.query) updateFindPreviewHighlights();
      applyAnchorHighlights();
      updateToolbar();
    });
  }

  // ---- 复制预览为微信公众号富文本（Mermaid→图片、本地图→内嵌）----
  function fileUrlToPath(url) {
    if (!url || !/^file:/i.test(url)) return null;
    try {
      var p = decodeURIComponent(url.replace(/^file:\/\//i, ''));
      if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
      return p;
    } catch (e) { return null; }
  }

  function isValidPngDataUrl(url) {
    return !!(url && /^data:image\/png;base64,.{80,}/i.test(url));
  }

  function svgDimensions(svg) {
    var viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      var p = viewBox.trim().split(/[\s,]+/);
      if (p.length >= 4) {
        var vw = parseFloat(p[2]);
        var vh = parseFloat(p[3]);
        if (vw > 0 && vh > 0) return { w: Math.ceil(vw), h: Math.ceil(vh) };
      }
    }
    var rect = svg.getBoundingClientRect();
    var w = Math.ceil(rect.width) || parseInt(svg.getAttribute('width'), 10) || 0;
    var h = Math.ceil(rect.height) || parseInt(svg.getAttribute('height'), 10) || 0;
    if (w > 0 && h > 0) return { w: w, h: h };
    return { w: 800, h: 600 };
  }

  async function captureElementPng(el) {
    if (!el || !api.capturePageRect) return null;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
      return null;
    }
    var cap = await api.capturePageRect({
      x: rect.left, y: rect.top, width: Math.ceil(rect.width), height: Math.ceil(rect.height),
    });
    return (cap && cap.success && isValidPngDataUrl(cap.dataUrl)) ? cap.dataUrl : null;
  }

  async function mermaidHolderToPngDataUrl(liveHolder) {
    // 不滚动、不改布局：仅对已在视口内的元素截图，否则回退 SVG→PNG
    var png = await captureElementPng(liveHolder);
    if (png) return png;
    var svg = liveHolder.querySelector('svg');
    if (svg) {
      try {
        var fromSvg = await svgToPngDataUrl(svg);
        if (isValidPngDataUrl(fromSvg)) return fromSvg;
      } catch (e) { /* fallback */ }
    }
    throw new Error('流程图导出失败');
  }

  function svgToPngDataUrl(svg) {
    return new Promise(function (resolve, reject) {
      var clone = svg.cloneNode(true);
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      var dim = svgDimensions(svg);
      var w = dim.w;
      var h = dim.h;
      clone.setAttribute('width', String(w));
      clone.setAttribute('height', String(h));
      if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var svgStr = new XMLSerializer().serializeToString(clone);
      var svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/png')); }
        catch (err) { reject(err); }
      };
      img.onerror = function () { reject(new Error('SVG 转 PNG 失败')); };
      img.src = svg64;
    });
  }

  function imgElementToDataUrl(img) {
    return new Promise(function (resolve, reject) {
      function draw() {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) { reject(new Error('图片尺寸无效')); return; }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) { reject(e); }
      }
      if (img.complete && img.naturalWidth) draw();
      else { img.onload = draw; img.onerror = function () { reject(new Error('图片加载失败')); }; }
    });
  }

  async function inlineImageSrc(img) {
    var src = img.getAttribute('src') || '';
    if (!src || /^data:/i.test(src)) return;
    if (/^https?:/i.test(src)) return;
    var filePath = fileUrlToPath(src);
    if (!filePath && currentFilePath) filePath = api.resolvePath(currentFilePath, src);
    if (filePath && api.readFileAsDataUrl) {
      var r = await api.readFileAsDataUrl(filePath);
      if (r.success) { img.setAttribute('src', r.dataUrl); return; }
    }
    var live = previewEl.querySelector('img[src="' + src.replace(/"/g, '\\"') + '"]');
    if (live && live.complete) {
      try { img.setAttribute('src', await imgElementToDataUrl(live)); } catch (e) { /* keep */ }
    }
  }

  function applyArticleInlineStyles(root) {
    var styleMap = {
      H1: 'font-size:22px;font-weight:bold;line-height:1.4;margin:24px 0 16px;color:#222;',
      H2: 'font-size:20px;font-weight:bold;line-height:1.4;margin:22px 0 14px;color:#222;',
      H3: 'font-size:18px;font-weight:bold;line-height:1.4;margin:20px 0 12px;color:#222;',
      H4: 'font-size:16px;font-weight:bold;line-height:1.4;margin:18px 0 10px;color:#222;',
      H5: 'font-size:15px;font-weight:bold;line-height:1.4;margin:16px 0 8px;color:#222;',
      H6: 'font-size:14px;font-weight:bold;line-height:1.4;margin:14px 0 8px;color:#666;',
      P: 'font-size:16px;line-height:1.75;margin:0 0 16px;color:#333;',
      BLOCKQUOTE: 'margin:0 0 16px;padding:8px 16px;border-left:4px solid #ddd;color:#666;background:#f9f9f9;',
      UL: 'margin:0 0 16px;padding-left:2em;color:#333;',
      OL: 'margin:0 0 16px;padding-left:2em;color:#333;',
      LI: 'font-size:16px;line-height:1.75;margin:4px 0;',
      PRE: 'margin:0 0 16px;padding:12px;background:#f6f8fa;border-radius:4px;overflow-x:auto;font-size:14px;line-height:1.6;',
      CODE: 'font-family:Consolas,Monaco,monospace;font-size:14px;',
      TABLE: 'border-collapse:collapse;width:100%;margin:0 0 16px;font-size:15px;',
      TH: 'border:1px solid #ddd;padding:8px 12px;background:#f6f8fa;font-weight:bold;',
      TD: 'border:1px solid #ddd;padding:8px 12px;',
      HR: 'border:none;border-top:1px solid #ddd;margin:24px 0;',
      A: 'color:#0969da;text-decoration:none;',
      IMG: 'max-width:100%;height:auto;display:block;margin:12px auto;',
      STRONG: 'font-weight:bold;',
      EM: 'font-style:italic;',
    };
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var tag = el.tagName;
      if (styleMap[tag]) el.setAttribute('style', styleMap[tag]);
    }
    root.querySelectorAll('code').forEach(function (c) {
      if (c.parentElement && c.parentElement.tagName === 'PRE') return;
      c.setAttribute('style', 'padding:2px 6px;background:#f6f8fa;border-radius:3px;font-size:14px;font-family:Consolas,Monaco,monospace;');
    });
  }

  function wrapArticleSection(innerHtml) {
    return '<section style="font-size:16px;line-height:1.75;color:#333;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;">'
      + innerHtml + '</section>';
  }

  function ensureImgDimensions(img) {
    if (img.getAttribute('width') && img.getAttribute('height')) return Promise.resolve();
    var src = img.getAttribute('src') || '';
    if (!/^data:/i.test(src)) return Promise.resolve();
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        img.setAttribute('width', String(im.naturalWidth || 400));
        img.setAttribute('height', String(im.naturalHeight || 300));
        resolve();
      };
      im.onerror = function () { resolve(); };
      im.src = src;
    });
  }

  function normalizeImgToPng(img) {
    var src = img.getAttribute('src') || '';
    if (!/^data:/i.test(src) || /^data:image\/png/i.test(src)) return Promise.resolve();
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = im.naturalWidth || 400;
          c.height = im.naturalHeight || 300;
          c.getContext('2d').drawImage(im, 0, 0);
          img.setAttribute('src', c.toDataURL('image/png'));
        } catch (e) { /* keep */ }
        resolve();
      };
      im.onerror = function () { resolve(); };
      im.src = src;
    });
  }

  async function buildArticleClipboardContent() {
    var root = document.createElement('div');
    root.innerHTML = previewEl.innerHTML;

    root.querySelectorAll('.mda-code-copy, .mda-code-gutter, .md-image-alt').forEach(function (el) { el.remove(); });
    root.querySelectorAll('.mda-code').forEach(function (box) {
      var pre = box.querySelector('pre');
      if (pre && box.parentNode) box.parentNode.replaceChild(pre, box);
    });
    root.querySelectorAll('.mda-code-scroll').forEach(function (scroll) {
      var pre = scroll.querySelector('pre');
      if (pre && scroll.parentNode) scroll.parentNode.replaceChild(pre, scroll);
    });
    root.querySelectorAll('.md-image-wrapper').forEach(function (wrap) {
      var img = wrap.querySelector('img');
      if (img && wrap.parentNode) wrap.parentNode.replaceChild(img.cloneNode(true), wrap);
    });

    var mermaidHolders = root.querySelectorAll('.mda-mermaid');
    var liveMermaids = previewEl.querySelectorAll('.mda-mermaid');
    for (var mi = 0; mi < mermaidHolders.length; mi++) {
      var holder = mermaidHolders[mi];
      var liveHolder = liveMermaids[mi] || null;
      var svg = liveHolder ? liveHolder.querySelector('svg') : holder.querySelector('svg');
      var p = document.createElement('p');
      p.setAttribute('style', 'text-align:center;margin:16px 0;');
      if (liveHolder || svg) {
        try {
          var mmdImg = document.createElement('img');
          mmdImg.src = liveHolder
            ? await mermaidHolderToPngDataUrl(liveHolder)
            : await svgToPngDataUrl(svg);
          mmdImg.setAttribute('alt', '流程图');
          p.appendChild(mmdImg);
        } catch (e) {
          p.textContent = '[流程图]';
        }
      } else {
        p.textContent = '[流程图]';
      }
      if (holder.parentNode) holder.parentNode.replaceChild(p, holder);
    }

    root.querySelectorAll('.mda-mermaid-error').forEach(function (el) {
      var p = document.createElement('p');
      p.setAttribute('style', 'color:#999;font-style:italic;');
      p.textContent = el.textContent || '[流程图渲染失败]';
      if (el.parentNode) el.parentNode.replaceChild(p, el);
    });

    var imgs = root.querySelectorAll('img');
    for (var ii = 0; ii < imgs.length; ii++) {
      await inlineImageSrc(imgs[ii]);
      await normalizeImgToPng(imgs[ii]);
      await ensureImgDimensions(imgs[ii]);
    }

    root.querySelectorAll('.mda-cursor-block').forEach(function (el) { el.classList.remove('mda-cursor-block'); });
    applyArticleInlineStyles(root);

    return {
      html: wrapArticleSection(root.innerHTML),
      text: root.innerText || '',
    };
  }

  async function copyPreviewForArticle() {
    if (!previewEl || !previewEl.textContent.trim()) {
      uiAlert('预览区尚无内容，请先打开 Markdown 文件');
      return;
    }
    try {
      var pack = await buildArticleClipboardContent();
      if (!pack.text && !pack.html) {
        uiAlert('复制失败: 剪贴板内容为空');
        return;
      }
      var r = await api.copyArticleHtml(pack.html, pack.text);
      if (r && r.success !== false) {
        uiAlert('已复制微信公众号格式到剪贴板，可直接粘贴到公众号编辑器。');
      } else {
        uiAlert('复制失败: ' + ((r && r.error) || '未知错误'));
      }
    } catch (err) {
      uiAlert('复制失败: ' + ((err && err.message) ? err.message : String(err)));
    }
  }

  function exportBaseName() {
    if (!currentFilePath) return 'export';
    var name = currentFilePath.replace(/^.*[\\/]/, '');
    var dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
  }

  function wrapExportHtmlDocument(bodyHtml, title) {
    var safeTitle = String(title || 'export')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>'
      + safeTitle + '</title>\n</head>\n<body>\n' + bodyHtml + '\n</body>\n</html>';
  }

  async function exportPreviewHtml() {
    if (!previewEl || !previewEl.textContent.trim()) {
      uiAlert('预览区尚无内容，请先打开 Markdown 文件');
      return;
    }
    try {
      var pack = await buildArticleClipboardContent();
      var base = exportBaseName();
      var dlg = await api.showSaveDialog({
        title: '导出 HTML',
        suggestedName: base + '.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (!dlg || !dlg.success || dlg.canceled) return;
      var doc = wrapExportHtmlDocument(pack.html, base);
      var wr = await api.writeTextFile(dlg.filePath, doc);
      if (wr && wr.success) {
        uiAlert('已导出 HTML：' + dlg.filePath);
      } else {
        uiAlert('导出失败: ' + ((wr && wr.error) || '未知错误'));
      }
    } catch (err) {
      uiAlert('导出失败: ' + ((err && err.message) ? err.message : String(err)));
    }
  }

  async function exportPreviewPdf() {
    if (!previewEl || !previewEl.textContent.trim()) {
      uiAlert('预览区尚无内容，请先打开 Markdown 文件');
      return;
    }
    try {
      var pack = await buildArticleClipboardContent();
      var base = exportBaseName();
      var dlg = await api.showSaveDialog({
        title: '导出 PDF',
        suggestedName: base + '.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!dlg || !dlg.success || dlg.canceled) return;
      var doc = wrapExportHtmlDocument(pack.html, base);
      var wr = await api.exportPdf(dlg.filePath, doc);
      if (wr && wr.success) {
        uiAlert('已导出 PDF：' + dlg.filePath);
      } else {
        uiAlert('导出失败: ' + ((wr && wr.error) || '未知错误'));
      }
    } catch (err) {
      uiAlert('导出失败: ' + ((err && err.message) ? err.message : String(err)));
    }
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
      e.stopPropagation();
      showCodeContextMenu(e.clientX, e.clientY, code, rawText, copyBtn);
    });
    container.addEventListener('keydown', function (e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      var key = (e.key || '').toLowerCase();
      if (key === 'a') { e.preventDefault(); selectCodeContents(code); }
      else if (key === 'c') {
        e.preventDefault();
        var selText = window.getSelection ? String(window.getSelection()) : '';
        if (selText.trim()) copyCode(selText, copyBtn);
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
    removeSelectionContextMenu();
    clearPreviewSelectionSnap();

    var sel = window.getSelection();
    var hasSel = !!(sel && !sel.isCollapsed && sel.toString().trim());
    var snap = hasSel ? capturePreviewSelection(sel) : null;

    var menu = document.createElement('div');
    menu.id = 'mda-code-menu';
    menu.className = 'mda-context-menu';
    menu.innerHTML =
      '<div class="mda-menu-item' + (hasSel ? '' : ' disabled') + '" data-act="copy"><span>拷贝</span><span class="mda-menu-key">' + MOD_KEY + 'C</span></div>' +
      '<div class="mda-menu-item" data-act="copy-all"><span>拷贝全部</span><span class="mda-menu-key">' + MOD_KEY + 'A</span></div>' +
      '<div class="mda-menu-item' + (hasSel ? '' : ' disabled') + '" data-act="anno"><span>添加选区批注</span></div>';
    document.body.appendChild(menu);
    menu.style.left = Math.min(x, window.innerWidth - menu.offsetWidth - 4) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 4) + 'px';

    menu.addEventListener('click', function (e) {
      var item = e.target.closest('[data-act]');
      if (!item || item.classList.contains('disabled')) return;
      var act = item.dataset.act;
      if (act === 'copy') {
        var selText = snap ? snap.quote : '';
        if (!selText.trim()) {
          uiAlert('请先选中要拷贝的代码');
          removeCodeContextMenu();
          return;
        }
        copyCode(selText, btn);
      } else if (act === 'copy-all') {
        copyCode(rawText, btn);
      } else if (act === 'anno') {
        if (!snap) {
          uiAlert('请先选中代码再添加选区批注');
          removeCodeContextMenu();
          return;
        }
        if (!ensureNotDirty()) {
          removeCodeContextMenu();
          return;
        }
        previewSelectionSnap = snap;
        var anchor = resolveSelectionAnchor('preview', snap);
        removeCodeContextMenu();
        clearPreviewSelectionSnap();
        if (!anchor) {
          uiAlert('无法识别选区，请尝试在源码编辑区选择');
          return;
        }
        var line = selAnchor.anchorToLine(getSourceText(), anchor.start);
        showEditDialog('add', null, line, anchor);
        return;
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
      var stale = selAnchor && selAnchor.isAnchorStale(getSourceText(), a);
      var anchorBadge = a.anchor
        ? '<span style="font-size:10px;color:var(--text-muted);margin-left:4px">选区</span>' : '';
      var staleBadge = stale ? '<span class="anno-stale-badge">锚点失效</span>' : '';

      html += '<div class="anno-item' + selCls + '" data-anno-id="' + escHtml(a.id) + '">' +
        '<div class="anno-meta">' +
        '<span style="border-left:3px solid ' + LEVEL_COLORS[a.level] + ';padding-left:4px;margin-right:8px"></span>' +
        '行' + (a.line || '?') + anchorBadge + staleBadge + ' · ' +
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

  function showHelpDialog() {
    var exts = (api.markdownExtensions || ['md', 'markdown', 'txt', 'mdc']).map(function (e) {
      return '.' + e;
    }).join(' / ');
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box mda-help-box">' +
        '<h2 class="mda-help-title">MDA 功能与快捷键</h2>' +
        '<div class="mda-help-body">' +
          '<p class="mda-help-lead">Markdown 批注管理工具：在 .md 等文件中嵌入结构化批注，提供可视化预览与批注面板。</p>' +
          '<h3>支持的文件</h3>' +
          '<p>可打开 ' + escHtml(exts) + '；拖拽文件到窗口、菜单「文件 → 打开」、欢迎页或命令行 <code>mda path/to/file</code>。</p>' +
          '<h3>文件管理</h3>' +
          '<ul>' +
            '<li><kbd>Ctrl+N</kbd> 新建未命名文档；首次保存弹出另存为对话框</li>' +
            '<li><kbd>Ctrl+Alt+O</kbd> 打开文件夹，左侧文件树列出 Markdown 文件；侧栏标题栏 ‹ 或 <kbd>Ctrl+\\</kbd> 可收起</li>' +
            '<li>菜单「最近文件」记录最近打开的 20 个文件</li>' +
          '</ul>' +
          '<h3>批注</h3>' +
          '<ul>' +
            '<li>段落左侧色条表示批注级别（critical / major / minor / info）</li>' +
            '<li>点击预览段落 ↔ 点击批注列表，双向定位</li>' +
            '<li>按状态、级别、标签筛选；增 / 删 / 改批注（写操作保护正文，仅改批注行）</li>' +
            '<li>存在未保存的源码编辑时，批注写操作会暂时禁用</li>' +
          '</ul>' +
          '<h3>编辑与预览</h3>' +
          '<ul>' +
            '<li>三栏：源码编辑｜实时预览｜批注面板（编辑/批注可独立开关）</li>' +
            '<li>编辑↔预览同步滚动；预览上方大纲可点击跳转源码行</li>' +
            '<li>源码语法高亮 + 行号；<kbd>Ctrl+S</kbd> 保存；关闭时未保存会提示</li>' +
            '<li><kbd>Ctrl+F</kbd> 查找、<kbd>Ctrl+H</kbd> 替换、<kbd>Ctrl+G</kbd> 跳转到行</li>' +
            '<li><kbd>Ctrl+B/I/`</kbd> 粗体/斜体/代码；<kbd>Ctrl+Shift+]/[</kbd> 标题升降级</li>' +
            '<li>深色模式；相对路径图片；Mermaid 流程图；KaTeX 数学公式；点击图片/流程图可缩放</li>' +
            '<li><strong>复制预览</strong>：菜单或 <kbd>Ctrl+Shift+C</kbd>，复制为微信公众号富文本（含内嵌图片与流程图）</li>' +
            '<li>分栏可拖拽调宽，双击分隔条复位</li>' +
          '</ul>' +
          '<h3>快捷键</h3>' +
          '<table class="mda-help-table"><tbody>' +
            '<tr><td>新建文档</td><td><kbd>Ctrl+N</kbd></td></tr>' +
            '<tr><td>打开文件</td><td><kbd>Ctrl+O</kbd></td></tr>' +
            '<tr><td>打开文件夹</td><td><kbd>Ctrl+Alt+O</kbd></td></tr>' +
            '<tr><td>收起/展开文件树</td><td><kbd>Ctrl+\\</kbd></td></tr>' +
            '<tr><td>查找</td><td><kbd>Ctrl+F</kbd></td></tr>' +
            '<tr><td>替换</td><td><kbd>Ctrl+H</kbd></td></tr>' +
            '<tr><td>跳转到行</td><td><kbd>Ctrl+G</kbd></td></tr>' +
            '<tr><td>粗体 / 斜体 / 代码</td><td><kbd>Ctrl+B</kbd> / <kbd>Ctrl+I</kbd> / <kbd>Ctrl+`</kbd></td></tr>' +
            '<tr><td>标题升降级</td><td><kbd>Ctrl+Shift+]</kbd> / <kbd>Ctrl+Shift+[</kbd></td></tr>' +
            '<tr><td>保存</td><td><kbd>Ctrl+S</kbd></td></tr>' +
            '<tr><td>另存为</td><td><kbd>Ctrl+Shift+S</kbd></td></tr>' +
            '<tr><td>重新加载</td><td><kbd>Ctrl+R</kbd></td></tr>' +
            '<tr><td>打开文件所在目录</td><td><kbd>Ctrl+Shift+O</kbd></td></tr>' +
            '<tr><td>复制预览（微信公众号）</td><td><kbd>Ctrl+Shift+C</kbd></td></tr>' +
            '<tr><td>编辑栏</td><td><kbd>Ctrl+E</kbd></td></tr>' +
            '<tr><td>批注栏</td><td><kbd>Ctrl+B</kbd></td></tr>' +
            '<tr><td>切换深色模式</td><td><kbd>Ctrl+Shift+D</kbd></td></tr>' +
            '<tr><td>功能与快捷键（本页）</td><td><kbd>F1</kbd></td></tr>' +
            '<tr><td>开发者工具</td><td><kbd>F12</kbd></td></tr>' +
          '</tbody></table>' +
          '<p class="mda-help-note">CLI 命令 <code>mda-cli scan/add/edit/remove</code> 与 GUI 共用同一套核心逻辑。</p>' +
        '</div>' +
        '<div class="modal-actions"><button id="ui-help-ok" class="btn-ok">关闭</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    overlay.querySelector('#ui-help-ok').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#ui-help-ok').focus();
  }

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
  function showEditDialog(mode, anno, defaultLine, pendingAnchor) {
    if (!ensureNotDirty()) return;
    var existing = document.getElementById('edit-dialog');
    if (existing) existing.remove();

    var isAdd = mode === 'add';
    var title = isAdd ? (pendingAnchor ? '添加选区批注' : '添加批注') : '编辑批注';

    var overlay = document.createElement('div');
    overlay.id = 'edit-dialog';
    overlay.className = 'modal-overlay';

    var formHtml = '<div class="modal-box" style="width:440px"><h3>' + title + '</h3>';

    if (isAdd && pendingAnchor) {
      var quotePreview = pendingAnchor.quote || getSourceText().slice(pendingAnchor.start, pendingAnchor.end);
      formHtml += '<div class="modal-field"><label>选中文本</label>' +
        '<div style="font-size:12px;color:var(--text-muted);max-height:56px;overflow:auto;white-space:pre-wrap;border:1px solid var(--border-light);border-radius:4px;padding:6px 8px">' +
        escHtml(quotePreview) + '</div></div>';
    } else if (isAdd) {
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
        if (pendingAnchor) {
          var anchorLine = selAnchor
            ? selAnchor.anchorToLine(getSourceText(), pendingAnchor.start)
            : defaultLine;
          doAdd(anchorLine, content, tags, level, pendingAnchor);
        } else {
          var line = parseInt(document.getElementById('ed-line').value, 10);
          if (isNaN(line) || line < 1) { uiAlert('请输入有效行号'); return; }
          doAdd(line, content, tags, level, null);
        }
      } else {
        var status = document.getElementById('ed-status').value;
        doEdit(anno.id, content, tags, level, status);
      }
      overlay.remove();
    });

    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(function () {
      var first = document.getElementById(isAdd && !pendingAnchor ? 'ed-line' : 'ed-content');
      if (first) first.focus();
    });
  }

  function doAdd(line, content, tags, level, anchor) {
    var input = { content: content, tags: tags, level: level };
    if (anchor) {
      input.anchor = {
        start: anchor.start,
        end: anchor.end,
        quote: anchor.quote,
      };
    }
    api.addAnnotation(currentFilePath, line, input)
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

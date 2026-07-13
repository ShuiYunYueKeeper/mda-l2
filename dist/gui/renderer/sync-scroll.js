// 编辑区 → 预览区同步滚动（块级映射；预览滚动不反向驱动编辑区，避免反馈环路）
(function (global) {
  var LINE_HEIGHT = 21;

  function buildBlockMap(previewEl) {
    if (!previewEl) return [];
    var blocks = previewEl.querySelectorAll('[data-line]');
    var map = [];
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i];
      var line = parseInt(el.getAttribute('data-line'), 10);
      if (!isNaN(line)) map.push({ line: line, top: el.offsetTop });
    }
    return map;
  }

  function lineAtEditorScroll(editor) {
    if (!editor) return 1;
    var line = Math.floor(editor.scrollTop / LINE_HEIGHT) + 1;
    var maxLine = editor.value.split('\n').length;
    return Math.max(1, Math.min(line, maxLine));
  }

  function scrollEditorToLine(editor, text, line, options) {
    options = options || {};
    if (!editor || !text) return;
    var lines = text.split('\n');
    var idx = Math.max(0, Math.min(line - 1, lines.length - 1));
    var pos = lines.slice(0, idx).join('\n').length + (idx > 0 ? 1 : 0);
    if (!options.skipFocus) editor.focus();
    editor.selectionStart = editor.selectionEnd = pos;
    editor.scrollTop = Math.max(0, (line - 1) * LINE_HEIGHT - editor.clientHeight * 0.3);
  }

  function scrollPreviewToLine(previewPane, line, map) {
    if (!previewPane || !map || !map.length) return;
    var best = null;
    for (var i = 0; i < map.length; i++) {
      if (map[i].line <= line) best = map[i];
      else break;
    }
    if (best) {
      previewPane.scrollTop = Math.max(0, best.top - previewPane.clientHeight * 0.15);
    }
  }

  function attach(editor, previewPane, previewEl, getText) {
    var blockMap = [];
    var syncing = false;
    var scrollTimer = null;

    function refreshMap() {
      blockMap = buildBlockMap(previewEl);
    }

    function syncPreviewToEditor() {
      if (syncing) return;
      var text = typeof getText === 'function' ? getText() : '';
      if (!text) return;
      syncing = true;
      var line = lineAtEditorScroll(editor);
      scrollPreviewToLine(previewPane, line, blockMap);
      requestAnimationFrame(function () { syncing = false; });
    }

    function onEditorScroll() {
      if (syncing) return;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        scrollTimer = null;
        syncPreviewToEditor();
      }, 32);
    }

    editor.addEventListener('scroll', onEditorScroll);

    return {
      refreshMap: refreshMap,
      syncPreviewToEditor: syncPreviewToEditor,
      scrollEditorToLine: function (line, opts) {
        opts = opts || {};
        syncing = true;
        var text = typeof getText === 'function' ? getText() : '';
        scrollEditorToLine(editor, text, line, { skipFocus: opts.skipFocus });
        scrollPreviewToLine(previewPane, line, blockMap);
        requestAnimationFrame(function () { syncing = false; });
      },
      detach: function () {
        editor.removeEventListener('scroll', onEditorScroll);
        if (scrollTimer) clearTimeout(scrollTimer);
      },
    };
  }

  var api = {
    buildBlockMap: buildBlockMap,
    attach: attach,
    scrollEditorToLine: scrollEditorToLine,
    scrollPreviewToLine: scrollPreviewToLine,
  };

  global.MDASyncScroll = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

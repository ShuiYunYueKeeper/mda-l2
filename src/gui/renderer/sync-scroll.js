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

  function paddingTop(editor) {
    if (!editor || !window.getComputedStyle) return 0;
    return parseFloat(window.getComputedStyle(editor).paddingTop) || 0;
  }

  /** 1-based 行号 → textarea 字符偏移（按 \\n 计行，兼容 CRLF） */
  function offsetOfLine(text, line1Based) {
    if (!text || line1Based <= 1) return 0;
    var n = 1;
    for (var i = 0; i < text.length; i++) {
      if (text.charAt(i) === '\n') {
        n++;
        if (n === line1Based) return i + 1;
      }
    }
    return text.length;
  }

  function lineAtEditorScroll(editor) {
    if (!editor) return 1;
    var pad = paddingTop(editor);
    var line = Math.floor(Math.max(0, editor.scrollTop - pad) / LINE_HEIGHT) + 1;
    var maxLine = editor.value.split('\n').length;
    return Math.max(1, Math.min(line, maxLine));
  }

  function scrollEditorToLine(editor, text, line, options) {
    options = options || {};
    if (!editor || !text) return;
    var maxLine = text.split('\n').length;
    var targetLine = Math.max(1, Math.min(line, maxLine));
    var pos = offsetOfLine(text, targetLine);
    var pad = paddingTop(editor);
    var targetScroll = Math.max(0, pad + (targetLine - 1) * LINE_HEIGHT - editor.clientHeight * 0.3);
    if (!options.skipFocus) editor.focus();
    editor.selectionStart = editor.selectionEnd = pos;
    editor.scrollTop = targetScroll;
    // setSelectionRange 可能异步把滚动拽偏，下一帧再钉回目标行
    requestAnimationFrame(function () {
      editor.selectionStart = editor.selectionEnd = pos;
      editor.scrollTop = targetScroll;
    });
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
        if (!opts.skipPreview) scrollPreviewToLine(previewPane, line, blockMap);
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

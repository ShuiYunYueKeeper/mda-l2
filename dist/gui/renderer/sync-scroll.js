// 编辑区 ↔ 预览区定位（点击同步；滚动互不驱动，避免比例漂移与反馈环路）
(function (global) {
  var LINE_HEIGHT = 21;

  function buildBlockMap(previewEl) {
    if (!previewEl) return [];
    var blocks = previewEl.querySelectorAll('[data-line]');
    var map = [];
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i];
      var line = parseInt(el.getAttribute('data-line'), 10);
      if (!isNaN(line)) map.push({ line: line, el: el });
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

  function lineAtCaret(editor) {
    if (!editor) return 1;
    var pos = typeof editor.selectionStart === 'number' ? editor.selectionStart : 0;
    return Math.max(1, editor.value.slice(0, pos).split('\n').length);
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
    requestAnimationFrame(function () {
      editor.selectionStart = editor.selectionEnd = pos;
      editor.scrollTop = targetScroll;
    });
  }

  function findMapEntry(map, line) {
    if (!map || !map.length) return null;
    var best = null;
    for (var i = 0; i < map.length; i++) {
      if (map[i].line <= line) best = map[i];
      else break;
    }
    return best;
  }

  /** 块是否已完整落在预览可视区内 */
  function isPreviewBlockVisible(previewPane, entry) {
    if (!previewPane || !entry || !entry.el) return false;
    var paneRect = previewPane.getBoundingClientRect();
    var r = entry.el.getBoundingClientRect();
    var margin = 8;
    return r.top >= paneRect.top + margin && r.bottom <= paneRect.bottom - margin;
  }

  /**
   * 用 getBoundingClientRect 相对滚动容器求位移。
   * 不可用 offsetTop：预览块在 #preview-content 内，而滚动的是含大纲的 #preview-pane。
   */
  function scrollPreviewToEntry(previewPane, entry, options) {
    options = options || {};
    if (!previewPane || !entry || !entry.el) return;
    if (options.onlyIfNeeded && isPreviewBlockVisible(previewPane, entry)) return;
    var paneRect = previewPane.getBoundingClientRect();
    var r = entry.el.getBoundingClientRect();
    var targetOffset = previewPane.clientHeight * 0.15;
    var delta = r.top - paneRect.top - targetOffset;
    previewPane.scrollTop = Math.max(0, previewPane.scrollTop + delta);
  }

  function scrollPreviewToLine(previewPane, line, map, options) {
    options = options || {};
    var best = findMapEntry(map, line);
    if (!best) return null;
    scrollPreviewToEntry(previewPane, best, options);
    return best;
  }

  /**
   * @param {function} [hooks.onPreviewLocate] — (line, el|null) 滚动/定位后回调，用于加 .mda-cursor-block
   */
  function attach(editor, previewPane, previewEl, getText, hooks) {
    hooks = hooks || {};
    var onPreviewLocate = typeof hooks.onPreviewLocate === 'function' ? hooks.onPreviewLocate : null;
    var blockMap = [];
    var syncing = false;

    function refreshMap() {
      blockMap = buildBlockMap(previewEl);
    }

    function withSyncLock(fn) {
      if (syncing) return;
      syncing = true;
      try {
        fn();
      } finally {
        requestAnimationFrame(function () { syncing = false; });
      }
    }

    function notifyLocate(line, entry) {
      if (onPreviewLocate) onPreviewLocate(line, entry && entry.el ? entry.el : null);
    }

    function syncPreviewToEditor() {
      withSyncLock(function () {
        if (!blockMap.length) refreshMap();
        var line = lineAtEditorScroll(editor);
        var entry = scrollPreviewToLine(previewPane, line, blockMap);
        notifyLocate(line, entry);
      });
    }

    function syncPreviewToCaret() {
      withSyncLock(function () {
        if (!blockMap.length) refreshMap();
        var line = lineAtCaret(editor);
        // 强制滚入视口（源码→预览时用户期望看到对应块）
        var entry = scrollPreviewToLine(previewPane, line, blockMap, { onlyIfNeeded: false });
        notifyLocate(line, entry);
      });
    }

    function onEditorClick() {
      // 等浏览器把 caret 落到点击处后再读 selectionStart
      requestAnimationFrame(syncPreviewToCaret);
    }

    function onEditorKeyup(e) {
      if (!e) return;
      var k = e.key || '';
      if (
        k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' ||
        k === 'Home' || k === 'End' || k === 'PageUp' || k === 'PageDown' ||
        k === 'Enter' || k === 'Backspace' || k === 'Delete'
      ) {
        syncPreviewToCaret();
      }
    }

    editor.addEventListener('click', onEditorClick);
    editor.addEventListener('keyup', onEditorKeyup);

    return {
      refreshMap: refreshMap,
      syncPreviewToEditor: syncPreviewToEditor,
      syncPreviewToCaret: syncPreviewToCaret,
      scrollEditorToLine: function (line, opts) {
        opts = opts || {};
        withSyncLock(function () {
          var text = typeof getText === 'function' ? getText() : '';
          scrollEditorToLine(editor, text, line, { skipFocus: opts.skipFocus });
          if (!opts.skipPreview) {
            if (!blockMap.length) refreshMap();
            var entry = scrollPreviewToLine(previewPane, line, blockMap, {
              onlyIfNeeded: !!opts.onlyIfNeeded,
            });
            notifyLocate(line, entry);
          }
        });
      },
      scrollPreviewToLine: function (line, opts) {
        opts = opts || {};
        withSyncLock(function () {
          if (!blockMap.length) refreshMap();
          var entry = scrollPreviewToLine(previewPane, line, blockMap, opts);
          notifyLocate(line, entry);
        });
      },
      detach: function () {
        editor.removeEventListener('click', onEditorClick);
        editor.removeEventListener('keyup', onEditorKeyup);
      },
    };
  }

  var api = {
    buildBlockMap: buildBlockMap,
    attach: attach,
    scrollEditorToLine: scrollEditorToLine,
    scrollPreviewToLine: scrollPreviewToLine,
    lineAtCaret: lineAtCaret,
  };

  global.MDASyncScroll = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

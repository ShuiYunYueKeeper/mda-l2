// 预览区选区批注高亮（CSS Highlight API + mark 降级）
(function (global) {
  var HIGHLIGHT_NAMES = {
    critical: 'mda-anno-critical',
    major: 'mda-anno-major',
    minor: 'mda-anno-minor',
    info: 'mda-anno-info',
  };

  var FALLBACK_CLASS = 'mda-anno-fallback';

  function supportsHighlightApi() {
    return typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  }

  function clearAnnotationHighlights(previewEl) {
    if (supportsHighlightApi()) {
      Object.keys(HIGHLIGHT_NAMES).forEach(function (level) {
        try { CSS.highlights.delete(HIGHLIGHT_NAMES[level]); } catch (e) { /* ignore */ }
      });
    }
    if (!previewEl) return;
    var marks = previewEl.querySelectorAll('mark.' + FALLBACK_CLASS);
    for (var i = 0; i < marks.length; i++) {
      var mark = marks[i];
      var parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if (parent.normalize) parent.normalize();
    }
  }

  function wrapRangeWithMark(range, level) {
    if (!range || range.collapsed) return null;
    try {
      var mark = document.createElement('mark');
      mark.className = FALLBACK_CLASS + ' mda-anno-fallback-' + (level || 'info');
      range.surroundContents(mark);
      return mark;
    } catch (e) {
      return null;
    }
  }

  function applyAnnotationHighlights(previewEl, annotations, sourceText, helpers) {
    helpers = helpers || {};
    var validateAnchor = helpers.validateAnchor;
    var anchorToPreviewRange = helpers.anchorToPreviewRange;
    var isAnchorStale = helpers.isAnchorStale;
    if (!previewEl || !annotations || !sourceText) return;

    clearAnnotationHighlights(previewEl);

    var byLevel = {};
    var fallback = [];
    var useApi = supportsHighlightApi();

    for (var i = 0; i < annotations.length; i++) {
      var ann = annotations[i];
      if (!ann.anchor) continue;
      if (validateAnchor && !validateAnchor(sourceText, ann.anchor)) continue;
      if (isAnchorStale && isAnchorStale(sourceText, ann)) continue;
      if (!anchorToPreviewRange) continue;

      var domRange = anchorToPreviewRange(previewEl, sourceText, ann.anchor);
      if (!domRange) continue;

      var level = ann.level || 'info';
      var name = HIGHLIGHT_NAMES[level] || HIGHLIGHT_NAMES.info;
      if (!byLevel[name]) byLevel[name] = [];
      byLevel[name].push(domRange);
      if (!useApi) fallback.push({ range: domRange.cloneRange(), level: level });
    }

    if (useApi) {
      var used = false;
      Object.keys(byLevel).forEach(function (name) {
        var ranges = byLevel[name];
        if (!ranges.length) return;
        try {
          CSS.highlights.set(name, new Highlight(...ranges));
          used = true;
        } catch (e) { /* fallback below */ }
      });
      if (used) return;
    }

    if (!fallback.length) {
      Object.keys(byLevel).forEach(function (name) {
        var level = name.replace('mda-anno-', '');
        var ranges = byLevel[name];
        for (var r = 0; r < ranges.length; r++) {
          fallback.push({ range: ranges[r].cloneRange(), level: level });
        }
      });
    }

    for (var f = 0; f < fallback.length; f++) {
      wrapRangeWithMark(fallback[f].range, fallback[f].level);
    }
  }

  function flashPreviewRange(previewEl, range) {
    if (!range) return null;
    try {
      var mark = document.createElement('mark');
      mark.className = 'mda-anno-flash';
      range.surroundContents(mark);
      previewEl.scrollIntoView && range.startContainer.parentElement &&
        range.startContainer.parentElement.scrollIntoView({ block: 'nearest' });
      range.startContainer.parentElement &&
        range.startContainer.parentElement.closest &&
        (function () {
          var block = range.startContainer.parentElement.closest('[data-line]');
          if (block) block.scrollIntoView({ block: 'center', behavior: 'auto' });
        })();
      setTimeout(function () {
        if (!mark.parentNode) return;
        var parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        if (parent.normalize) parent.normalize();
      }, 1200);
      return mark;
    } catch (e) {
      return null;
    }
  }

  var api = {
    HIGHLIGHT_NAMES: HIGHLIGHT_NAMES,
    supportsHighlightApi: supportsHighlightApi,
    clearAnnotationHighlights: clearAnnotationHighlights,
    applyAnnotationHighlights: applyAnnotationHighlights,
    flashPreviewRange: flashPreviewRange,
  };

  global.MDAAnchorHighlights = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

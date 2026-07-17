// 查找 / 替换浮层（Ctrl+F / Ctrl+H）
(function (global) {
  function findAll(text, query, opts) {
    opts = opts || {};
    if (!query) return [];
    var matches = [];
    if (opts.regex) {
      try {
        var flags = opts.caseSensitive ? 'g' : 'gi';
        var re = new RegExp(query, flags);
        var m;
        while ((m = re.exec(text)) !== null) {
          matches.push({ start: m.index, end: m.index + m[0].length });
          if (m[0].length === 0) re.lastIndex++;
        }
      } catch (e) {
        return [];
      }
      return matches;
    }
    var hay = opts.caseSensitive ? text : text.toLowerCase();
    var needle = opts.caseSensitive ? query : query.toLowerCase();
    var from = 0;
    while (from < hay.length) {
      var idx = hay.indexOf(needle, from);
      if (idx < 0) break;
      matches.push({ start: idx, end: idx + query.length });
      from = idx + (query.length || 1);
    }
    return matches;
  }

  function mount(hostEl, editorEl, onDirty, hooks) {
    hooks = hooks || {};
    var onMatchesChange = hooks.onMatchesChange;
    var syncEditorScroll = hooks.syncEditorScroll;
    var LINE_H = 21;

    var bar = document.createElement('div');
    bar.id = 'find-replace-bar';
    bar.className = 'mda-find-bar hidden';
    bar.innerHTML =
      '<div class="mda-find-row">' +
        '<input id="fr-find" type="text" placeholder="" autocomplete="off" />' +
        '<span id="fr-count" class="mda-find-count"></span>' +
        '<button type="button" id="fr-prev" title="">↑</button>' +
        '<button type="button" id="fr-next" title="">↓</button>' +
        '<label class="mda-find-opt"><input id="fr-case" type="checkbox" /> <span data-fr="case"></span></label>' +
        '<label class="mda-find-opt"><input id="fr-regex" type="checkbox" /> <span data-fr="regex"></span></label>' +
        '<button type="button" id="fr-close" title="">×</button>' +
      '</div>' +
      '<div id="fr-replace-row" class="mda-find-row hidden">' +
        '<input id="fr-replace" type="text" placeholder="" autocomplete="off" />' +
        '<button type="button" id="fr-replace-one"></button>' +
        '<button type="button" id="fr-replace-all"></button>' +
      '</div>';
    hostEl.appendChild(bar);

    var findInput = bar.querySelector('#fr-find');
    var replaceInput = bar.querySelector('#fr-replace');
    var countEl = bar.querySelector('#fr-count');
    var replaceRow = bar.querySelector('#fr-replace-row');
    var state = { matches: [], index: -1, mode: 'find', composing: false };
    var measureMirror = null;

    function tr(key) {
      return (global.MDAI18n && global.MDAI18n.t) ? global.MDAI18n.t(key) : key;
    }

    function applyLang() {
      findInput.placeholder = tr('findPlaceholder');
      replaceInput.placeholder = tr('replacePlaceholder');
      bar.querySelector('#fr-prev').title = tr('findPrev');
      bar.querySelector('#fr-next').title = tr('findNext');
      bar.querySelector('#fr-close').title = tr('findClose');
      var caseSpan = bar.querySelector('[data-fr="case"]');
      var regexSpan = bar.querySelector('[data-fr="regex"]');
      if (caseSpan) caseSpan.textContent = tr('findCase');
      if (regexSpan) regexSpan.textContent = tr('findRegex');
      bar.querySelector('#fr-replace-one').textContent = tr('replace');
      bar.querySelector('#fr-replace-all').textContent = tr('replaceAll');
      if (typeof updateCount === 'function') updateCount();
    }

    applyLang();

    function getMeasureMirror() {
      if (measureMirror) return measureMirror;
      measureMirror = document.createElement('div');
      measureMirror.setAttribute('aria-hidden', 'true');
      measureMirror.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;pointer-events:none;';
      document.body.appendChild(measureMirror);
      return measureMirror;
    }

    function measureEditorTextWidth(text) {
      if (!text) return 0;
      var mirror = getMeasureMirror();
      var style = window.getComputedStyle(editorEl);
      mirror.style.font = style.font;
      mirror.style.tabSize = style.tabSize || '2';
      mirror.style.letterSpacing = style.letterSpacing;
      mirror.style.fontVariantLigatures = style.fontVariantLigatures;
      mirror.style.fontFeatureSettings = style.fontFeatureSettings;
      mirror.textContent = text;
      return mirror.offsetWidth;
    }

    function scrollMatchHorizontally(m) {
      if (!m) return;
      var full = editorEl.value;
      var lineStart = full.lastIndexOf('\n', m.start - 1) + 1;
      var before = full.slice(lineStart, m.start);
      var matchText = full.slice(m.start, m.end);
      var xStart = measureEditorTextWidth(before);
      var xEnd = xStart + measureEditorTextWidth(matchText || ' ');
      var cs = window.getComputedStyle(editorEl);
      var padL = parseFloat(cs.paddingLeft) || 0;
      var padR = parseFloat(cs.paddingRight) || 0;
      var viewW = Math.max(0, editorEl.clientWidth - padL - padR);
      var margin = 48;
      var scrollLeft = editorEl.scrollLeft;
      if (xStart < scrollLeft + margin) {
        scrollLeft = Math.max(0, xStart - margin);
      } else if (xEnd > scrollLeft + viewW - margin) {
        scrollLeft = Math.max(0, xEnd - viewW + margin);
      }
      editorEl.scrollLeft = scrollLeft;
    }

    function notifyMatches() {
      if (onMatchesChange) {
        onMatchesChange(state.matches, state.index, {
          query: findInput.value,
          caseSensitive: bar.querySelector('#fr-case').checked,
          regex: bar.querySelector('#fr-regex').checked,
        });
      }
    }

    function scrollToMatch(m) {
      if (!m) return;
      var line = editorEl.value.slice(0, m.start).split('\n').length;
      var pad = 0;
      try { pad = parseFloat(window.getComputedStyle(editorEl).paddingTop) || 0; } catch (e) { /* ignore */ }
      editorEl.scrollTop = Math.max(0, pad + (line - 1) * LINE_H - Math.floor(editorEl.clientHeight / 3));
      editorEl.setSelectionRange(m.start, m.end);
      scrollMatchHorizontally(m);
      if (syncEditorScroll) syncEditorScroll();
    }

    function refreshMatches(jumpToFirst) {
      var text = editorEl.value;
      var query = findInput.value;
      state.matches = findAll(text, query, {
        caseSensitive: bar.querySelector('#fr-case').checked,
        regex: bar.querySelector('#fr-regex').checked,
      });
      if (jumpToFirst && state.matches.length) state.index = 0;
      if (state.index >= state.matches.length) state.index = state.matches.length - 1;
      if (state.index < 0 && state.matches.length) state.index = 0;
      updateCount();
      notifyMatches();
      if (state.matches.length && state.index >= 0) {
        scrollToMatch(state.matches[state.index]);
      }
      refocusBar();
    }

    function updateCount() {
      if (!findInput.value) {
        countEl.textContent = '';
        return;
      }
      if (!state.matches.length) {
        countEl.textContent = tr('findNoMatch');
        return;
      }
      countEl.textContent = (state.index + 1) + ' / ' + state.matches.length;
    }

    function highlightCurrent() {
      if (!state.matches.length || state.index < 0) return;
      scrollToMatch(state.matches[state.index]);
      notifyMatches();
      refocusBar();
    }

    function findNext(backward) {
      if (!state.matches.length) {
        refreshMatches(false);
        return;
      }
      if (backward) {
        state.index = (state.index - 1 + state.matches.length) % state.matches.length;
      } else {
        state.index = (state.index + 1) % state.matches.length;
      }
      updateCount();
      highlightCurrent();
    }

    function refocusBar() {
      var ae = document.activeElement;
      if (ae === replaceInput || ae === findInput) return;
      findInput.focus();
    }

    function replaceOne() {
      refreshMatches(false);
      if (!state.matches.length || state.index < 0) return;
      var m = state.matches[state.index];
      var rep = replaceInput.value;
      editorEl.focus();
      editorEl.setSelectionRange(m.start, m.end);
      if (document.execCommand('insertText', false, rep)) {
        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        if (onDirty) onDirty();
      } else {
        var val = editorEl.value;
        editorEl.value = val.slice(0, m.start) + rep + val.slice(m.end);
        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        if (onDirty) onDirty();
      }
      refreshMatches(false);
      if (state.matches.length) findNext(false);
    }

    function replaceAll() {
      var query = findInput.value;
      if (!query) return;
      var opts = {
        caseSensitive: bar.querySelector('#fr-case').checked,
        regex: bar.querySelector('#fr-regex').checked,
      };
      var rep = replaceInput.value;
      var val = editorEl.value;
      var matches = findAll(val, query, opts);
      for (var i = matches.length - 1; i >= 0; i--) {
        var m = matches[i];
        val = val.slice(0, m.start) + rep + val.slice(m.end);
      }
      editorEl.focus();
      editorEl.setSelectionRange(0, editorEl.value.length);
      if (!document.execCommand('insertText', false, val)) {
        editorEl.value = val;
      }
      editorEl.dispatchEvent(new Event('input', { bubbles: true }));
      if (onDirty) onDirty();
      refreshMatches(false);
    }

    function show(mode) {
      state.mode = mode || 'find';
      bar.classList.remove('hidden');
      replaceRow.classList.toggle('hidden', state.mode !== 'replace');
      findInput.focus();
      findInput.select();
      refreshMatches(true);
    }

    function hide() {
      bar.classList.add('hidden');
      state.matches = [];
      state.index = -1;
      if (onMatchesChange) onMatchesChange([], -1, { query: '', caseSensitive: false, regex: false });
      editorEl.focus();
    }

    function isOpen() {
      return !bar.classList.contains('hidden');
    }

    function onFindInput() {
      if (state.composing) return;
      state.index = 0;
      refreshMatches(false);
    }

    findInput.addEventListener('compositionstart', function () { state.composing = true; });
    findInput.addEventListener('compositionend', function () {
      state.composing = false;
      onFindInput();
    });
    replaceInput.addEventListener('compositionstart', function () { state.composing = true; });
    replaceInput.addEventListener('compositionend', function () { state.composing = false; });

    findInput.addEventListener('input', onFindInput);
    bar.querySelector('#fr-case').addEventListener('change', function () { refreshMatches(false); });
    bar.querySelector('#fr-regex').addEventListener('change', function () { refreshMatches(false); });
    bar.querySelector('#fr-next').addEventListener('click', function () { findNext(false); });
    bar.querySelector('#fr-prev').addEventListener('click', function () { findNext(true); });
    bar.querySelector('#fr-close').addEventListener('click', hide);
    bar.querySelector('#fr-replace-one').addEventListener('click', replaceOne);
    bar.querySelector('#fr-replace-all').addEventListener('click', replaceAll);

    bar.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    bar.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
      if (e.key === 'Enter' && !state.composing) {
        e.preventDefault();
        findNext(e.shiftKey);
      }
    });

    [findInput, replaceInput].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
    });

    return { show: show, hide: hide, isOpen: isOpen, findNext: findNext, refreshMatches: refreshMatches, applyLang: applyLang };
  }

  var api = { findAll: findAll, mount: mount };
  global.MDAFindReplace = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);

/**
 * Pro AI 面板：续写流式预览、Ctrl+Space 补全弹层、美化 diff。
 */
(function (global) {
  function t(key, vars) {
    if (global.MDAI18n && typeof global.MDAI18n.t === 'function') {
      return global.MDAI18n.t(key, vars);
    }
    return key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {{
   *   api: any,
   *   getEditor: () => HTMLTextAreaElement|null,
   *   getFileName?: () => string,
   *   toast?: (msg: string) => void,
   *   alert?: (msg: string) => void|Promise<void>,
   *   openSettings?: (pane?: string) => void,
   *   applyInsert?: (text: string, mode: 'insert'|'replaceSelection'|'replaceRange', range?: {start:number,end:number}) => void,
   * }} opts
   */
  function createAiPanel(opts) {
    const api = opts.api;
    const toast = opts.toast || function () {};
    const alertFn = opts.alert || function () {};
    let unsubChunk = null;
    let unsubDone = null;
    let unsubError = null;
    let activeOverlay = null;
    let streaming = false;

    function cleanupListeners() {
      if (unsubChunk) { unsubChunk(); unsubChunk = null; }
      if (unsubDone) { unsubDone(); unsubDone = null; }
      if (unsubError) { unsubError(); unsubError = null; }
    }

    function closeActive() {
      cleanupListeners();
      if (streaming && api.aiCancel) api.aiCancel();
      streaming = false;
      if (activeOverlay && activeOverlay.isConnected) activeOverlay.remove();
      activeOverlay = null;
    }

    function gateOrRun(fn) {
      return api.checkAiAccess().then(function (r) {
        if (!r || !r.success) {
          alertFn(t('aiErrorGeneric', { error: (r && r.error) || '' }));
          return;
        }
        const access = r.value || {};
        if (!access.allowed) {
          if (access.reason === 'upgrade') {
            alertFn(t('aiNeedPro')).then(function () {
              if (opts.openSettings) opts.openSettings('pro');
            });
          } else if (access.reason === 'need_key') {
            alertFn(t('aiNeedKey')).then(function () {
              if (opts.openSettings) opts.openSettings('pro');
            });
          }
          return;
        }
        fn();
      });
    }

    function editorContext() {
      const ed = opts.getEditor && opts.getEditor();
      if (!ed) return null;
      const start = ed.selectionStart;
      const end = ed.selectionEnd;
      const val = ed.value;
      return {
        editor: ed,
        start: start,
        end: end,
        value: val,
        textBefore: val.slice(0, start),
        textAfter: val.slice(end),
        selection: start === end ? '' : val.slice(start, end),
        fileName: opts.getFileName ? opts.getFileName() : '',
      };
    }

    function showStreamPanel(title, onAccept) {
      closeActive();
      const overlay = document.createElement('div');
      overlay.className = 'mda-ai-overlay';
      overlay.innerHTML =
        '<div class="mda-ai-panel" role="dialog" aria-modal="true">' +
          '<div class="mda-ai-panel-head">' +
            '<strong>' + esc(title) + '</strong>' +
            '<button type="button" class="mda-ai-btn" data-act="cancel">' + esc(t('cancel')) + '</button>' +
          '</div>' +
          '<pre class="mda-ai-stream" id="mda-ai-stream"></pre>' +
          '<div class="mda-ai-panel-foot">' +
            '<button type="button" class="mda-ai-btn" data-act="stop" disabled>' + esc(t('aiStop')) + '</button>' +
            '<button type="button" class="mda-ai-btn mda-ai-btn-primary" data-act="accept" disabled>' +
              esc(t('aiAccept')) + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      activeOverlay = overlay;
      const streamEl = overlay.querySelector('#mda-ai-stream');
      const stopBtn = overlay.querySelector('[data-act="stop"]');
      const acceptBtn = overlay.querySelector('[data-act="accept"]');
      let full = '';

      function setStreaming(on) {
        streaming = on;
        if (stopBtn) stopBtn.disabled = !on;
        if (acceptBtn) acceptBtn.disabled = on || !full;
      }

      overlay.querySelector('[data-act="cancel"]').addEventListener('click', closeActive);
      stopBtn.addEventListener('click', function () {
        if (api.aiCancel) api.aiCancel();
        setStreaming(false);
      });
      acceptBtn.addEventListener('click', function () {
        if (!full) return;
        onAccept(full);
        closeActive();
      });

      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeActive();
        } else if (e.key === 'Enter' && !e.shiftKey && !streaming && full) {
          e.preventDefault();
          onAccept(full);
          closeActive();
        }
      });

      cleanupListeners();
      if (api.onAiChunk) {
        unsubChunk = api.onAiChunk(function (chunk) {
          full += chunk || '';
          if (streamEl) streamEl.textContent = full;
        });
      }
      if (api.onAiDone) {
        unsubDone = api.onAiDone(function (text) {
          if (text) full = text;
          if (streamEl) streamEl.textContent = full;
          setStreaming(false);
        });
      }
      if (api.onAiError) {
        unsubError = api.onAiError(function (message) {
          setStreaming(false);
          if (message && message !== '已取消') {
            alertFn(t('aiErrorGeneric', { error: message }));
          }
        });
      }

      setStreaming(true);
      return { setStreaming: setStreaming, getFull: function () { return full; } };
    }

    function showCompletePopup(suggestion, onAccept) {
      closeActive();
      const overlay = document.createElement('div');
      overlay.className = 'mda-ai-overlay mda-ai-overlay-popup';
      overlay.innerHTML =
        '<div class="mda-ai-popup" role="dialog">' +
          '<div class="mda-ai-popup-label">' + esc(t('aiCompleteTitle')) + '</div>' +
          '<pre class="mda-ai-stream">' + esc(suggestion) + '</pre>' +
          '<div class="mda-ai-panel-foot">' +
            '<span class="mda-ai-hint">' + esc(t('aiCompleteHint')) + '</span>' +
            '<button type="button" class="mda-ai-btn" data-act="cancel">' + esc(t('cancel')) + '</button>' +
            '<button type="button" class="mda-ai-btn mda-ai-btn-primary" data-act="accept">' +
              esc(t('aiAccept')) + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      activeOverlay = overlay;
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', closeActive);
      overlay.querySelector('[data-act="accept"]').addEventListener('click', function () {
        onAccept(suggestion);
        closeActive();
      });
      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeActive();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          onAccept(suggestion);
          closeActive();
        }
      });
      const acc = overlay.querySelector('[data-act="accept"]');
      if (acc) acc.focus();
    }

    function showBeautifyDiff(original, suggestion, onAccept) {
      closeActive();
      const overlay = document.createElement('div');
      overlay.className = 'mda-ai-overlay';
      overlay.innerHTML =
        '<div class="mda-ai-panel mda-ai-panel-wide" role="dialog" aria-modal="true">' +
          '<div class="mda-ai-panel-head">' +
            '<strong>' + esc(t('aiBeautifyTitle')) + '</strong>' +
            '<button type="button" class="mda-ai-btn" data-act="cancel">' + esc(t('cancel')) + '</button>' +
          '</div>' +
          '<div class="mda-ai-diff">' +
            '<div><div class="mda-ai-diff-label">' + esc(t('aiDiffOriginal')) + '</div>' +
              '<pre class="mda-ai-stream">' + esc(original) + '</pre></div>' +
            '<div><div class="mda-ai-diff-label">' + esc(t('aiDiffSuggestion')) + '</div>' +
              '<textarea class="mda-ai-stream mda-ai-edit" id="mda-ai-edit">' + esc(suggestion) + '</textarea></div>' +
          '</div>' +
          '<div class="mda-ai-panel-foot">' +
            '<button type="button" class="mda-ai-btn" data-act="keep">' + esc(t('aiKeepOriginal')) + '</button>' +
            '<button type="button" class="mda-ai-btn mda-ai-btn-primary" data-act="accept">' +
              esc(t('aiAccept')) + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      activeOverlay = overlay;
      const edit = overlay.querySelector('#mda-ai-edit');
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', closeActive);
      overlay.querySelector('[data-act="keep"]').addEventListener('click', closeActive);
      overlay.querySelector('[data-act="accept"]').addEventListener('click', function () {
        const text = edit ? edit.value : suggestion;
        onAccept(text);
        closeActive();
      });
      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeActive();
        }
      });
    }

    function runContinue() {
      gateOrRun(function () {
        const ctx = editorContext();
        if (!ctx) return;
        showStreamPanel(t('aiContinueTitle'), function (text) {
          if (opts.applyInsert) opts.applyInsert(text, 'insert');
          toast(t('aiAccepted'));
        });
        api.aiContinue({
          textBefore: ctx.textBefore,
          textAfter: ctx.textAfter,
          selection: ctx.selection,
          fileName: ctx.fileName,
        }).then(function (r) {
          if (!r || !r.success) {
            closeActive();
            alertFn(t('aiErrorGeneric', { error: (r && r.error) || '' }));
          }
        });
      });
    }

    function runComplete() {
      gateOrRun(function () {
        const ctx = editorContext();
        if (!ctx) return;
        toast(t('aiWorking'));
        api.aiComplete({
          textBefore: ctx.textBefore,
          textAfter: ctx.textAfter,
          fileName: ctx.fileName,
        }).then(function (r) {
          if (!r || !r.success) {
            alertFn(t('aiErrorGeneric', { error: (r && r.error) || '' }));
            return;
          }
          const suggestion = (r.value && r.value.text) || '';
          if (!suggestion) {
            toast(t('aiEmptyResult'));
            return;
          }
          showCompletePopup(suggestion, function (text) {
            if (opts.applyInsert) opts.applyInsert(text, 'insert');
            toast(t('aiAccepted'));
          });
        });
      });
    }

    function runBeautify() {
      gateOrRun(function () {
        const ctx = editorContext();
        if (!ctx) return;
        const hasSel = ctx.start !== ctx.end;
        const source = hasSel ? ctx.selection : ctx.value;
        if (!String(source).trim()) {
          alertFn(t('aiBeautifyEmpty'));
          return;
        }
        toast(t('aiWorking'));
        api.aiBeautify({
          source: source,
          scope: hasSel ? 'selection' : 'document',
          fileName: ctx.fileName,
        }).then(function (r) {
          if (!r || !r.success) {
            alertFn(t('aiErrorGeneric', { error: (r && r.error) || '' }));
            return;
          }
          const suggestion = (r.value && r.value.text) || '';
          showBeautifyDiff(source, suggestion, function (text) {
            if (hasSel) {
              if (opts.applyInsert) {
                opts.applyInsert(text, 'replaceRange', { start: ctx.start, end: ctx.end });
              }
            } else if (opts.applyInsert) {
              opts.applyInsert(text, 'replaceDocument');
            }
            toast(t('aiAccepted'));
          });
        });
      });
    }

    return {
      runContinue: runContinue,
      runComplete: runComplete,
      runBeautify: runBeautify,
      close: closeActive,
      isOpen: function () { return !!(activeOverlay && activeOverlay.isConnected); },
    };
  }

  global.MDAAiPanel = { create: createAiPanel };
})(typeof window !== 'undefined' ? window : global);

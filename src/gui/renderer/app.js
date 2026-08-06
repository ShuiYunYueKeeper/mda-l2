// MDA Renderer — Markdown 工作台 GUI
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
  var editorUserDismissed = false; // 用户手动收起后，切换文档不再自动展开
  var panelVisible = false;       // 右侧批注栏（习惯记忆，见 mda-panel-visible）
  var expandedAnnoIds = {};       // 批注列表长文展开状态（会话内）
  var dirty = false;              // 编辑器内容是否有未保存修改
  var previewTimer = null;        // 实时预览防抖
  var pinEditorScroll = null;     // Enter/删改时钉住编辑区滚动，防止浏览器/重渲拽飞
  var closePromptOpen = false;    // 防止重复弹出关闭确认框
  var autosavePref = 'off';       // off | blur | interval:30 | interval:60
  var autosaveTimer = null;
  var autosaveSaving = false;
  var annoWriteQueue = Promise.resolve();
  var annoAutoSaveToastTimer = 0;

  // 文档状态机：welcome | untitled | open（见 P2 §4.1）
  var docState = 'welcome';
  // 清空「最近打开」后，在用户主动打开文件前禁止把当前文档写回历史（否则重载会恢复列表，下次启动又自动打开）
  var allowAddRecent = true;
  // 记住上次会话（文件列表 + 当前文件）；与 main workspace-prefs.rememberSession 同步，默认 true
  var rememberSessionPref = true;
  var workspaceRoot = null;
  var fsClip = null;
  var fsUndoStack = [];
  var welcomePane = null;
  var fileSidebar = null;
  var contentRowEl = null;
  var leftRailEl = null;
  var syncScrollCtrl = null;
  var findReplaceUi = null;
  var outlinePanelUi = null;
  var outlineFloatBtn = null;
  var outlineExpandRail = null;
  var outlineJumpLock = false;
  var outlineScrollRaf = null;
  var assist = null;
  var aiPanel = null;
  var settingsOpenPane = 'general';
  var selAnchor = null;
  var anchorHl = null;
  var selectionMenuDismiss = null;
  var previewSelectionSnap = null;
  var previewPointer = { down: false, dragged: false, x: 0, y: 0 };

  var filterStatus = { open: true, resolved: false, wontfix: false };
  var filterLevel = { critical: true, major: true, minor: true, info: true };
  var filterTags = {};

  var LEVEL_COLORS = (api && api.levelColors) || { critical: '#e74c3c', major: '#e67e22', minor: '#f1c40f', info: '#95a5a6' };
  var LEVEL_ORDER = (api && api.levelSeverity) || { critical: 3, major: 2, minor: 1, info: 0 };

  // DOM 元素
  var previewEl, annoListEl, statusFiltersEl, levelFiltersEl, tagFiltersEl, tagFiltersRow;
  var previewPaneEl, previewScrollEl, editorPaneEl, editorEl, panelPaneEl;
  var srcGutterEl, srcHighlightEl, srcFindMarkEl, splitFilesEl, splitLeftEl, splitRightEl, splitOutlineEl;
  var findMatchState = null; // { matches: [{start,end}], index: number }
  var cm6Editor = null;
  var cm6HostEl = null;
  var cm6SearchSession = null;
  var tbEditBtn, tbPanelBtn, tbFilesBtn, tbFileNameEl, addBtn, clearAllBtn;

  var MOD_KEY = (navigator.platform || '').toLowerCase().indexOf('mac') >= 0 ? '\u2318' : 'Ctrl+';

  function uiT(key, vars) {
    return (window.MDAI18n && window.MDAI18n.t) ? window.MDAI18n.t(key, vars) : key;
  }

  // ---- CM6 实验编辑面（M8-A5–A8）----
  function isCm6Enabled() {
    return !!(window.MDAEditor && window.MDAEditor.isEnabledByPref && window.MDAEditor.isEnabledByPref());
  }

  /** CM6 偏好已开且 EditorView 已成功挂载（用于 UI 切换，避免隐藏 2.0 编辑面后白屏） */
  function isCm6Ready() {
    return isCm6Enabled() && !!cm6Editor;
  }

  function getEditorTextValue() {
    if (isCm6Enabled() && cm6Editor) return cm6Editor.getText();
    return editorEl ? editorEl.value : '';
  }

  function getEditorSaveText() {
    if (isCm6Enabled() && cm6Editor) return cm6Editor.getTextForSave();
    return editorEl ? editorEl.value : '';
  }

  /** 脏检查：忽略 BOM / 换行风格差异（CM6 模型不含 BOM，且统一 LF） */
  function normalizeEditorCompareText(text) {
    if (text == null) return '';
    var s = String(text);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function setEditorTextValue(text, opts) {
    opts = opts || {};
    if (editorEl) {
      editorEl.value = text == null ? '' : String(text);
      if (opts.selectionStart != null) {
        var len = editorEl.value.length;
        editorEl.selectionStart = Math.min(opts.selectionStart, len);
        editorEl.selectionEnd = Math.min(opts.selectionEnd != null ? opts.selectionEnd : opts.selectionStart, len);
      }
    }
    if (isCm6Enabled() && cm6Editor) {
      cm6Editor.setText(text == null ? '' : String(text), {
        resetHistory: !!opts.resetHistory,
        keepHistory: opts.keepHistory,
      });
    }
  }

  function syncDirtyFromEditor() {
    setDirtyState(
      normalizeEditorCompareText(getEditorTextValue()) !==
        normalizeEditorCompareText(currentText)
    );
  }

  function clearCm6DocumentUi() {
    document.body.classList.remove('mda-cm6-active');
    document.body.classList.remove('mda-cm6-doc-open');
    if (cm6HostEl) cm6HostEl.classList.add('hidden');
  }

  function toLocalFileUrl(absPath) {
    if (!absPath) return null;
    var p = String(absPath).replace(/\\/g, '/');
    return 'file:///' + encodeURI(p.replace(/^\/+/, ''));
  }

  function resolveImageUrlForEditor(href) {
    if (!href) return null;
    if (/^(https?:|data:|file:)/i.test(href)) return href;
    if (!currentFilePath || !api.resolvePath) return null;
    var abs = api.resolvePath(currentFilePath, href);
    if (!abs) return null;
    return toLocalFileUrl(abs);
  }

  function normalizeImageRefForMarkdown(absPath) {
    if (!absPath) return '';
    var abs = String(absPath).replace(/\\/g, '/');
    if (!currentFilePath || !api.relativePathFrom) return abs;
    var rel = api.relativePathFrom(currentFilePath, absPath);
    if (!rel) return abs;
    rel = String(rel).replace(/\\/g, '/');
    // 跨盘符时 path.relative 会回落为绝对路径，勿加 ./
    if (/^[a-zA-Z]:/.test(rel)) return rel;
    if (!rel.startsWith('.') && rel.length) rel = './' + rel;
    return rel;
  }

  function pickAndInsertImage(where, block) {
    if (!isCm6Ready() || !window.MDAEditor || !currentFilePath) {
      uiAlert(uiT('alertOpenDocFirst'));
      return;
    }
    if (!api.showPickImageDialog) return;
    api.showPickImageDialog().then(function (r) {
      if (!r || !r.success || r.canceled || !r.filePath) return;
      var href = normalizeImageRefForMarkdown(r.filePath);
      var line = window.MDAEditor.serializeImageMarkdown({
        alt: '',
        src: href,
        title: '',
      });
      if (!line || !cm6Editor.view) return;
      var view = cm6Editor.view;
      var ok = false;
      if (where === 'blank') {
        ok = window.MDAEditor.insertMarkdownAtBlankLine(view, block, line);
      } else if (where === 'above' || where === 'below') {
        ok = window.MDAEditor.insertMarkdownNearBlock(view, block, where, line);
      }
      if (ok) {
        syncDirtyFromEditor();
        refreshCm6Decorations();
      }
    });
  }

  function pasteClipboardImageToEditor(block, pos) {
    if (!isCm6Ready() || !window.MDAEditor || !currentFilePath || !api.saveClipboardImageAsset) {
      uiAlert(uiT('alertOpenDocFirst'));
      return;
    }
    api.saveClipboardImageAsset(currentFilePath).then(function (r) {
      if (!r || !r.success) {
        if (r && r.error) uiAlert(uiT('alertPasteImageEmpty'));
        return;
      }
      var href = r.relativePath || normalizeImageRefForMarkdown(r.filePath);
      var meta = block && block.meta ? block.meta : {};
      var line = window.MDAEditor.serializeImageMarkdown({
        alt: meta.alt || '',
        src: href,
        title: meta.title || '',
      });
      if (!line) return;
      if (block && block.from != null && block.to != null) {
        window.MDAEditor.replaceBlockRange(cm6Editor.view, block.from, block.to, line);
      } else if (pos != null) {
        window.MDAEditor.insertImageAt(cm6Editor.view, pos, line);
      }
      syncDirtyFromEditor();
    });
  }

  function refreshCm6Decorations() {
    if (!isCm6Ready() || !cm6Editor.view) return;
    try {
      if (window.MDAEditor && typeof window.MDAEditor.refreshDecorations === 'function') {
        window.MDAEditor.refreshDecorations(cm6Editor.view);
        return;
      }
    } catch (_) {
      /* ignore */
    }
    try {
      cm6Editor.view.dispatch({});
    } catch (_) {
      /* ignore */
    }
  }

  function applyCm6DocumentUi() {
    if (!isCm6Enabled()) {
      clearCm6DocumentUi();
      return;
    }
    if (!cm6Editor) initCm6Editor();
    if (!isCm6Ready()) {
      clearCm6DocumentUi();
      return;
    }
    document.body.classList.add('mda-cm6-active');
    var docOpen = docState === 'open' || docState === 'untitled';
    document.body.classList.toggle('mda-cm6-doc-open', docOpen);
    if (cm6HostEl) cm6HostEl.classList.toggle('hidden', !docOpen);
    if (docOpen) bindCm6OutlineScroll();
  }

  function initCm6Editor() {
    if (!isCm6Enabled() || !previewScrollEl || cm6Editor) return;
    if (!window.MDAEditor) {
      console.error('[mda-cm6] editor.bundle.js 未加载，已回退 2.0 编辑面');
      return;
    }
    if (!cm6HostEl) {
      cm6HostEl = document.createElement('div');
      cm6HostEl.id = 'cm-editor-host';
      cm6HostEl.className = 'mda-cm6-host hidden';
      if (previewEl && previewEl.parentNode === previewScrollEl) {
        previewScrollEl.insertBefore(cm6HostEl, previewEl);
      } else {
        previewScrollEl.appendChild(cm6HostEl);
      }
    }
    if (window.MDAEditor.SearchSession && !cm6SearchSession) {
      cm6SearchSession = new window.MDAEditor.SearchSession();
    }
    var mode = window.MDAEditor.MODE_PREVIEW || 'preview';
    try {
      cm6Editor = window.MDAEditor.createEditor({
        parent: cm6HostEl,
        doc: '',
        mode: mode,
        placeholder: uiT('editorPlaceholder'),
        parseAnnotations: function (text) { return api.parseAnnotations(text); },
        levelColors: LEVEL_COLORS,
        levelSeverity: (api && api.levelSeverity) || { critical: 3, major: 2, minor: 1, info: 0 },
        renderMarkdown: function (text) { return api.renderMarkdown(text); },
        resolveImageUrl: resolveImageUrlForEditor,
        onChange: function () {
          syncDirtyFromEditor();
          if (previewTimer) clearTimeout(previewTimer);
          previewTimer = setTimeout(function () {
            var text = getEditorTextValue();
            parseAndRender(text, currentFilePath, { cm6Live: true });
          }, 250);
        },
        onViewportChange: function () {
          scheduleOutlineActiveFromScroll();
        },
        onHeadingClick: function (line) {
          syncOutlineFromHeadingClick(line);
        },
        onOpenLink: function (href) {
          handleLinkClick(href);
        },
        onModeChange: function (next) {
          editorVisible = next === (window.MDAEditor.MODE_SOURCE || 'source');
          updateToolbar();
        },
        t: uiT,
        copyText: function (text) {
          if (api.copyToClipboard) api.copyToClipboard(text);
        },
        copyHtml: function (html, text) {
          if (api.copyArticleHtml) {
            api.copyArticleHtml(html, text == null ? '' : String(text));
            return;
          }
          if (api.copyToClipboard) api.copyToClipboard(text == null ? '' : String(text));
        },
        highlightCode: function (code, lang) {
          if (!api.highlightSource) return null;
          var fenced = '```' + (lang || '') + '\n' + code + '\n```';
          var html = api.highlightSource(fenced);
          var lines = String(html || '').split('\n');
          if (lines.length >= 3) return lines.slice(1, -1).join('\n');
          var m = /<code[^>]*class="[^"]*hljs[^"]*"[^>]*>([\s\S]*?)<\/code>/i.exec(html);
          return m ? m[1] : null;
        },
        onScaleImage: function (img) {
          var key = img.getAttribute('src') || '';
          if (key && Object.prototype.hasOwnProperty.call(imageDisplayWidths, key)) {
            applyImageDisplayWidth(img, imageDisplayWidths[key], { allowOverflow: true });
            return;
          }
          applyDefaultScaleToImage(img);
        },
        getSavedDisplayWidth: function (src) {
          if (src && Object.prototype.hasOwnProperty.call(imageDisplayWidths, src)) {
            return imageDisplayWidths[src];
          }
          return 0;
        },
        onStartImageResize: function (img, e) {
          startPreviewResize(img, 'img', e);
        },
        onImageResize: function (img, widthPx) {
          applyImageDisplayWidth(img, widthPx, { allowOverflow: true });
        },
        onImageResizeEnd: function () {
          if (isCm6Ready() && cm6Editor && cm6Editor.view) {
            try {
              cm6Editor.view.requestMeasure();
              requestAnimationFrame(function () {
                if (typeof cm6Editor.syncSelectedImageFrame === 'function') {
                  cm6Editor.syncSelectedImageFrame();
                }
              });
            } catch (_) {
              /* ignore */
            }
          }
        },
        onScaleMermaid: function (stage) {
          var key = stage.getAttribute('data-mermaid-src') || '';
          if (key && Object.prototype.hasOwnProperty.call(mermaidDisplayWidths, key)) {
            applyMermaidDisplayWidth(stage, mermaidDisplayWidths[key]);
            return;
          }
          applyDefaultScaleToMermaid(stage);
        },
        getSavedMermaidDisplayWidth: function (src) {
          if (src && Object.prototype.hasOwnProperty.call(mermaidDisplayWidths, src)) {
            return mermaidDisplayWidths[src];
          }
          return 0;
        },
        onMermaidResize: function (stage, widthPx) {
          applyMermaidDisplayWidth(stage, widthPx);
        },
        onMermaidResizeEnd: function () {
          if (isCm6Ready() && cm6Editor && cm6Editor.view) {
            try {
              cm6Editor.view.requestMeasure();
            } catch (_) {
              /* ignore */
            }
          }
        },
        onMermaidResizeReset: function (stage) {
          restoreMediaToSettingsScale(stage, 'mermaid');
          if (isCm6Ready() && cm6Editor && cm6Editor.view) {
            try {
              cm6Editor.view.requestMeasure();
            } catch (_) {
              /* ignore */
            }
          }
        },
        onCopyMermaidImage: function (stage, code) {
          var svg = stage && stage.querySelector('svg');
          if (!svg) {
            showToast(uiT('toastNoCopy'));
            return;
          }
          copyZoomMermaidImage({ mermaidSrc: code || '', svgNode: svg });
        },
        onCopyMathImage: function (displayEl) {
          function fail(err) {
            uiAlert(uiT('alertZoomCopyFail', { error: err || uiT('unknownError') }));
          }
          if (!displayEl || !api.copyClipboardImage) {
            showToast(uiT('toastNoCopy'));
            return;
          }
          var katexEl =
            displayEl.querySelector('.katex-display') ||
            displayEl.querySelector('.katex');
          if (!katexEl) {
            showToast(uiT('toastNoCopy'));
            return;
          }
          Promise.resolve()
            .then(function () {
              return katexElToPngDataUrl(katexEl);
            })
            .then(function (png) {
              // katexElToPngDataUrl 返回 { dataUrl, width, height }
              var dataUrl = png && typeof png === 'object' ? png.dataUrl : png;
              if (!isValidPngDataUrl(dataUrl)) throw new Error(uiT('unknownError'));
              return api.copyClipboardImage({ dataUrl: dataUrl });
            })
            .then(function (r) {
              if (r && r.success) showToast(uiT('toastZoomCopiedImage'));
              else fail(r && r.error);
            })
            .catch(function (e) {
              fail(e && e.message ? e.message : String(e));
            });
        },
        onEditMermaidBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var line = fenceMermaidSource(block.code);
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.replaceBlockRange(cm6Editor.view, range.from, range.to, line);
          syncDirtyFromEditor();
        },
        onEditCodeBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var line = window.MDAEditor.serializeFencedCode
            ? window.MDAEditor.serializeFencedCode(block.lang, block.code, block.marker)
            : fenceCodeSource(block.lang, block.code);
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.replaceBlockRange(cm6Editor.view, range.from, range.to, line);
          syncDirtyFromEditor();
        },
        onCodeBlockDirty: function (info) {
          if (info && info.dirty === false) {
            syncDirtyFromEditor();
            return;
          }
          setDirtyState(true);
        },
        onEditMathBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var line = window.MDAEditor.serializeMathBlock
            ? window.MDAEditor.serializeMathBlock(block.tex)
            : '$$\n' + (block.tex || '') + '\n$$';
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.replaceBlockRange(cm6Editor.view, range.from, range.to, line);
          syncDirtyFromEditor();
        },
        onDeleteMermaidBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          // 保留选中内存态，撤销后由 selection sync 恢复蓝框
          window.MDAEditor.deleteBlockRange(cm6Editor.view, range.from, range.to);
          syncDirtyFromEditor();
          if (cm6Editor.view) cm6Editor.view.focus();
        },
        onMoveMermaidBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.moveBlockRange(
            cm6Editor.view,
            range.from,
            range.to,
            block.targetPos
          );
          syncDirtyFromEditor();
        },
        onDeleteCodeBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          // 保留选中内存态，撤销后由 selection sync 恢复蓝框
          window.MDAEditor.deleteBlockRange(cm6Editor.view, range.from, range.to);
          syncDirtyFromEditor();
          if (cm6Editor.view) cm6Editor.view.focus();
        },
        onMoveCodeBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.moveBlockRange(
            cm6Editor.view,
            range.from,
            range.to,
            block.targetPos
          );
          syncDirtyFromEditor();
        },
        onScaleCodeBlock: function (payload) {
          if (!payload || !payload.root) return;
          applyDefaultScaleToCodeBlock(payload.root);
        },
        onScaleTableBlock: function (payload) {
          if (!payload || !payload.root) return;
          applyDefaultScaleToTableBlock(payload.root);
        },
        toast: showToast,
        onBlockMenuSoon: function () {
          showToast(uiT('blockMenuSoon'));
        },
        getResizeMaxWidth: function () {
          return getPreviewMediaDragMaxWidthPx() || 1200;
        },
        onCopyImageBlock: function (block) {
          return copyImageBlockToClipboard(block);
        },
        onCopyBlockAsImage: function (block, kind) {
          copyCm6BlockAsImage(block, kind);
        },
        onCopyBlockAsMarkdown: function (block, kind) {
          copyCm6BlockAsMarkdown(block, kind);
        },
        onCopyImage: function (imgEl) {
          if (!imgEl) {
            showToast(uiT('toastNoCopy'));
            return;
          }
          copyBitmapImageToClipboard(imgEl.getAttribute('src') || '', imgEl);
        },
        onDeleteImageBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          window.MDAEditor.deleteImageBlock(cm6Editor.view, block);
          syncDirtyFromEditor();
          if (cm6Editor.view) cm6Editor.view.focus();
        },
        onReplaceImageBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block || !api.showPickImageDialog) return;
          api.showPickImageDialog().then(function (r) {
            if (!r || !r.success || r.canceled || !r.filePath) return;
            var href = normalizeImageRefForMarkdown(r.filePath);
            var meta = block.meta || {};
            var line = window.MDAEditor.serializeImageMarkdown({
              alt: meta.alt || '',
              src: href,
              title: meta.title || '',
            });
            if (!line) return;
            var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
            if (!range) return;
            window.MDAEditor.replaceBlockRange(cm6Editor.view, range.from, range.to, line);
            syncDirtyFromEditor();
            refreshCm6Decorations();
          });
        },
        onMoveImageBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.moveBlockRange(
            cm6Editor.view,
            range.from,
            range.to,
            block.targetPos
          );
          syncDirtyFromEditor();
        },
        onMoveMathBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.moveBlockRange(
            cm6Editor.view,
            range.from,
            range.to,
            block.targetPos
          );
          syncDirtyFromEditor();
        },
        onMoveTableBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.moveBlockRange(
            cm6Editor.view,
            range.from,
            range.to,
            block.targetPos
          );
          syncDirtyFromEditor();
        },
        onMoveQuoteBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.moveBlockRange(
            cm6Editor.view,
            range.from,
            range.to,
            block.targetPos
          );
          syncDirtyFromEditor();
        },
        onMoveHrBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block) return;
          var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
          if (!range) return;
          window.MDAEditor.moveBlockRange(
            cm6Editor.view,
            range.from,
            range.to,
            block.targetPos
          );
          syncDirtyFromEditor();
        },
        onDropReplaceImageBlock: function (block) {
          if (!isCm6Ready() || !window.MDAEditor || !block || !block.target) return;
          window.MDAEditor.dropReplaceImageBlock(cm6Editor.view, block, block.target);
          syncDirtyFromEditor();
        },
        onPasteImageBlock: function (block) {
          pasteClipboardImageToEditor(block, null);
        },
        onInsertImageAt: function (pos) {
          pasteClipboardImageToEditor(null, pos);
        },
        onPickImageInsert: function (where, block) {
          pickAndInsertImage(where, block);
        },
        onOpenZoom: function (payload) {
          if (payload && payload.node) openZoom(payload.node, payload.opts || {});
        },
        onSwitchSource: function (block) {
          if (!cm6Editor || !window.MDAEditor || !block) return;
          showEditorPane(true);
          if (cm6Editor.view) {
            cm6Editor.view.dispatch({
              selection: { anchor: block.from, head: block.to },
              scrollIntoView: true,
            });
            cm6Editor.focus();
          }
        },
        renderMermaid: function (src, holder) {
          var m = getMermaid();
          if (!m) {
            holder.textContent = uiT('mermaidMissing');
            return Promise.resolve();
          }
          var id = 'mmd-cm6-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
          try { m.initialize(mermaidInitOptions()); } catch (e) { /* ignore */ }
          return m.render(id, src).then(function (out) {
            holder.innerHTML = out.svg;
            holder.setAttribute('data-mermaid-src', src);
            if (out.bindFunctions) out.bindFunctions(holder);
            fixMermaidSvgLayout(holder);
            tuneMermaidSvgContrast(holder);
            rememberMermaidNaturalWidth(holder);
          });
        },
        onReadonlyBlocked: function () {
          uiAlert(uiT('widgetReadonlyBlocked'));
        },
      });
    } catch (err) {
      console.error('[mda-cm6] createEditor 失败，已回退 2.0 编辑面', err);
      cm6Editor = null;
      if (cm6HostEl && cm6HostEl.parentNode) cm6HostEl.parentNode.removeChild(cm6HostEl);
      cm6HostEl = null;
      return;
    }
    applyCm6DocumentUi();
    bindCm6OutlineScroll();
    bindCm6AutosaveBlur();
  }

  function focusActiveEditor() {
    if (isCm6Enabled() && cm6Editor) {
      cm6Editor.focus();
      return;
    }
    if (editorEl) editorEl.focus();
  }

  function performEditorUndo() {
    if (
      isCm6Ready() &&
      window.MDAEditor &&
      typeof window.MDAEditor.tryCodeBlockUndo === 'function' &&
      window.MDAEditor.tryCodeBlockUndo()
    ) {
      return;
    }
    if (isCm6Ready() && cm6Editor && typeof cm6Editor.undo === 'function') {
      if (cm6Editor.undo()) {
        syncDirtyFromEditor();
        return;
      }
    }
    if (editorEl && document.activeElement === editorEl) {
      try {
        document.execCommand('undo');
      } catch (_) {
        /* ignore */
      }
    }
  }

  function performEditorRedo() {
    if (
      isCm6Ready() &&
      window.MDAEditor &&
      typeof window.MDAEditor.tryCodeBlockRedo === 'function' &&
      window.MDAEditor.tryCodeBlockRedo()
    ) {
      return;
    }
    if (isCm6Ready() && cm6Editor && typeof cm6Editor.redo === 'function') {
      if (cm6Editor.redo()) {
        syncDirtyFromEditor();
        return;
      }
    }
    if (editorEl && document.activeElement === editorEl) {
      try {
        document.execCommand('redo');
      } catch (_) {
        /* ignore */
      }
    }
  }

  /** 文本框内的常用编辑快捷键（勿被设置模态的全局拦截吞掉） */
  function isEditableFieldShortcut(e) {
    var el = e.target;
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    var isField = tag === 'textarea' || el.isContentEditable;
    if (tag === 'input') {
      var type = String(el.type || 'text').toLowerCase();
      isField = type === 'text' || type === 'password' || type === 'search' ||
        type === 'url' || type === 'email' || type === 'tel' || type === 'number' || type === '';
    }
    if (!isField) return false;
    var mod = e.ctrlKey || e.metaKey;
    var k = (e.key || '').toLowerCase();
    if (mod && !e.altKey && (k === 'c' || k === 'v' || k === 'x' || k === 'a' || k === 'z' || k === 'y')) {
      return true;
    }
    // 部分键盘布局：Shift+Insert 粘贴、Ctrl+Insert 复制
    if (e.key === 'Insert' && (e.shiftKey || mod)) return true;
    return false;
  }

  function applyUiLang() {
    if (tbFilesBtn) {
      tbFilesBtn.textContent = uiT('tbFiles');
      tbFilesBtn.title = uiT('tbFilesTitle');
    }
    if (tbEditBtn) {
      tbEditBtn.textContent = uiT('tbEdit');
      tbEditBtn.title = uiT('tbEditTitle');
    }
    if (tbPanelBtn) {
      tbPanelBtn.textContent = uiT('tbPanel');
      tbPanelBtn.title = uiT('tbPanelTitle');
    }
    if (addBtn) addBtn.textContent = uiT('btnAddAnno');
    if (clearAllBtn) clearAllBtn.textContent = uiT('btnClearAllAnnos');
    if (editorEl) editorEl.placeholder = uiT('editorPlaceholder');
    document.querySelectorAll('[data-i18n-filter]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-filter');
      if (k) el.textContent = uiT(k);
    });
    if (welcomePane && welcomePane.applyLang) welcomePane.applyLang();
    if (fileSidebar && fileSidebar.applyLang) fileSidebar.applyLang();
    if (outlinePanelUi && outlinePanelUi.applyLang) outlinePanelUi.applyLang();
    if (outlineFloatBtn) outlineFloatBtn.title = uiT('outlineExpand');
    if (findReplaceUi && findReplaceUi.applyLang) findReplaceUi.applyLang();
    if (isCm6Ready() && cm6Editor && cm6Editor.view && window.MDAEditor && window.MDAEditor.refreshWidgetI18n) {
      window.MDAEditor.refreshWidgetI18n(cm6Editor.view, uiT);
    }
    updateToolbar();
    if (typeof renderAnnoList === 'function') {
      try { renderAnnoList(); } catch (e) { /* 列表可能尚未就绪 */ }
    }
  }

  function initUiLang() {
    function sync(lang) {
      if (window.MDAI18n) window.MDAI18n.setLang(lang === 'en' ? 'en' : 'zh');
      applyUiLang();
    }
    if (api.getLang) {
      api.getLang().then(function (r) {
        if (r && r.success) sync(r.lang);
        else sync('zh');
      }).catch(function () { sync('zh'); });
    } else {
      sync('zh');
    }
    if (api.onLangChanged) {
      api.onLangChanged(function (lang) { sync(lang); });
    }
  }

  // ---- 初始化 ----
  function init() {
    buildLayout();
    initTheme();
    initMermaid();
    initUiLang();

    api.onFileOpened(function (filePath) { requestOpen(filePath); });
    api.onSessionWelcome(function () { clearOpenDocument(); });
    if (api.onRecentFilesCleared) {
      api.onRecentFilesCleared(function () {
        // 仅刷新最近列表；保持当前文档，勿跳起始页。禁止本会话静默写回历史，保证下次空列表启动为起始页
        allowAddRecent = false;
        refreshWelcomeRecents();
      });
    }
    api.onReload(function () {
      if (isFileTreeFocused()) {
        renameActiveWorkspaceFile();
        return;
      }
      if (currentFilePath) requestOpen(currentFilePath);
    });
    api.onMenuShowInFolder(function () {
      if (currentFilePath) api.showItemInFolder(currentFilePath);
      else uiAlert(uiT('alertOpenFileFirst'));
    });
    api.onMenuToggleTheme(function () { toggleTheme(); });
    api.onMenuToggleEdit(function () { toggleEditor(); });
    api.onMenuTogglePanel(function () { togglePanel(); });
    api.onMenuSave(function () { saveFile(); });
    api.onMenuSaveAs(function () { saveAs(); });
    api.onMenuUndo(function () { performEditorUndo(); });
    api.onMenuRedo(function () { performEditorRedo(); });
    api.onMenuNewDocument(function () { newDocument(); });
    api.onMenuOpenFolder(function () { openWorkspaceFolder(); });
    api.onMenuShowHelp(function () { showHelpDialog(); });
    api.onMenuCopyArticle(function () { copyPreviewForArticle(); });
    api.onMenuExportHtml(function () { exportPreviewHtml(); });
    api.onMenuExportPdf(function () { exportPreviewPdf(); });
    api.onMenuExportDocx(function () { exportPreviewDocx(); });
    if (api.onMenuSettings) {
      api.onMenuSettings(function () { showSettingsDialog('general'); });
    }
    if (api.onMenuAiContinue) {
      api.onMenuAiContinue(function () { if (aiPanel) aiPanel.runContinue(); });
    }
    if (api.onMenuAiComplete) {
      api.onMenuAiComplete(function () { if (aiPanel) aiPanel.runComplete(); });
    }
    if (api.onMenuAiBeautify) {
      api.onMenuAiBeautify(function () { if (aiPanel) aiPanel.runBeautify(); });
    }
    setupAiPanel();
    api.onAppCloseRequest(function () {
      if (document.getElementById('settings-dialog')) return;
      handleAppCloseRequest();
    });
    if (api.onSettingsModalBlockedClose) {
      api.onSettingsModalBlockedClose(function () {
        var shell = document.querySelector('#settings-dialog .mda-settings-shell');
        if (shell) {
          shell.classList.remove('mda-settings-shake');
          void shell.offsetWidth;
          shell.classList.add('mda-settings-shake');
        }
      });
    }

    setupDragAndDrop();
    window.addEventListener('keydown', function (e) {
      // 设置模态打开时不响应应用级快捷键（菜单加速键由主进程禁用）
      // 但输入框内须放行复制/粘贴/剪切/全选/撤销，否则激活码与 API Key 无法编辑
      if (document.getElementById('settings-dialog')) {
        if (isEditableFieldShortcut(e)) return;
        if (e.key === 'F1' || e.ctrlKey || e.metaKey || e.altKey) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
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
      if (k === 'd' && e.shiftKey) {
        e.preventDefault();
        toggleTheme();
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
    syncRememberLayoutToMain();
    initRememberSession().then(function () {
      if (rememberSessionPref) restoreSavedWorkspace();
      refreshWelcomeRecents();
    });
    applyUiLang();
    updateToolbar();
  }

  function mountM3Modules() {
    initCm6Editor();
    assist = window.MDAEditorAssist || null;
    if (window.MDAFindReplace && editorPaneEl) {
      findReplaceUi = window.MDAFindReplace.mount(editorPaneEl, editorEl, function () {
        syncDirtyFromEditor();
      }, {
        searchSession: cm6SearchSession,
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
        outlineJumpLock = true;
        // 大纲点击：CM6 直接滚编辑器；2.0 同步预览与源码光标
        if (isCm6Ready() && cm6Editor && typeof cm6Editor.scrollToLine === 'function') {
          cm6Editor.scrollToLine(line, { skipFocus: false });
          cursorLine = line;
        } else if (syncScrollCtrl) {
          syncScrollCtrl.scrollEditorToLine(line, { skipFocus: !editorVisible });
        } else if (editorVisible) {
          jumpEditorToLine(line);
        } else if (previewEl && previewScrollEl) {
          var block = previewEl.querySelector('[data-line="' + line + '"]');
          if (block) {
            cursorLine = line;
            highlightCursorBlock(block);
            if (syncScrollCtrl && syncScrollCtrl.scrollPreviewToLine) {
              syncScrollCtrl.scrollPreviewToLine(line);
            } else {
              block.scrollIntoView({ block: 'center' });
            }
          }
        }
        if (outlinePanelUi && outlinePanelUi.setActiveLine) {
          outlinePanelUi.setActiveLine(line, { force: true, skipScroll: true });
        }
        setTimeout(function () { outlineJumpLock = false; }, 280);
      }, {
        onCollapsedChange: syncOutlineCollapsedState,
      });
      syncOutlineCollapsedState(outlinePanelUi.isCollapsed());
      applyOutlineWidth();
      setupOutlineScrollSync();
    }
    if (window.MDASyncScroll && editorEl && previewScrollEl && previewEl) {
      syncScrollCtrl = window.MDASyncScroll.attach(
        editorEl,
        previewScrollEl,
        previewEl,
        function () { return editorEl.value; },
        {
          onPreviewLocate: function (line, el) {
            cursorLine = line || null;
            highlightCursorBlock(el);
            // 按源码行归属标题；短暂锁定滚动侦测，避免同步滚动后被偏旧偏移覆盖
            if (line) {
              outlineJumpLock = true;
              updateOutlineActiveFromLine(line);
              setTimeout(function () { outlineJumpLock = false; }, 280);
            }
          },
        }
      );
    }
    setupEditorAssistKeys();
    setupAiEditorKeys();
  }

  function setupAiPanel() {
    if (!window.MDAAiPanel || !api.checkAiAccess) return;
    aiPanel = window.MDAAiPanel.create({
      api: api,
      getEditor: function () { return editorEl; },
      getFileName: function () {
        if (!currentFilePath) return uiT('untitled');
        var parts = String(currentFilePath).split(/[/\\]/);
        return parts[parts.length - 1] || currentFilePath;
      },
      toast: showToast,
      alert: uiAlert,
      openSettings: function (pane) { showSettingsDialog(pane || 'pro'); },
      applyInsert: applyAiInsert,
    });
  }

  function setupAiEditorKeys() {
    if (!editorEl) return;
    editorEl.addEventListener('keydown', function (e) {
      if (document.querySelector('.modal-overlay') || (aiPanel && aiPanel.isOpen())) return;
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      // Ctrl+Space 补全（不与 editor-assist 冲突）
      if (!e.shiftKey && (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar')) {
        e.preventDefault();
        if (aiPanel) aiPanel.runComplete();
        return;
      }
      if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        if (aiPanel) aiPanel.runContinue();
        return;
      }
      if (e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        if (aiPanel) aiPanel.runBeautify();
      }
    });
  }

  function applyAiInsert(text, mode, range) {
    if (!editorEl || text == null) return;
    var insert = String(text);
    var start = editorEl.selectionStart;
    var end = editorEl.selectionEnd;
    var val = editorEl.value;
    var result;
    if (mode === 'replaceDocument') {
      result = { value: insert, selectionStart: insert.length, selectionEnd: insert.length };
    } else if (mode === 'replaceRange' && range) {
      result = {
        value: val.slice(0, range.start) + insert + val.slice(range.end),
        selectionStart: range.start,
        selectionEnd: range.start + insert.length,
      };
    } else if (mode === 'replaceSelection') {
      result = {
        value: val.slice(0, start) + insert + val.slice(end),
        selectionStart: start,
        selectionEnd: start + insert.length,
      };
    } else {
      // insert at cursor / after selection
      result = {
        value: val.slice(0, end) + insert + val.slice(end),
        selectionStart: end + insert.length,
        selectionEnd: end + insert.length,
      };
    }
    if (assist && assist.applyEdit) {
      assist.applyEdit(editorEl, result);
    } else {
      editorEl.value = result.value;
      editorEl.selectionStart = result.selectionStart;
      editorEl.selectionEnd = result.selectionEnd;
      editorEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (!editorVisible) {
      // 展开编辑栏以便用户看到插入结果（toggleEditor 无参数，勿在已展开时调用）
      toggleEditor();
    }
  }

  function getSourceText() {
    if (dirty) return getEditorTextValue();
    return currentText || getEditorTextValue();
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
    if (!range || !previewScrollEl) return;
    try {
      var rect = range.getBoundingClientRect();
      var pane = previewScrollEl.getBoundingClientRect();
      var relTop = rect.top - pane.top + previewScrollEl.scrollTop;
      previewScrollEl.scrollTop = Math.max(0, relTop - previewScrollEl.clientHeight * 0.35);
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

  function showToast(message) {
    var old = document.getElementById('mda-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'mda-toast';
    el.className = 'mda-toast';
    el.setAttribute('role', 'status');
    el.textContent = message || '';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.remove(); }, 220);
    }, 1600);
  }

  function copyTextWithToast(text, okMsg) {
    var t = text == null ? '' : String(text);
    if (!t) {
      showToast(uiT('toastNoCopy'));
      return;
    }
    api.copyToClipboard(t);
    showToast(okMsg || uiT('toastCopied'));
  }

  function isSelectionInFilename() {
    if (!tbFileNameEl) return false;
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    try {
      var node = sel.anchorNode;
      return !!(node && tbFileNameEl.contains(node.nodeType === 3 ? node.parentNode : node));
    } catch (err) {
      return false;
    }
  }

  function isSelectionInPreview() {
    if (!previewEl) return false;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return false;
    try {
      var node = sel.anchorNode;
      return !!(node && previewEl.contains(node.nodeType === 3 ? node.parentNode : node));
    } catch (err) {
      return false;
    }
  }

  /** Ctrl+C：编辑器 / 文件名 / 预览区（含代码块）选中文本拷贝 + toast */
  function setupDomCopyShortcuts() {
    window.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey) return;
      if ((e.key || '').toLowerCase() !== 'c') return;
      var ae = document.activeElement;

      // 源码编辑器选区拷贝 + toast
      if (ae === editorEl && editorEl) {
        var start = editorEl.selectionStart;
        var end = editorEl.selectionEnd;
        if (start === end) return;
        var edText = editorEl.value.slice(start, end);
        if (!edText) return;
        e.preventDefault();
        e.stopPropagation();
        copyTextWithToast(edText, uiT('toastCopied'));
        return;
      }

      // 其他输入框交给原生拷贝
      if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return;

      if (isSelectionInFilename()) {
        var selFn = window.getSelection();
        var fname = (selFn && !selFn.isCollapsed) ? selFn.toString() : '';
        if (!String(fname).replace(/●/g, '').trim()) {
          fname = (tbFileNameEl && tbFileNameEl.getAttribute('data-filename')) || '';
        } else {
          fname = String(fname).replace(/●/g, '').trim();
        }
        if (!fname) return;
        e.preventDefault();
        e.stopPropagation();
        copyTextWithToast(fname, uiT('toastCopied'));
        return;
      }

      if (isSelectionInPreview()) {
        var text = window.getSelection().toString();
        if (!text.trim()) return;
        e.preventDefault();
        e.stopPropagation();
        copyTextWithToast(text, uiT('toastCopied'));
      }
    }, true);
  }

  function showSelectionContextMenu(x, y, source, snapshot) {
    if (docState === 'welcome') return;
    if (source === 'preview') {
      previewSelectionSnap = snapshot || previewSelectionSnap;
      if (!previewSelectionSnap) return;
      if (selAnchor && selAnchor.isSelectionUiChrome(previewSelectionSnap.range.commonAncestorContainer)) {
        return;
      }
      removeSelectionContextMenu();
      var quote = previewSelectionSnap.quote || '';
      var pMenu = document.createElement('div');
      pMenu.id = 'mda-selection-menu';
      pMenu.className = 'mda-context-menu';
      pMenu.innerHTML =
        '<div class="mda-menu-item' + (quote.trim() ? '' : ' disabled') + '" data-act="copy"><span>' + uiT('copy') + '</span><span class="mda-menu-key">' + MOD_KEY + 'C</span></div>' +
        '<div class="mda-menu-item' + (currentFilePath ? '' : ' disabled') + '" data-act="anno"><span>' + uiT('addSelAnno') + '</span></div>';
      document.body.appendChild(pMenu);
      pMenu.style.left = Math.min(x, window.innerWidth - pMenu.offsetWidth - 4) + 'px';
      pMenu.style.top = Math.min(y, window.innerHeight - pMenu.offsetHeight - 4) + 'px';
      pMenu.addEventListener('click', function (e) {
        var item = e.target.closest('[data-act]');
        if (!item || item.classList.contains('disabled')) return;
        var act = item.dataset.act;
        if (act === 'copy') {
          var text = quote;
          removeSelectionContextMenu();
          clearPreviewSelectionSnap();
          copyTextWithToast(text, uiT('toastCopied'));
          return;
        }
        if (act === 'anno') {
          if (!currentFilePath) {
            removeSelectionContextMenu();
            return;
          }
          var anchor = resolveSelectionAnchor('preview', previewSelectionSnap);
          removeSelectionContextMenu();
          clearPreviewSelectionSnap();
          if (!anchor) {
            uiAlert(uiT('alertBadSelectionEditor'));
            return;
          }
          var line = selAnchor.anchorToLine(getSourceText(), anchor.start);
          showEditDialog('add', null, line, anchor);
        }
      });
      selectionMenuDismiss = function (ev) {
        if (ev.type === 'click' && pMenu.contains(ev.target)) return;
        removeSelectionContextMenu();
        clearPreviewSelectionSnap();
      };
      setTimeout(function () {
        document.addEventListener('click', selectionMenuDismiss, true);
        document.addEventListener('contextmenu', selectionMenuDismiss, true);
        window.addEventListener('blur', selectionMenuDismiss);
      }, 0);
      return;
    }
    showEditorContextMenu(x, y);
  }

  function showEditorContextMenu(x, y) {
    if (docState === 'welcome' || !editorEl) return;
    removeSelectionContextMenu();
    removeCodeContextMenu();

    var start = editorEl.selectionStart;
    var end = editorEl.selectionEnd;
    var hasSel = start !== end;
    var selText = hasSel ? editorEl.value.slice(start, end) : '';

    var menu = document.createElement('div');
    menu.id = 'mda-selection-menu';
    menu.className = 'mda-context-menu';
    menu.innerHTML =
      '<div class="mda-menu-item' + (hasSel ? '' : ' disabled') + '" data-act="copy"><span>' + uiT('copy') + '</span><span class="mda-menu-key">' + MOD_KEY + 'C</span></div>' +
      '<div class="mda-menu-item" data-act="copy-all"><span>' + uiT('copyAll') + '</span></div>' +
      '<div class="mda-menu-item' + (hasSel && currentFilePath ? '' : ' disabled') + '" data-act="anno"><span>' + uiT('addSelAnno') + '</span></div>';
    document.body.appendChild(menu);
    menu.style.left = Math.min(x, window.innerWidth - menu.offsetWidth - 4) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 4) + 'px';

    menu.addEventListener('click', function (e) {
      var item = e.target.closest('[data-act]');
      if (!item || item.classList.contains('disabled')) return;
      var act = item.dataset.act;
      if (act === 'copy') {
        if (!selText) {
          uiAlert(uiT('alertSelectCopy'));
          removeSelectionContextMenu();
          return;
        }
        copyTextWithToast(selText, uiT('toastCopied'));
        removeSelectionContextMenu();
        return;
      }
      if (act === 'copy-all') {
        copyTextWithToast(editorEl.value || '', uiT('toastCopied'));
        removeSelectionContextMenu();
        return;
      }
      if (act === 'anno') {
        if (!hasSel) {
          uiAlert(uiT('alertSelectAnno'));
          removeSelectionContextMenu();
          return;
        }
        var anchor = resolveSelectionAnchor('editor');
        removeSelectionContextMenu();
        if (!anchor) {
          uiAlert(uiT('alertBadSelection'));
          return;
        }
        var line = selAnchor.anchorToLine(getSourceText(), anchor.start);
        showEditDialog('add', null, line, anchor);
      }
    });

    selectionMenuDismiss = function (ev) {
      if (ev.type === 'click' && menu.contains(ev.target)) return;
      removeSelectionContextMenu();
    };
    setTimeout(function () {
      document.addEventListener('click', selectionMenuDismiss, true);
      document.addEventListener('contextmenu', selectionMenuDismiss, true);
      window.addEventListener('blur', selectionMenuDismiss);
    }, 0);
  }

  function setupSelectionContextMenus() {
    if (previewScrollEl) {
      previewScrollEl.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        previewPointer.down = true;
        previewPointer.dragged = false;
        previewPointer.x = e.clientX;
        previewPointer.y = e.clientY;
      });
      previewScrollEl.addEventListener('mousemove', function (e) {
        if (!previewPointer.down) return;
        if (Math.abs(e.clientX - previewPointer.x) > 4 || Math.abs(e.clientY - previewPointer.y) > 4) {
          previewPointer.dragged = true;
        }
      });
      document.addEventListener('mouseup', function () {
        previewPointer.down = false;
      });
      previewScrollEl.addEventListener('contextmenu', function (e) {
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
        e.preventDefault();
        showEditorContextMenu(e.clientX, e.clientY);
      });
    }
  }

  function getFenceMask() {
    if (!api.buildCodeFenceMask || !editorEl) return null;
    return api.buildCodeFenceMask(editorEl.value.split('\n'));
  }

  // 实时重渲期间冻结编辑区滚动，防止高亮层替换 / Mermaid 异步撑高把 scrollTop 拽飞
  var editorScrollFreeze = null;
  var liveEditGen = 0;

  function freezeEditorScroll(snapshot) {
    if (!editorEl) return;
    editorScrollFreeze = snapshot || {
      top: editorEl.scrollTop,
      left: editorEl.scrollLeft || 0,
    };
  }

  function applyEditorScrollFreeze() {
    if (!editorScrollFreeze || !editorEl) return;
    if (editorEl.scrollTop !== editorScrollFreeze.top) {
      editorEl.scrollTop = editorScrollFreeze.top;
    }
    if ((editorEl.scrollLeft || 0) !== (editorScrollFreeze.left || 0)) {
      editorEl.scrollLeft = editorScrollFreeze.left || 0;
    }
  }

  function unfreezeEditorScroll() {
    applyEditorScrollFreeze();
    editorScrollFreeze = null;
  }

  /** 指定 scrollTop 下，1-based 行是否仍在编辑区可视范围内 */
  function isEditorLineVisibleAt(scrollTop, line) {
    if (!editorEl || line < 1) return false;
    var pad = 0;
    try { pad = parseFloat(window.getComputedStyle(editorEl).paddingTop) || 0; } catch (e) { /* ignore */ }
    var first = Math.floor(Math.max(0, scrollTop - pad) / 21) + 1;
    var visible = Math.max(1, Math.floor(editorEl.clientHeight / 21));
    var last = first + visible - 1;
    return line >= first && line <= last;
  }

  function applyPinnedEditorScroll() {
    if (!pinEditorScroll || !editorEl) return false;
    var line = 1;
    if (window.MDASyncScroll) line = window.MDASyncScroll.lineAtCaret(editorEl);
    if (!isEditorLineVisibleAt(pinEditorScroll.top, line)) return false;
    editorEl.scrollTop = pinEditorScroll.top;
    editorEl.scrollLeft = pinEditorScroll.left || 0;
    if (editorScrollFreeze) {
      editorScrollFreeze.top = pinEditorScroll.top;
      editorScrollFreeze.left = pinEditorScroll.left || 0;
    }
    syncEditorScrollLayers();
    return true;
  }

  function syncEditorScrollLayers() {
    if (!editorEl) return;
    applyEditorScrollFreeze();
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

  function updateFindPreviewHighlights(hlOpts) {
    hlOpts = hlOpts || {};
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

    // 实时编辑重渲时禁止 scrollIntoView，否则会拖动预览/连带布局抖动
    if (hlOpts.skipScroll) return;
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
    var text = editorEl.value;
    var maxLine = text.split('\n').length;
    var targetLine = Math.max(1, Math.min(line, maxLine));
    var pos = 0;
    if (targetLine > 1) {
      var n = 1;
      for (var i = 0; i < text.length; i++) {
        if (text.charAt(i) === '\n') {
          n++;
          if (n === targetLine) { pos = i + 1; break; }
        }
      }
      if (n < targetLine) pos = text.length;
    }
    var pad = 0;
    try { pad = parseFloat(window.getComputedStyle(editorEl).paddingTop) || 0; } catch (e) { /* ignore */ }
    var targetScroll = Math.max(0, pad + (targetLine - 1) * 21 - editorEl.clientHeight * 0.3);
    editorEl.focus();
    editorEl.selectionStart = editorEl.selectionEnd = pos;
    editorEl.scrollTop = targetScroll;
    requestAnimationFrame(function () {
      editorEl.selectionStart = editorEl.selectionEnd = pos;
      editorEl.scrollTop = targetScroll;
      syncEditorScrollLayers();
    });
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
    // 任意模态框打开时禁用（即便 Tab 已把焦点移到编辑器）
    if (document.querySelector('.modal-overlay')) return false;
    var ae = document.activeElement;
    if (ae && ae.closest && (ae.closest('#find-replace-bar') || ae.closest('.modal-overlay'))) return false;
    // 仅在源码编辑器已聚焦时处理；勿在 Ctrl 按下时抢焦点，否则预览/文件名选区会丢失
    if (ae !== editorEl) return false;

    var mod = e.ctrlKey || e.metaKey;
    if (!mod && e.key !== 'Tab') return false;
    // 单独按下修饰键时不做任何事
    if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt' || e.key === 'Shift') return false;

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
      // Ctrl+Shift+D 留给「切换深色模式」，勿占用
      return false;
    } else if (e.altKey && e.shiftKey && e.key === 'ArrowDown' && !mod) {
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
    if (docState === 'welcome') { uiAlert(uiT('alertOpenDocFirst')); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box" style="min-width:280px">' +
        '<h3>' + uiT('gotoTitle') + '</h3>' +
        '<div class="modal-field"><input id="goto-line" type="number" min="1" style="width:100%;padding:8px" placeholder="' + uiT('gotoPlaceholder') + '" /></div>' +
        '<div class="modal-actions">' +
          '<button id="goto-cancel" class="btn-ghost">' + uiT('cancel') + '</button>' +
          '<button id="goto-ok" class="btn-ok">' + uiT('jump') + '</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    var input = overlay.querySelector('#goto-line');
    function close() { overlay.remove(); }
    function doGoto() {
      var n = parseInt(input.value, 10);
      if (isNaN(n) || n < 1) { uiAlert(uiT('alertInvalidLine')); return; }
      close();
      // 延后聚焦编辑器，避免 keydown Enter 落到 textarea 插入换行导致标脏
      setTimeout(function () {
        if (!editorVisible) showEditorPane(true);
        if (syncScrollCtrl) syncScrollCtrl.scrollEditorToLine(n);
        else jumpEditorToLine(n);
      }, 0);
    }
    overlay.querySelector('#goto-cancel').addEventListener('click', close);
    overlay.querySelector('#goto-ok').addEventListener('click', doGoto);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    trapModalFocus(overlay, close);
    input.focus();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        doGoto();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
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
        onCopyFileName: function (_path, name) {
          copyTextWithToast(name, uiT('toastCopied'));
        },
        onCopyFile: function (filePath) { copyFileToFsClip(filePath); },
        onCutFile: function (filePath) { cutFileToFsClip(filePath); },
        onPasteToDir: function (destDir) { pasteFsClipToDir(destDir); },
        onDropFile: function (src, destDir, isCopy) { dropWorkspaceFile(src, destDir, isCopy); },
        onUndoFs: function () { undoFsFileOp(); },
        getFsClip: function () { return fsClip; },
        onRenameFile: function (filePath, name) { renameWorkspaceFile(filePath, name); },
        onDeleteFile: function (filePath, name) { deleteWorkspaceFile(filePath, name); },
        onClearList: function () { clearWorkspaceFileList(); },
        onCollapsedChange: function (collapsed) {
          syncFilesSplitterVisibility(collapsed);
          if (!collapsed) applyFileSidebarWidth();
          updateToolbar();
        },
      });
      // 若上次会话已记住收起状态，初次挂载后同步分割条
      if (fileSidebar) syncFilesSplitterVisibility(fileSidebar.isCollapsed());
    }
  }

  /** 文件列表展开时显示拖拽条；收起/未开工作区时隐藏 */
  function syncFilesSplitterVisibility(collapsed) {
    if (!splitFilesEl) return;
    var show = !!(workspaceRoot && leftRailEl && !leftRailEl.classList.contains('hidden') && !collapsed);
    splitFilesEl.classList.toggle('hidden', !show);
    // 收起时清掉拖拽写入的 inline flex，让 .collapsed { 28px } 生效；展开时保留拖拽宽度
    if (leftRailEl && collapsed) leftRailEl.style.flex = '';
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
    applyCm6DocumentUi();
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
      setEditorTextValue('', { resetHistory: true });
      annotations = [];
      paragraphs = [];
      selectedAnnotationId = null;
      previewEl.innerHTML = '';
      setDirtyState(false);
      setDocState('untitled');
      if (shouldAutoOpenEditor() && !editorVisible) {
        if (isCm6Enabled() && cm6Editor) focusActiveEditor();
        else showEditorPane(true);
      }
      parseAndRender('', null);
      resetScrollTop();
      requestAnimationFrame(function () { if (editorVisible || isCm6Enabled()) focusActiveEditor(); });
    });
  }

  function showEditorPane(visible) {
    if (isCm6Ready() && window.MDAEditor) {
      editorVisible = !!visible;
      cm6Editor.setMode(editorVisible
        ? (window.MDAEditor.MODE_SOURCE || 'source')
        : (window.MDAEditor.MODE_PREVIEW || 'preview'));
      if (editorVisible) focusActiveEditor();
      updateToolbar();
      return;
    }
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

  // 分栏默认宽度（用于双击复位）
  var PANE_DEFAULT = { files: 220, editor: 380, panel: 320, outline: 200 };
  var FILES_WIDTH_KEY = 'mda-file-sidebar-width';
  var OUTLINE_WIDTH_KEY = 'mda-outline-width';
  var REMEMBER_LAYOUT_KEY = 'mda-remember-layout';
  var LAYOUT_HABIT_KEYS = [
    'mda-panel-visible',
    'mda-editor-pane-dismissed',
    'mda-outline-collapsed',
    'mda-file-sidebar-collapsed',
    'mda-fs-expanded-dirs',
    FILES_WIDTH_KEY,
    OUTLINE_WIDTH_KEY,
  ];

  /** 是否持久化界面布局习惯（默认开；关时读默认、不写、并可清已存键） */
  function isRememberLayout() {
    try { return localStorage.getItem(REMEMBER_LAYOUT_KEY) !== '0'; } catch (e) { return true; }
  }

  function clearLayoutHabits() {
    for (var i = 0; i < LAYOUT_HABIT_KEYS.length; i++) {
      try { localStorage.removeItem(LAYOUT_HABIT_KEYS[i]); } catch (e) { /* ignore */ }
    }
  }

  function applyRememberLayoutPref(on, opts) {
    opts = opts || {};
    var next = !!on;
    try {
      if (next) localStorage.setItem(REMEMBER_LAYOUT_KEY, '1');
      else {
        localStorage.setItem(REMEMBER_LAYOUT_KEY, '0');
        clearLayoutHabits();
      }
    } catch (e) { /* ignore */ }
    if (api.setRememberLayout) api.setRememberLayout(next);
    if (opts.toast) {
      showToast(next ? uiT('toastRememberLayoutOn') : uiT('toastRememberLayoutOff'));
    }
  }

  function syncRememberLayoutToMain() {
    if (api.setRememberLayout) api.setRememberLayout(isRememberLayout());
  }

  function readPaneWidth(key, minW) {
    if (!isRememberLayout()) return null;
    try {
      var w = parseInt(localStorage.getItem(key), 10);
      if (isNaN(w) || w < (minW || 140)) return null;
      return w;
    } catch (e) { return null; }
  }

  function savePaneWidth(key, w) {
    if (!isRememberLayout()) return;
    try { localStorage.setItem(key, String(Math.round(w))); } catch (e) { /* ignore */ }
  }

  function applyFileSidebarWidth() {
    if (!leftRailEl || (fileSidebar && fileSidebar.isCollapsed())) return;
    var w = readPaneWidth(FILES_WIDTH_KEY, 140);
    if (w) leftRailEl.style.flex = '0 0 ' + w + 'px';
  }

  function applyOutlineWidth() {
    var outlineHost = document.getElementById('outline-host');
    if (!outlineHost || (outlinePanelUi && outlinePanelUi.isCollapsed())) return;
    var w = readPaneWidth(OUTLINE_WIDTH_KEY, 120);
    if (w) outlineHost.style.flex = '0 0 ' + w + 'px';
  }

  function syncOutlineSplitterVisibility(collapsed) {
    if (!splitOutlineEl) return;
    splitOutlineEl.classList.toggle('hidden', !!collapsed);
  }

  function syncOutlineCollapsedState(collapsed) {
    var scrollTop = previewScrollEl ? previewScrollEl.scrollTop : 0;
    var scrollLeft = previewScrollEl ? previewScrollEl.scrollLeft : 0;
    syncOutlineSplitterVisibility(collapsed);
    if (previewScrollEl) previewScrollEl.classList.remove('outline-collapsed');
    if (outlineExpandRail) outlineExpandRail.classList.toggle('visible', !!collapsed);
    if (!collapsed) applyOutlineWidth();
    // 布局瞬时切换后立刻还原滚动，避免与编辑/批注收放行为不一致的跳动感
    if (previewScrollEl) {
      previewScrollEl.scrollTop = scrollTop;
      previewScrollEl.scrollLeft = scrollLeft;
    }
  }

  function headingLineAtOrBefore(line) {
    if (!outlinePanelUi || !outlinePanelUi.getFlatHeadings) return null;
    var headings = outlinePanelUi.getFlatHeadings();
    if (!headings.length || line == null || isNaN(line)) return null;
    var active = headings[0].line;
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].line <= line) active = headings[i].line;
      else break;
    }
    return active;
  }

  function updateOutlineActiveFromLine(line, opts) {
    if (!outlinePanelUi || !outlinePanelUi.setActiveLine) return;
    if (outlinePanelUi.isCollapsed && outlinePanelUi.isCollapsed()) return;
    var active = headingLineAtOrBefore(line);
    if (active == null) return;
    outlinePanelUi.setActiveLine(active, opts || {});
  }

  function syncOutlineFromHeadingClick(line) {
    if (!outlinePanelUi || !outlinePanelUi.setActiveLine || line == null || isNaN(line)) return;
    if (outlinePanelUi.isCollapsed && outlinePanelUi.isCollapsed()) return;
    var headings = outlinePanelUi.getFlatHeadings ? outlinePanelUi.getFlatHeadings() : [];
    var found = false;
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].line === line) {
        found = true;
        break;
      }
    }
    if (!found) return;
    outlineJumpLock = true;
    outlinePanelUi.setActiveLine(line, { force: true });
    setTimeout(function () { outlineJumpLock = false; }, 280);
  }

  function scheduleOutlineActiveFromScroll() {
    if (outlineJumpLock) return;
    if (outlineScrollRaf) cancelAnimationFrame(outlineScrollRaf);
    outlineScrollRaf = requestAnimationFrame(function () {
      outlineScrollRaf = null;
      updateOutlineActiveFromScroll();
    });
  }

  function updateOutlineActiveFromScroll() {
    if (outlineJumpLock || !outlinePanelUi || !outlinePanelUi.setActiveLine) return;
    if (outlinePanelUi.isCollapsed && outlinePanelUi.isCollapsed()) return;
    var headings = outlinePanelUi.getFlatHeadings ? outlinePanelUi.getFlatHeadings() : [];
    if (!headings.length) return;
    var scrollOpts = { expandAncestors: false };
    if (isCm6Ready() && cm6Editor && typeof cm6Editor.getOutlineActiveLine === 'function') {
      var lines = [];
      for (var hi = 0; hi < headings.length; hi++) lines.push(headings[hi].line);
      var cm6Active = cm6Editor.getOutlineActiveLine(lines);
      if (cm6Active != null) outlinePanelUi.setActiveLine(cm6Active, scrollOpts);
      return;
    }
    if (!previewScrollEl || !previewEl) return;
    var pScrollTop = previewScrollEl.scrollTop;
    var pClientH = previewScrollEl.clientHeight;
    var pScrollH = previewScrollEl.scrollHeight;
    var pScrollerRect = previewScrollEl.getBoundingClientRect();
    if (pScrollTop <= 4) {
      outlinePanelUi.setActiveLine(headings[0].line, scrollOpts);
      return;
    }
    if (pScrollTop + pClientH >= pScrollH - 8) {
      outlinePanelUi.setActiveLine(headings[headings.length - 1].line, scrollOpts);
      return;
    }
    var pEntries = [];
    for (var pi = 0; pi < headings.length; pi++) {
      var pBlock = previewEl.querySelector('[data-line="' + headings[pi].line + '"]');
      if (!pBlock) continue;
      var pRect = pBlock.getBoundingClientRect();
      pEntries.push({
        line: headings[pi].line,
        docTop: pScrollTop + (pRect.top - pScrollerRect.top),
        inViewport: pRect.bottom > pScrollerRect.top + 1 && pRect.top < pScrollerRect.bottom - 1,
      });
    }
    var pActive = headings[0].line;
    if (pEntries.length) {
      var pBand = Math.max(80, pClientH * 0.6);
      var pTopVisible = null;
      var pTopDocTop = Infinity;
      for (var pk = 0; pk < pEntries.length; pk++) {
        if (!pEntries[pk].inViewport) continue;
        if (pEntries[pk].docTop < pTopDocTop) {
          pTopDocTop = pEntries[pk].docTop;
          pTopVisible = pEntries[pk].line;
        }
      }
      if (pTopVisible != null && pTopDocTop - pScrollTop <= pBand) {
        pActive = pTopVisible;
      } else {
        var pPassTop = pScrollTop + Math.min(64, Math.max(16, pClientH * 0.08));
        for (var pl = 0; pl < pEntries.length; pl++) {
          if (pEntries[pl].docTop <= pPassTop + 0.5) pActive = pEntries[pl].line;
          else if (pEntries[pl].inViewport) break;
        }
      }
    }
    outlinePanelUi.setActiveLine(pActive, scrollOpts);
  }

  function bindCm6OutlineScroll() {
    if (!isCm6Ready() || !cm6Editor || !cm6Editor.view) return;
    var scroller = cm6Editor.view.scrollDOM;
    if (!scroller || scroller.dataset.outlineScrollBound) return;
    scroller.dataset.outlineScrollBound = '1';
    scroller.addEventListener('scroll', function () {
      scheduleOutlineActiveFromScroll();
    }, { passive: true });
    scheduleOutlineActiveFromScroll();
  }

  function setupOutlineScrollSync() {
    if (!previewScrollEl) return;
    previewScrollEl.addEventListener('scroll', function () {
      scheduleOutlineActiveFromScroll();
    }, { passive: true });
    bindCm6OutlineScroll();
  }

  function activateWorkspace(folderPath, opts) {
    opts = opts || {};
    workspaceRoot = folderPath;
    if (leftRailEl) leftRailEl.classList.remove('hidden');
    if (fileSidebar && fileSidebar.setWorkspaceKey) fileSidebar.setWorkspaceKey(folderPath);
    syncFilesSplitterVisibility(fileSidebar ? fileSidebar.isCollapsed() : false);
    if (!fileSidebar || !fileSidebar.isCollapsed()) applyFileSidebarWidth();
    refreshWorkspaceTree({ openFirstIfEmpty: !!opts.openFirstIfEmpty });
    updateToolbar();
    if (rememberSessionPref && api.setWorkspaceRoot) api.setWorkspaceRoot(folderPath);
  }

  function clearWorkspaceFileList() {
    uiConfirm(uiT('fsClearListConfirm')).then(function (yes) {
      if (!yes) return;
      workspaceRoot = null;
      if (api.setWorkspaceRoot) api.setWorkspaceRoot(null);
      if (fileSidebar) {
        if (fileSidebar.setWorkspaceKey) fileSidebar.setWorkspaceKey('');
        if (fileSidebar.setTree) fileSidebar.setTree([]);
        if (fileSidebar.setActive) fileSidebar.setActive(null);
      }
      if (leftRailEl) {
        leftRailEl.classList.add('hidden');
        leftRailEl.classList.remove('collapsed');
        leftRailEl.style.flex = '';
      }
      syncFilesSplitterVisibility(true);
      updateToolbar();
      showToast(uiT('toastFsListCleared'));
    });
  }

  function isRememberSession() {
    return !!rememberSessionPref;
  }

  function initRememberSession() {
    if (!api.getRememberSession) {
      rememberSessionPref = true;
      return Promise.resolve(true);
    }
    return api.getRememberSession().then(function (r) {
      rememberSessionPref = !(r && r.success === false) && (r.value !== false);
      return rememberSessionPref;
    }).catch(function () {
      rememberSessionPref = true;
      return true;
    });
  }

  function applyRememberSessionPref(on, opts) {
    opts = opts || {};
    var next = !!on;
    rememberSessionPref = next;
    var p = api.setRememberSession
      ? api.setRememberSession(next)
      : Promise.resolve({ success: true });
    return p.then(function () {
      if (!next) {
        // 已清磁盘；本会话侧栏若仍开着可保留到用户手动关，欢迎页最近列表刷新为空
        refreshWelcomeRecents();
        if (opts.toast) showToast(uiT('toastRememberSessionOff'));
        return;
      }
      // 开启后立刻把当前工作区 / 已打开文件落盘（关着时 open 不会写入，否则下次仍欢迎页）
      var writes = [];
      if (workspaceRoot && api.setWorkspaceRoot) {
        writes.push(Promise.resolve(api.setWorkspaceRoot(workspaceRoot)));
      }
      if (currentFilePath && docState === 'open' && api.addRecentFile) {
        writes.push(api.addRecentFile(currentFilePath).then(function () {
          refreshWelcomeRecents();
        }));
      }
      return Promise.all(writes).then(function () {
        if (opts.toast) showToast(uiT('toastRememberSessionOn'));
      });
    });
  }

  function restoreSavedWorkspace() {
    if (!rememberSessionPref || !api.getWorkspaceRoot) return;
    api.getWorkspaceRoot().then(function (r) {
      // 仅恢复侧栏工作区，不自动打开文档；文档由最近打开 / 命令行参数决定
      if (r.success && r.folderPath) activateWorkspace(r.folderPath);
    });
  }

  function openWorkspaceFolder() {
    if (!api.showOpenFolderDialog) return;
    api.showOpenFolderDialog().then(function (r) {
      if (!r.success || !r.folderPath) return;
      // 用户主动打开文件夹：若当前无文档，可打开树内第一个 Markdown
      activateWorkspace(r.folderPath, { openFirstIfEmpty: true });
    });
  }

  function dirnamePath(filePath) {
    var i = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
    return i >= 0 ? filePath.slice(0, i) : '';
  }

  function joinFilePath(dir, name) {
    var sep = dir.indexOf('\\') >= 0 ? '\\' : '/';
    return dir.replace(/[\\/]+$/, '') + sep + name;
  }

  function splitFileName(name) {
    var idx = name.lastIndexOf('.');
    if (idx <= 0) return { stem: name, ext: '' };
    return { stem: name.slice(0, idx), ext: name.slice(idx) };
  }

  function clearOpenDocument() {
    currentFilePath = null;
    currentText = '';
    setEditorTextValue('', { resetHistory: true });
    annotations = [];
    paragraphs = [];
    selectedAnnotationId = null;
    previewEl.innerHTML = '';
    setDirtyState(false);
    setDocState('welcome');
    if (fileSidebar && fileSidebar.setActive) fileSidebar.setActive(null);
    if (outlinePanelUi && outlinePanelUi.setHeadings) outlinePanelUi.setHeadings([]);
    updateToolbar();
  }

  function pickNextFileAfterDelete(deletedPath) {
    if (!fileSidebar || !fileSidebar.getFileList) return null;
    var list = fileSidebar.getFileList();
    var idx = list.indexOf(deletedPath);
    var remaining = list.filter(function (p) { return p !== deletedPath; });
    if (!remaining.length) return null;
    if (idx < 0) return remaining[0];
    if (idx < remaining.length) return remaining[idx];
    return remaining[remaining.length - 1];
  }

  function isFileTreeFocused() {
    var tree = document.getElementById('fs-tree');
    return !!(tree && document.activeElement === tree);
  }

  function renameActiveWorkspaceFile() {
    if (!fileSidebar || !fileSidebar.getActivePath) return;
    var path = fileSidebar.getActivePath();
    if (!path) return;
    renameWorkspaceFile(path, basenameFromPath(path));
  }

  function basenameFromPath(filePath) {
    return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
  }

  function refreshFsClipVisual() {
    if (fileSidebar && fileSidebar.refreshClipState) fileSidebar.refreshClipState();
  }

  function setFsClip(mode, paths) {
    if (!paths || !paths.length) fsClip = null;
    else fsClip = { mode: mode, paths: paths.slice() };
    refreshFsClipVisual();
  }

  function pushFsUndo(entry) {
    fsUndoStack.push(entry);
  }

  function pathsEqual(a, b) {
    return String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();
  }

  function parentDirEquals(filePath, destDir) {
    return pathsEqual(dirnamePath(filePath), destDir);
  }

  function uiFileConflictConfirm(fileName, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      var overwriteBtn = opts.allowOverwrite === false ? '' :
        '<button id="fs-conflict-overwrite" class="btn-ghost">' + uiT('fsConflictOverwrite') + '</button>';
      overlay.innerHTML =
        '<div class="modal-box" style="min-width:320px">' +
          '<h3>' + uiT('fsConflictTitle') + '</h3>' +
          '<div style="font-size:14px;margin-bottom:20px;line-height:1.6">' +
            escHtml(uiT('fsConflictMsg', { name: fileName })) +
          '</div>' +
          '<div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">' +
            '<button id="fs-conflict-cancel" class="btn-ghost">' + uiT('cancel') + '</button>' +
            overwriteBtn +
            '<button id="fs-conflict-rename" class="btn-ok">' + uiT('fsConflictRename') + '</button>' +
          '</div></div>';
      document.body.appendChild(overlay);
      function close(val) { overlay.remove(); resolve(val); }
      trapModalFocus(overlay, function () { close(null); });
      overlay.querySelector('#fs-conflict-cancel').addEventListener('click', function () { close(null); });
      overlay.querySelector('#fs-conflict-rename').addEventListener('click', function () { close('rename'); });
      var ow = overlay.querySelector('#fs-conflict-rename');
      if (opts.allowOverwrite !== false) {
        overlay.querySelector('#fs-conflict-overwrite').addEventListener('click', function () { close('overwrite'); });
        overlay.querySelector('#fs-conflict-overwrite').focus();
      } else if (ow) {
        ow.focus();
      }
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(null); });
    });
  }

  function doTransferWorkspaceFile(srcPath, destDir, mode, conflict) {
    var apiFn = mode === 'copy' ? api.copyFileToDir : api.moveFileToDir;
    return apiFn(srcPath, destDir, workspaceRoot, { conflict: conflict }).then(function (r) {
      if (r.conflict) {
        return uiFileConflictConfirm(r.baseName || basenameFromPath(r.destPath || srcPath), {
          allowOverwrite: !(mode === 'copy' && pathsEqual(srcPath, r.destPath || joinFilePath(destDir, basenameFromPath(srcPath)))),
        }).then(function (choice) {
          if (!choice) return { success: false, cancelled: true };
          return doTransferWorkspaceFile(srcPath, destDir, mode, choice);
        });
      }
      return r;
    });
  }

  function transferWorkspaceFile(srcPath, destDir, mode, opts) {
    opts = opts || {};
    if (!srcPath || !destDir || !workspaceRoot) return Promise.resolve(false);
    if (mode === 'cut' && parentDirEquals(srcPath, destDir)) return Promise.resolve(false);
    if (mode === 'cut' && currentFilePath === srcPath && dirty && !opts.skipDirtyGuard) {
      return guardDiscard().then(function (ok) {
        if (!ok) return false;
        return transferWorkspaceFile(srcPath, destDir, mode, { skipDirtyGuard: true });
      });
    }
    if (!api.copyFileToDir || !api.moveFileToDir) {
      uiAlert(uiT(mode === 'copy' ? 'fsCopyFail' : 'fsMoveFail', { error: uiT('unknownError') }));
      return Promise.resolve(false);
    }
    return doTransferWorkspaceFile(srcPath, destDir, mode, opts.conflict).then(function (r) {
      if (!r || r.cancelled || r.noop) return false;
      if (!r.success) {
        uiAlert(uiT(mode === 'copy' ? 'fsCopyFail' : 'fsMoveFail', { error: r.error || uiT('unknownError') }));
        return false;
      }
      var destPath = r.filePath;
      if (mode === 'copy') {
        pushFsUndo({ kind: 'copy', paths: [destPath] });
        copyTextWithToast(basenameFromPath(destPath), uiT('toastFsCopied'));
      } else {
        pushFsUndo({ kind: 'move', pairs: [{ from: srcPath, to: destPath }] });
        if (currentFilePath === srcPath) {
          currentFilePath = destPath;
          setTitle(destPath);
          if (api.addRecentFile) api.addRecentFile(destPath);
        }
        if (fsClip && fsClip.mode === 'cut' && fsClip.paths.indexOf(srcPath) >= 0) setFsClip(null, null);
        copyTextWithToast(basenameFromPath(destPath), uiT('toastFsMoved'));
      }
      refreshWorkspaceTree();
      return true;
    });
  }

  function copyFileToFsClip(filePath) {
    if (!filePath) return;
    setFsClip('copy', [filePath]);
    copyTextWithToast(basenameFromPath(filePath), uiT('toastFsClipCopy'));
  }

  function cutFileToFsClip(filePath) {
    if (!filePath) return;
    setFsClip('cut', [filePath]);
    copyTextWithToast(basenameFromPath(filePath), uiT('toastFsClipCut'));
  }

  function pasteFsClipToDir(destDir) {
    if (!fsClip || !fsClip.paths.length) {
      uiAlert(uiT('fsNothingToPaste'));
      return;
    }
    if (!destDir) return;
    var paths = fsClip.paths.slice();
    var mode = fsClip.mode === 'cut' ? 'cut' : 'copy';
    function pasteOne(i) {
      if (i >= paths.length) {
        if (mode === 'cut') setFsClip(null, null);
        return;
      }
      transferWorkspaceFile(paths[i], destDir, mode).then(function () { pasteOne(i + 1); });
    }
    pasteOne(0);
  }

  function dropWorkspaceFile(srcPath, destDir, isCopy) {
    if (!srcPath || !destDir) return;
    if (!isCopy && parentDirEquals(srcPath, destDir)) return;
    transferWorkspaceFile(srcPath, destDir, isCopy ? 'copy' : 'cut');
  }

  function undoFsFileOp() {
    if (!fsUndoStack.length) {
      uiAlert(uiT('fsUndoEmpty'));
      return;
    }
    var entry = fsUndoStack[fsUndoStack.length - 1];
    if (entry.kind === 'copy') {
      var paths = entry.paths || [];
      var chain = Promise.resolve();
      paths.forEach(function (p) {
        chain = chain.then(function () {
          return api.deleteFile(p).then(function (r) {
            if (!r.success) throw new Error(r.error || uiT('unknownError'));
          });
        });
      });
      chain.then(function () {
        fsUndoStack.pop();
        copyTextWithToast('', uiT('toastFsUndo'));
        refreshWorkspaceTree();
      }).catch(function (err) {
        uiAlert(uiT('fsUndoFail', { error: (err && err.message) ? err.message : String(err) }));
      });
      return;
    }
    if (entry.kind === 'move') {
      var pairs = (entry.pairs || []).slice().reverse();
      var seq = Promise.resolve();
      pairs.forEach(function (pair) {
        seq = seq.then(function () {
          return api.renameFile(pair.to, pair.from).then(function (r) {
            if (!r.success) throw new Error(r.error || uiT('unknownError'));
            if (currentFilePath === pair.to) {
              currentFilePath = pair.from;
              setTitle(pair.from);
            }
          });
        });
      });
      seq.then(function () {
        fsUndoStack.pop();
        copyTextWithToast('', uiT('toastFsUndo'));
        refreshWorkspaceTree();
      }).catch(function (err) {
        uiAlert(uiT('fsUndoFail', { error: (err && err.message) ? err.message : String(err) }));
      });
    }
  }

  function deleteWorkspaceFile(filePath, fileName) {
    if (!fileName) fileName = basenameFromPath(filePath);
    function confirmAndDelete() {
      uiConfirm(uiT('fsDeleteConfirm', { name: fileName })).then(function (yes) {
        if (!yes) return;
        if (!api.deleteFile) {
          uiAlert(uiT('fsDeleteFail', { error: uiT('unknownError') }));
          return;
        }
        var wasCurrent = currentFilePath === filePath;
        var nextPath = wasCurrent ? pickNextFileAfterDelete(filePath) : null;
        api.deleteFile(filePath).then(function (r) {
          if (!r.success) {
            uiAlert(uiT('fsDeleteFail', { error: r.error || uiT('unknownError') }));
            return;
          }
          if (wasCurrent) {
            if (nextPath) openFile(nextPath, { scrollToTop: true });
            else clearOpenDocument();
          }
          refreshWorkspaceTree();
        });
      });
    }
    if (currentFilePath === filePath) {
      guardDiscard().then(function (ok) { if (ok) confirmAndDelete(); });
    } else {
      confirmAndDelete();
    }
  }

  function renameWorkspaceFile(filePath, currentName) {
    var parts = splitFileName(currentName);
    showRenameFileDialog(parts.stem, parts.ext).then(function (newStem) {
      if (newStem == null) return;
      newStem = String(newStem).trim();
      if (parts.ext && newStem.toLowerCase().endsWith(parts.ext.toLowerCase())) {
        newStem = newStem.slice(0, -parts.ext.length);
      }
      if (!newStem) {
        uiAlert(uiT('fsRenameEmpty'));
        return;
      }
      var newName = newStem + parts.ext;
      if (!newName || newName === currentName) return;
      if (/[<>:"/\\|?*\x00-\x1f]/.test(newStem)) {
        uiAlert(uiT('fsRenameInvalid'));
        return;
      }
      var parent = dirnamePath(filePath);
      var newPath = joinFilePath(parent, newName);
      if (!api.renameFile) {
        uiAlert(uiT('fsRenameFail', { error: uiT('unknownError') }));
        return;
      }
      performWorkspaceRename(filePath, newPath);
    });
  }

  function performWorkspaceRename(filePath, newPath, conflict) {
    return api.renameFile(filePath, newPath, {
      workspaceRoot: workspaceRoot,
      conflict: conflict,
    }).then(function (r) {
      if (r.conflict) {
        return uiFileConflictConfirm(basenameFromPath(newPath)).then(function (choice) {
          if (!choice) return;
          return performWorkspaceRename(filePath, newPath, choice);
        });
      }
      if (!r.success) {
        uiAlert(uiT('fsRenameFail', { error: r.error || uiT('unknownError') }));
        return;
      }
      var renamedTo = r.filePath || newPath;
      if (currentFilePath === filePath) {
        currentFilePath = renamedTo;
        setTitle(renamedTo);
        if (api.addRecentFile) api.addRecentFile(renamedTo);
      }
      refreshWorkspaceTree();
    });
  }

  function showRenameFileDialog(defaultStem, ext) {
    ext = ext || '';
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      var extHtml = ext
        ? '<span id="fs-rename-ext" style="flex-shrink:0;color:var(--muted,#888)">' + escHtml(ext) + '</span>'
        : '';
      var hintHtml = ext
        ? '<div style="font-size:12px;color:var(--muted,#888);margin-top:6px">' + uiT('fsRenameExtHint') + '</div>'
        : '';
      overlay.innerHTML =
        '<div class="modal-box" style="min-width:280px">' +
          '<h3>' + uiT('fsRenameTitle') + '</h3>' +
          '<div class="modal-field" style="display:flex;align-items:center;gap:4px">' +
            '<input id="fs-rename-input" type="text" style="flex:1;padding:8px" />' + extHtml +
          '</div>' + hintHtml +
          '<div class="modal-actions">' +
            '<button id="fs-rename-cancel" class="btn-ghost">' + uiT('cancel') + '</button>' +
            '<button id="fs-rename-ok" class="btn-ok">' + uiT('ok') + '</button>' +
          '</div></div>';
      document.body.appendChild(overlay);
      var input = overlay.querySelector('#fs-rename-input');
      input.value = defaultStem || '';
      function close(val) { overlay.remove(); resolve(val); }
      function submit() { close(input.value); }
      overlay.querySelector('#fs-rename-cancel').addEventListener('click', function () { close(null); });
      overlay.querySelector('#fs-rename-ok').addEventListener('click', submit);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(null); });
      trapModalFocus(overlay, function () { close(null); });
      input.focus();
      input.select();
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
      });
    });
  }

  function refreshWorkspaceTree(opts) {
    opts = opts || {};
    if (!workspaceRoot || !api.listMarkdownTree) return;
    api.listMarkdownTree(workspaceRoot).then(function (r) {
      if (!r.success) {
        uiAlert(uiT('alertListFolderFail', { error: r.error || uiT('unknownError') }));
        return;
      }
      var tree = r.tree || [];
      if (fileSidebar) {
        fileSidebar.setTree(tree);
        if (currentFilePath) fileSidebar.setActive(currentFilePath);
      }
      // 仅在用户主动「打开文件夹」且当前无文档时自动打开首个文件；
      // 启动恢复工作区 / 清空最近打开后的刷新不得抢起始页
      if (opts.openFirstIfEmpty && !currentFilePath && docState === 'welcome') {
        var first = firstMarkdownInTree(tree);
        if (first) requestOpen(first);
      }
    });
  }

  function saveAs(onSuccess) {
    var suggestedName = uiT('untitled');
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

  function flushActiveWidgetEditsBeforeSave() {
    var ae = document.activeElement;
    if (!ae || !ae.closest) return;
    if (ae.closest('.mda-cm-code-input')) ae.blur();
    else if (ae.closest('.mda-cm-mermaid-source-input')) ae.blur();
  }

  function writeToPath(filePath, onSuccess, opts) {
    opts = opts || {};
    var quiet = !!opts.quiet;
    function done() {
      if (typeof onSuccess === 'function') onSuccess();
    }
    flushActiveWidgetEditsBeforeSave();
    var content = getEditorSaveText();
    var bad = (api.findMalformedAnnotations && api.findMalformedAnnotations(content)) || [];
    if (quiet && bad.length) {
      showToast(uiT('toastAutosaveSkipMalformed'));
      done();
      return;
    }
    var proceed = bad.length
      ? uiConfirm(uiT('alertMalformedAnno', { lines: bad.join((window.MDAI18n && MDAI18n.getLang() === 'en') ? ', ' : '、') }))
      : Promise.resolve(true);
    proceed.then(function (yes) {
      if (!yes) { done(); return; }
      api.saveFile(filePath, content).then(function (r) {
        if (!r.success) {
          if (quiet) showToast(uiT('toastAutosaveFail', { error: r.error || uiT('unknownError') }));
          else uiAlert(uiT('alertSaveFail', { error: r.error }));
          done();
          return;
        }
        currentFilePath = filePath;
        currentText = content;
        setDocState('open');
        setDirtyState(false);
        if (api.addRecentFile) {
          allowAddRecent = true;
          api.addRecentFile(filePath).then(function () { refreshWelcomeRecents(); });
        }
        setTitle(filePath);
        parseAndRender(content, filePath);
        refreshEditorDecorations();
        if (fileSidebar) fileSidebar.setActive(filePath);
        if (workspaceRoot) refreshWorkspaceTree();
        updateToolbar();
        done();
      });
    });
  }

  // ---- 布局 ----
  function buildLayout() {
    var root = document.getElementById('root');
    root.innerHTML =
      '<div class="toolbar">' +
        '<button id="tb-files" class="tool-btn" title="" disabled></button>' +
        '<button id="tb-edit" class="tool-btn" title=""></button>' +
        '<button id="tb-panel" class="tool-btn" title=""></button>' +
        '<span class="spacer"></span>' +
        '<span id="tb-filename" class="file-name"></span>' +
      '</div>' +
      '<div id="content-row">' +
        '<div id="left-rail" class="mda-left-rail hidden">' +
          '<div id="file-sidebar-root"></div>' +
        '</div>' +
        '<div id="split-files" class="mda-splitter hidden"></div>' +
        '<div id="editor-pane">' +
          '<div class="mda-src-editor">' +
            '<div id="src-gutter" class="src-gutter"></div>' +
            '<div class="src-scroll">' +
              '<pre id="src-highlight" class="src-highlight" aria-hidden="true"><code class="language-markdown"></code></pre>' +
              '<pre id="src-find-mark" class="src-find-mark" aria-hidden="true"><code></code></pre>' +
              '<textarea id="editor" class="src-input" spellcheck="false" wrap="off" placeholder=""></textarea>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="split-left" class="mda-splitter hidden"></div>' +
        '<div id="preview-pane">' +
          '<div id="outline-expand-rail" class="mda-outline-expand-rail">' +
            '<button type="button" id="outline-float-toggle" class="mda-outline-expand-tab" title="">' +
              '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h12v1.2H2V3.5zm0 4.15h12v1.2H2V7.65zm0 4.15h12v1.2H2v-1.2z"/></svg>' +
            '</button>' +
          '</div>' +
          '<div id="outline-host"></div>' +
          '<div id="split-outline" class="mda-splitter"></div>' +
          '<div id="preview-scroll">' +
            '<div id="preview-content"></div>' +
          '</div>' +
        '</div>' +
        '<div id="split-right" class="mda-splitter hidden"></div>' +
        '<div id="panel-pane" class="hidden">' +
          '<div class="panel-head">' +
            '<button id="btn-add" class="btn-primary" disabled></button>' +
            '<button id="btn-clear-all" class="btn-clear-all" disabled></button>' +
          '</div>' +
          '<div class="filter-box">' +
            '<div style="margin-bottom:4px"><b data-i18n-filter="filterStatus"></b> <span id="status-filters"></span></div>' +
            '<div style="margin-bottom:4px"><b data-i18n-filter="filterLevel"></b> <span id="level-filters"></span></div>' +
            '<div id="tag-filters-row" style="display:none"><b data-i18n-filter="filterTags"></b> <span id="tag-filters"></span></div>' +
          '</div>' +
          '<div id="anno-list"></div>' +
        '</div>' +
      '</div>';

    previewEl = document.getElementById('preview-content');
    previewPaneEl = document.getElementById('preview-pane');
    previewScrollEl = document.getElementById('preview-scroll');
    setupMediaDefaultWidthResizeObserver();
    outlineFloatBtn = document.getElementById('outline-float-toggle');
    outlineExpandRail = document.getElementById('outline-expand-rail');
    leftRailEl = document.getElementById('left-rail');
    editorPaneEl = document.getElementById('editor-pane');
    editorEl = document.getElementById('editor');
    srcGutterEl = document.getElementById('src-gutter');
    srcHighlightEl = document.querySelector('#src-highlight code');
    srcFindMarkEl = document.getElementById('src-find-mark');
    splitFilesEl = document.getElementById('split-files');
    splitLeftEl = document.getElementById('split-left');
    splitRightEl = document.getElementById('split-right');
    splitOutlineEl = document.getElementById('split-outline');
    panelPaneEl = document.getElementById('panel-pane');
    statusFiltersEl = document.getElementById('status-filters');
    levelFiltersEl = document.getElementById('level-filters');
    tagFiltersEl = document.getElementById('tag-filters');
    tagFiltersRow = document.getElementById('tag-filters-row');
    annoListEl = document.getElementById('anno-list');
    tbFilesBtn = document.getElementById('tb-files');
    tbEditBtn = document.getElementById('tb-edit');
    tbPanelBtn = document.getElementById('tb-panel');
    tbFileNameEl = document.getElementById('tb-filename');
    addBtn = document.getElementById('btn-add');
    clearAllBtn = document.getElementById('btn-clear-all');

    // 恢复批注栏展开习惯（与大纲/文件列表一致走 localStorage）
    applyPanelVisible(readPanelVisiblePref());

    setupDomCopyShortcuts();

    addBtn.addEventListener('click', function () { showEditDialog('add', null, cursorLine); });
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function () { clearAllAnnotationsInFile(); });
    }
    tbFilesBtn.addEventListener('click', function () { toggleFilesSidebar(); });
    tbEditBtn.addEventListener('click', function () { toggleEditor(); });
    tbPanelBtn.addEventListener('click', function () { togglePanel(); });

    // Enter/Backspace/Delete：先记下滚动；input 时若光标仍在原视口内则钉回（避免浏览器「保光标可见」微调）
    editorEl.addEventListener('keydown', function (e) {
      if (!e) return;
      var k = e.key || '';
      if (k === 'Enter' || k === 'Backspace' || k === 'Delete') {
        pinEditorScroll = {
          top: editorEl.scrollTop,
          left: editorEl.scrollLeft || 0,
        };
      }
    });

    // 编辑器输入 → 按与磁盘内容是否一致决定 dirty（Ctrl+Z 撤回原点后自动取消标脏）
    editorEl.addEventListener('input', function () {
      if (isCm6Ready()) return;
      setDirtyState(editorEl.value !== currentText);
      refreshEditorDecorations();
      applyPinnedEditorScroll();
      // 浏览器常在 input 之后才做「保光标可见」滚动，再钉一次
      requestAnimationFrame(function () {
        applyPinnedEditorScroll();
      });
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(function () {
        applyPinnedEditorScroll();
        var saved = captureViewScroll();
        // 编辑键入：用钉住的编辑区滚动，预览滚动保持 capture 值
        if (pinEditorScroll) {
          saved.editorTop = pinEditorScroll.top;
          saved.editorLeft = pinEditorScroll.left || 0;
          saved.gutterTop = pinEditorScroll.top;
          saved.findMarkTop = pinEditorScroll.top;
        }
        var gen = ++liveEditGen;
        freezeEditorScroll({ top: saved.editorTop, left: saved.editorLeft || 0 });
        parseAndRender(editorEl.value, currentFilePath, {
          preserveScroll: true,
          savedScroll: saved,
          liveEdit: true,
          liveEditGen: gen,
        });
        pinEditorScroll = null;
      }, 250);
    });
    // 滚动同步：textarea 为可交互滚动层，高亮层与行号槽跟随
    editorEl.addEventListener('scroll', function () {
      if (editorScrollFreeze) applyEditorScrollFreeze();
      syncEditorScrollLayers();
    });

    initAutosave();

    if (outlineFloatBtn) {
      outlineFloatBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (outlinePanelUi) outlinePanelUi.setCollapsed(false);
      });
    }

    setupSplitter(splitFilesEl, leftRailEl, 'left', {
      defaultWidth: PANE_DEFAULT.files,
      minWidth: 140,
      maxRatio: 0.45,
      widthStorageKey: FILES_WIDTH_KEY,
    });
    setupSplitter(splitLeftEl, editorPaneEl, 'left');
    setupSplitter(splitRightEl, panelPaneEl, 'right');
    var outlineHostEl = document.getElementById('outline-host');
    setupSplitter(splitOutlineEl, outlineHostEl, 'left', {
      widthStorageKey: OUTLINE_WIDTH_KEY,
      defaultWidth: PANE_DEFAULT.outline,
      minWidth: 120,
      maxRatio: 0.45,
    });

    // 预览区点击：链接拦截默认导航；段落点击定位批注（拖选文字时不触发）
    if (previewScrollEl) previewScrollEl.addEventListener('click', function (e) {
      if (isCm6Ready()) return;
      if (previewPointer.dragged) return;
      // 大纲在预览栏内，其按钮也带 data-line，须排除
      if (e.target.closest && e.target.closest('#outline-host, .mda-outline-panel, #outline-expand-rail, #outline-float-toggle, .mda-outline-expand-tab')) return;
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
        if (cursorLine) updateOutlineActiveFromLine(cursorLine);
        // 只滚动源码；预览已由用户点中，禁止再改预览 scroll（否则选中块可能被滚出视口）
        if (cursorLine && syncScrollCtrl) {
          syncScrollCtrl.scrollEditorToLine(cursorLine, { skipPreview: true, skipFocus: false });
        } else if (cursorLine) {
          jumpEditorToLine(cursorLine);
        }
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
              rerenderPreview({ preserveScroll: true });
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
    rerenderPreview({ preserveScroll: true }); // 让 mermaid 跟随主题重绘，并保留滚动位置
  }

  function captureViewScroll() {
    return {
      editorTop: editorEl ? editorEl.scrollTop : 0,
      editorLeft: editorEl ? editorEl.scrollLeft : 0,
      gutterTop: srcGutterEl ? srcGutterEl.scrollTop : 0,
      previewTop: previewScrollEl ? previewScrollEl.scrollTop : 0,
      findMarkTop: srcFindMarkEl ? srcFindMarkEl.scrollTop : 0,
    };
  }

  function restoreViewScroll(s, opts) {
    opts = opts || {};
    if (!s) return;
    // 实时编辑：以 debounce 时捕获的编辑区滚动为准强制回写（并更新 freeze 快照），
    // 抵消高亮替换 / Mermaid 撑高 / scrollIntoView 造成的视口漂移。
    if (editorEl) {
      editorEl.scrollTop = s.editorTop;
      editorEl.scrollLeft = s.editorLeft || 0;
      if (editorScrollFreeze) {
        editorScrollFreeze.top = s.editorTop;
        editorScrollFreeze.left = s.editorLeft || 0;
      }
    }
    if (srcGutterEl) srcGutterEl.scrollTop = s.gutterTop;
    if (srcHighlightEl && srcHighlightEl.parentNode) {
      srcHighlightEl.parentNode.scrollTop = s.editorTop;
      srcHighlightEl.parentNode.scrollLeft = s.editorLeft || 0;
    }
    if (srcFindMarkEl) {
      srcFindMarkEl.scrollTop = s.findMarkTop != null ? s.findMarkTop : s.editorTop;
      srcFindMarkEl.scrollLeft = s.editorLeft || 0;
    }
    if (previewScrollEl) previewScrollEl.scrollTop = s.previewTop;
  }

  function rerenderPreview(opts) {
    opts = opts || {};
    if (docState === 'welcome' && !currentText && !getEditorTextValue()) return;
    if (opts.preserveScroll) {
      opts.savedScroll = captureViewScroll();
    }
    parseAndRender(getPreviewSource(), currentFilePath, opts);
  }

  // 预览源：有未保存编辑时以编辑器缓冲为准，否则用磁盘内容
  function getPreviewSource() {
    return dirty ? getEditorTextValue() : currentText;
  }

  // ---- mermaid ----
  function getMermaid() {
    if (window.mermaid) return window.mermaid;
    var ns = window.__esbuild_esm_mermaid_nm && window.__esbuild_esm_mermaid_nm.mermaid;
    if (ns) return ns.default || ns;
    return null;
  }

  /** 深色下默认 dark 主题会把亮黄等压成近黑，节点融进背景；显式给出中等饱和分段色。 */
  function mermaidInitOptions() {
    var base = { startOnLoad: false, securityLevel: 'strict' };
    if (!isDark()) {
      base.theme = 'default';
      // 浅色保持默认；显式 gradient 以免被上次深色配置残留影响
      base.sankey = { linkColor: 'gradient' };
      return base;
    }
    base.theme = 'dark';
    // 固定浅灰连接带：source/gradient 在 dark 下仍常接近背景色
    base.sankey = { linkColor: '#94a3b8' };
    base.themeVariables = {
      darkMode: true,
      background: '#1e1e1e',
      primaryColor: '#3d5a80',
      primaryTextColor: '#e8eaed',
      primaryBorderColor: '#8ab4f8',
      secondaryColor: '#4a5568',
      tertiaryColor: '#2d3748',
      lineColor: '#cbd5e1',
      textColor: '#e8eaed',
      mainBkg: '#2d3748',
      nodeBkg: '#2d3748',
      clusterBkg: '#1a202c',
      titleColor: '#e8eaed',
      edgeLabelBackground: '#1a202c',
      actorLineColor: '#cbd5e1',
      signalColor: '#cbd5e1',
      // mindmap / timeline / pie 等分段色：琥珀代替刺眼亮黄，避免被压成近黑
      cScale0: '#4a6fa5',
      cScale1: '#c9a227',
      cScale2: '#2f855a',
      cScale3: '#805ad5',
      cScale4: '#dd6b20',
      cScale5: '#3182ce',
      cScale6: '#d69e2e',
      cScale7: '#38a169',
      cScale8: '#9f7aea',
      cScale9: '#ed8936',
      cScale10: '#4299e1',
      cScale11: '#ecc94b',
    };
    return base;
  }

  function initMermaid() {
    var m = getMermaid();
    if (m) {
      try { m.initialize(mermaidInitOptions()); } catch (e) { /* ignore */ }
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
        holder.textContent = uiT('mermaidMissing');
        pre.parentNode.replaceChild(holder, pre);
        continue;
      }
      holder.className = 'mda-mermaid';
      pre.parentNode.replaceChild(holder, pre);
      var src = code.textContent.replace(/\n$/, '');
      var id = 'mmd-' + Date.now() + '-' + i;
      try {
        try { m.initialize(mermaidInitOptions()); } catch (e) { /* ignore */ }
        var out = await m.render(id, src);
        holder.setAttribute('data-mermaid-src', src);
        holder.innerHTML = out.svg;
        if (out.bindFunctions) out.bindFunctions(holder);
        fixMermaidSvgLayout(holder);
        tuneMermaidSvgContrast(holder);
        ensureMermaidResizeChrome(holder);
        holder.addEventListener('click', function (e) {
          var suppressUntil = parseInt(this.dataset.suppressZoomUntil || '0', 10);
          if (suppressUntil) {
            delete this.dataset.suppressZoomUntil;
            if (Date.now() <= suppressUntil) return;
          }
          if (e.target && e.target.closest && e.target.closest('.mda-img-resize-handle')) return;
          var self = this;
          if (self._zoomClickTimer) {
            clearTimeout(self._zoomClickTimer);
            self._zoomClickTimer = null;
            return;
          }
          self._zoomClickTimer = setTimeout(function () {
            self._zoomClickTimer = null;
            var svg = self.querySelector('svg');
            var mermaidSrc = self.getAttribute('data-mermaid-src') || '';
            if (svg) openZoom(svg.cloneNode(true), { kind: 'mermaid', mermaidSrc: mermaidSrc });
          }, 280);
        });
        holder.addEventListener('dblclick', function (e) {
          if (e.target && e.target.closest && e.target.closest('.mda-img-resize-handle')) return;
          e.preventDefault();
          e.stopPropagation();
          if (this._zoomClickTimer) {
            clearTimeout(this._zoomClickTimer);
            this._zoomClickTimer = null;
          }
          restoreMediaToSettingsScale(this, 'mermaid');
        });
      } catch (err) {
        holder.className = 'mda-mermaid-error';
        holder.textContent = uiT('mermaidFail', { error: (err && err.message) ? err.message : String(err) });
      }
    }
  }

  function measureKatexVisualBox(renderEl) {
    var layout = renderEl.getBoundingClientRect();
    var minLeft = layout.left;
    var minTop = layout.top;
    var maxRight = layout.right;
    var maxBottom = layout.bottom;
    var visualRoot = renderEl.querySelector('.katex-html') || renderEl;
    var nodes = [visualRoot].concat(Array.from(visualRoot.querySelectorAll('*')));
    nodes.forEach(function (node) {
      var rect = node.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return;
      minLeft = Math.min(minLeft, rect.left);
      minTop = Math.min(minTop, rect.top);
      maxRight = Math.max(maxRight, rect.right);
      maxBottom = Math.max(maxBottom, rect.bottom);
    });
    var overflowLeft = Math.max(0, layout.left - minLeft);
    var overflowRight = Math.max(0, maxRight - layout.right);
    var overflowTop = Math.max(0, layout.top - minTop);
    var overflowBottom = Math.max(0, maxBottom - layout.bottom);
    return {
      width: Math.max(layout.width + overflowLeft + overflowRight, renderEl.scrollWidth || 0),
      height: Math.max(layout.height + overflowTop + overflowBottom, renderEl.scrollHeight || 0),
      offsetX: (overflowLeft - overflowRight) / 2,
      offsetY: (overflowTop - overflowBottom) / 2,
    };
  }

  function svgPayloadToPng(payload) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = payload.logicalWidth;
          canvas.height = payload.logicalHeight;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = payload.bg || '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, payload.pixelWidth, payload.pixelHeight, 0, 0, canvas.width, canvas.height);
          var dataUrl = canvas.toDataURL('image/png');
          if (!isValidPngDataUrl(dataUrl)) reject(new Error('formula export failed'));
          else resolve({
            dataUrl: dataUrl,
            width: payload.logicalWidth,
            height: payload.logicalHeight,
          });
        } catch (err) { reject(err); }
      };
      img.onerror = function () { reject(new Error('formula export failed')); };
      img.src = window.MDAKatexExport.svgToDataUrl(payload.svg);
    });
  }

  /**
   * 布局修复（深浅色通用）：
   * - C4 等图用 textLength 强行压字宽 → 中文/<<stereotype>> 挤压变形，去掉该属性
   * - Radar/Venn 标题常画出 viewBox → 扩边距并允许 overflow
   */
  function fixMermaidSvgLayout(holder) {
    var svg = holder && holder.querySelector('svg');
    if (!svg) return;

    var texts = svg.querySelectorAll('text[textLength], tspan[textLength]');
    for (var i = 0; i < texts.length; i++) {
      texts[i].removeAttribute('textLength');
      texts[i].removeAttribute('lengthAdjust');
    }

    // Architecture：服务标签叠在同一位置时，给 text 加一点可换行空间意义不大；
    // 主要靠样例简化。这里确保 group 内文字不被 clip-path 裁掉。
    var clips = svg.querySelectorAll('[clip-path]');
    for (var c = 0; c < clips.length; c++) {
      // 保留 clip，但外层 svg 允许溢出标题
    }

    padMermaidViewBox(svg, 16);
    normalizeMermaidSvgIntrinsicSize(svg);
    rememberMermaidNaturalWidth(holder);
    svg.style.overflow = 'visible';
    holder.style.overflow = 'visible';
  }

  /**
   * Mermaid 常输出 width="100%"。父级若非「整列 block」，百分比会按塌缩宽度解析，图会变得特别小。
   * 用 viewBox 写成像素宽高，再靠 max-width:100% 适配栏宽 —— 恢复默认观感。
   */
  function normalizeMermaidSvgIntrinsicSize(svg) {
    if (!svg) return;
    var vb = svg.viewBox && svg.viewBox.baseVal;
    var vw = vb && vb.width ? vb.width : 0;
    var vh = vb && vb.height ? vb.height : 0;
    if (!vw || !vh) {
      try {
        var box = svg.getBBox();
        if (box && box.width && box.height) { vw = box.width; vh = box.height; }
      } catch (e) { /* ignore */ }
    }
    var attrW = svg.getAttribute('width') || '';
    var attrH = svg.getAttribute('height') || '';
    if (vw > 0 && (!attrW || /%$/.test(String(attrW)))) {
      svg.setAttribute('width', String(Math.ceil(vw)));
    }
    if (vh > 0 && (!attrH || /%$/.test(String(attrH)))) {
      svg.setAttribute('height', String(Math.ceil(vh)));
    }
    svg.style.width = '';
    svg.style.height = 'auto';
    svg.style.maxWidth = '100%';
  }

  function padMermaidViewBox(svg, pad) {
    var vb = svg.getAttribute('viewBox');
    if (!vb) {
      try {
        var box = svg.getBBox();
        if (box && box.width && box.height) {
          svg.setAttribute(
            'viewBox',
            [box.x - pad, box.y - pad, box.width + 2 * pad, box.height + 2 * pad].join(' ')
          );
        }
      } catch (e) { /* getBBox 可能在未插入时失败 */ }
      return;
    }
    var parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some(function (n) { return isNaN(n); })) return;
    svg.setAttribute(
      'viewBox',
      [parts[0] - pad, parts[1] - pad, parts[2] + 2 * pad, parts[3] + 2 * pad].join(' ')
    );
  }

  /** 深色模式下统一抬对比度：轴线/虚线、Sankey 带、过暗填充、黄底深字。 */
  function tuneMermaidSvgContrast(holder) {
    if (!isDark() || !holder) return;
    var svg = holder.querySelector('svg');
    if (!svg) return;

    tuneDarkStrokes(svg);
    tuneTimelineConnectors(svg);
    tuneSankeyLinks(svg);

    var nodes = svg.querySelectorAll('[fill], rect, polygon, circle, path, ellipse');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute('data-mda-sankey-link') === '1') continue;
      var fill = el.getAttribute('fill');
      if (!fill || fill === 'none' || fill === 'transparent' || fill.indexOf('url(') === 0) continue;
      var rgb = parseCssColor(fill);
      if (!rgb) continue;
      var lum = relativeLuminance(rgb.r, rgb.g, rgb.b);
      if (lum < 0.06) {
        var isYellowish = rgb.r > rgb.b + 20 && rgb.g > rgb.b;
        el.setAttribute('fill', isYellowish ? '#c9a227' : '#4a5568');
        rgb = isYellowish ? { r: 201, g: 162, b: 39 } : { r: 74, g: 85, b: 104 };
        lum = relativeLuminance(rgb.r, rgb.g, rgb.b);
      }
      if (lum > 0.45 && rgb.r > 180 && rgb.g > 140 && rgb.b < 120) {
        var textEls = findMermaidLabelTexts(el);
        for (var t = 0; t < textEls.length; t++) {
          textEls[t].setAttribute('fill', '#1a202c');
          if (textEls[t].style) textEls[t].style.fill = '#1a202c';
        }
      }
    }
  }

  /**
   * Timeline：Mermaid 用 `.section-N line { stroke: cScaleInv }` 按段着色，
   * 且 `.lineWrapper line` 可能落到深色 nodeBorder / 末段 label 色 → 全屏/深色下虚线与轴线深浅不一。
   * 统一成浅灰连接色（属性 + !important 样式，覆盖内联 `<style>`）。
   */
  function tuneTimelineConnectors(svg) {
    if (!svg) return;
    var isTimeline = !!(
      svg.querySelector('.task-line, .lineWrapper, line.task-line') ||
      (svg.getAttribute('aria-roledescription') || '').toLowerCase().indexOf('timeline') >= 0
    );
    if (!isTimeline) {
      // 部分版本无 class，靠虚线 line 兜底：存在 stroke-dasharray 的竖线即视为 timeline 连接
      var dashed = svg.querySelectorAll('line[stroke-dasharray]');
      if (!dashed.length) return;
      isTimeline = true;
    }

    var STROKE = '#cbd5e1';
    var STYLE_ID = 'mda-timeline-stroke-fix';
    var prev = svg.querySelector('#' + STYLE_ID);
    if (prev) prev.remove();
    var style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.setAttribute('id', STYLE_ID);
    style.textContent = [
      '.task-line,',
      '.lineWrapper line,',
      'g[class*="section-"] > line,',
      '[class*="section-"] line {',
      '  stroke: ' + STROKE + ' !important;',
      '}',
      'marker#arrowhead path, marker[id*="arrowhead"] path,',
      'marker#arrowhead polygon, marker[id*="arrowhead"] polygon {',
      '  fill: ' + STROKE + ' !important;',
      '  stroke: ' + STROKE + ' !important;',
      '}'
    ].join('\n');
    svg.insertBefore(style, svg.firstChild);

    var lines = svg.querySelectorAll('line');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // 表情 mouth 等装饰线跳过
      var cls = line.getAttribute('class') || '';
      if (/\bmouth\b/.test(cls)) continue;
      var inConnector =
        /\btask-line\b/.test(cls) ||
        !!(line.closest && (line.closest('.lineWrapper') || line.closest('[class*="section-"]'))) ||
        line.hasAttribute('stroke-dasharray');
      if (!inConnector) continue;
      line.setAttribute('stroke', STROKE);
      if (line.style) line.style.stroke = STROKE;
    }

    // 轴线（无 dash）在 lineWrapper 内
    var axisLines = svg.querySelectorAll('.lineWrapper line');
    for (var a = 0; a < axisLines.length; a++) {
      axisLines[a].setAttribute('stroke', STROKE);
      if (axisLines[a].style) axisLines[a].style.stroke = STROKE;
    }

    var markers = svg.querySelectorAll('marker[id*="arrowhead"] path, marker[id*="arrowhead"] polygon');
    for (var m = 0; m < markers.length; m++) {
      markers[m].setAttribute('fill', STROKE);
      markers[m].setAttribute('stroke', STROKE);
    }
  }

  /** Timeline / flowchart：近黑 stroke 在深色背景不可见 → 浅灰。 */
  function tuneDarkStrokes(svg) {
    var els = svg.querySelectorAll('[stroke], line, polyline, path, polygon');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var stroke = el.getAttribute('stroke');
      if ((!stroke || stroke === 'none') && el.style) stroke = el.style.stroke;
      if (!stroke || stroke === 'none' || stroke.indexOf('url(') === 0) continue;
      var rgb = parseCssColor(stroke);
      if (!rgb) continue;
      if (relativeLuminance(rgb.r, rgb.g, rgb.b) < 0.22) {
        el.setAttribute('stroke', '#cbd5e1');
        if (el.style) el.style.stroke = '#cbd5e1';
      }
    }
  }

  function tuneSankeyLinks(svg) {
    // Mermaid Sankey：g.links[fill=none] + path[stroke] + mix-blend-mode:multiply
    // multiply 在深色背景上会把彩色描边乘成近黑 → 必须关掉
    var linkGroups = svg.querySelectorAll('g.links, g.link, .links, .link');
    for (var g = 0; g < linkGroups.length; g++) {
      var grp = linkGroups[g];
      grp.style.mixBlendMode = 'normal';
      if (grp.getAttribute('stroke-opacity') != null || grp.style.strokeOpacity) {
        grp.setAttribute('stroke-opacity', '0.65');
        grp.style.strokeOpacity = '0.65';
      }
    }

    var paths = svg.querySelectorAll('g.links path, g.link path, path.link');
    if (!paths.length) {
      // 兜底：无 fill 但有粗 stroke 的 path
      var all = svg.querySelectorAll('path');
      var acc = [];
      for (var j = 0; j < all.length; j++) {
        var cand = all[j];
        var f = cand.getAttribute('fill');
        var sw = parseFloat(cand.getAttribute('stroke-width') || '0');
        if ((f === 'none' || !f) && sw >= 2) acc.push(cand);
      }
      paths = acc;
    }
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      p.style.mixBlendMode = 'normal';
      var stroke = p.getAttribute('stroke') || (p.style && p.style.stroke) || '';
      // gradient url 或过深实色 → 换成可见浅灰（或保留较亮的 source 色）
      var useFixed = !stroke || stroke.indexOf('url(') === 0;
      if (!useFixed) {
        var rgb = parseCssColor(stroke);
        if (rgb && relativeLuminance(rgb.r, rgb.g, rgb.b) < 0.35) useFixed = true;
      }
      if (useFixed) {
        p.setAttribute('stroke', '#94a3b8');
        if (p.style) p.style.stroke = '#94a3b8';
      }
      p.setAttribute('stroke-opacity', '0.7');
      if (p.style) p.style.strokeOpacity = '0.7';
      p.setAttribute('data-mda-sankey-link', '1');
    }
  }

  function parseCssColor(s) {
    s = String(s).trim();
    if (s.charAt(0) === '#') {
      var h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length !== 6) return null;
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }
    var m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return null;
  }

  function relativeLuminance(r, g, b) {
    function chan(c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  }

  function findMermaidLabelTexts(shapeEl) {
    var out = [];
    var g = shapeEl.closest && shapeEl.closest('g');
    if (!g) return out;
    var texts = g.querySelectorAll('text, tspan');
    for (var i = 0; i < texts.length; i++) out.push(texts[i]);
    return out;
  }

  // ---- 文件列表 / 编辑栏 / 批注栏（独立开关）----
  function toggleFilesSidebar() {
    if (!workspaceRoot || !leftRailEl || leftRailEl.classList.contains('hidden') || !fileSidebar) {
      uiAlert(uiT('alertOpenFolderFirst'));
      return;
    }
    fileSidebar.toggleCollapsed();
    updateToolbar();
  }

  function readEditorDismissed() {
    if (!isRememberLayout()) return false;
    try { return localStorage.getItem('mda-editor-pane-dismissed') === '1'; } catch (e) { return false; }
  }

  function setEditorDismissed(val) {
    editorUserDismissed = !!val;
    if (!isRememberLayout()) return;
    try {
      if (editorUserDismissed) localStorage.setItem('mda-editor-pane-dismissed', '1');
      else localStorage.removeItem('mda-editor-pane-dismissed');
    } catch (e) { /* ignore */ }
  }

  editorUserDismissed = readEditorDismissed();

  function shouldAutoOpenEditor() {
    return !editorUserDismissed;
  }

  function toggleEditor() {
    if (docState === 'welcome') { uiAlert(uiT('alertNewOrOpen')); return; }
    if (isCm6Ready() && window.MDAEditor) {
      editorVisible = !editorVisible;
      if (editorVisible) {
        setEditorDismissed(false);
        if (!dirty) setEditorTextValue(currentText);
        cm6Editor.setMode(window.MDAEditor.MODE_SOURCE || 'source');
      } else {
        setEditorDismissed(true);
        cm6Editor.setMode(window.MDAEditor.MODE_PREVIEW || 'preview');
      }
      focusActiveEditor();
      updateToolbar();
      return;
    }
    editorVisible = !editorVisible;
    if (editorVisible) {
      setEditorDismissed(false);
      if (!dirty) editorEl.value = currentText; // 无脏改动时同步磁盘内容
      editorPaneEl.classList.add('visible');
      splitLeftEl.classList.remove('hidden');
      refreshEditorDecorations();
      requestAnimationFrame(function () { editorEl.focus(); });
    } else {
      setEditorDismissed(true);
      editorPaneEl.classList.remove('visible');
      splitLeftEl.classList.add('hidden');
    }
    updateToolbar();
  }

  function readPanelVisiblePref() {
    if (!isRememberLayout()) return false;
    try { return localStorage.getItem('mda-panel-visible') === '1'; } catch (e) { return false; }
  }

  function savePanelVisiblePref(vis) {
    if (!isRememberLayout()) return;
    try {
      if (vis) localStorage.setItem('mda-panel-visible', '1');
      else localStorage.removeItem('mda-panel-visible');
    } catch (e) { /* ignore */ }
  }

  function applyPanelVisible(vis) {
    panelVisible = !!vis;
    if (panelPaneEl) panelPaneEl.classList.toggle('hidden', !panelVisible);
    if (splitRightEl) splitRightEl.classList.toggle('hidden', !panelVisible);
    updateToolbar();
  }

  function togglePanel() {
    applyPanelVisible(!panelVisible);
    savePanelVisiblePref(panelVisible);
  }

  // 刷新编辑器语法高亮层与行号槽（与 textarea 内容对齐）
  function refreshEditorDecorations() {
    var text = editorEl.value;
    // 替换高亮 DOM 时钉住滚动，避免视口被瞬间拽走
    var keepTop = editorEl.scrollTop;
    var keepLeft = editorEl.scrollLeft || 0;
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
    editorEl.scrollTop = keepTop;
    editorEl.scrollLeft = keepLeft;
    if (editorScrollFreeze) {
      editorScrollFreeze.top = keepTop;
      editorScrollFreeze.left = keepLeft;
    }
    syncEditorScrollLayers();
  }

  // 分栏拖拽调宽：side='left' 向右拖加宽；side='right' 向左拖加宽。
  // opts: { defaultWidth, minWidth, maxRatio, widthStorageKey }；双击手柄 → 复位到 defaultWidth。
  function setupSplitter(splitter, paneEl, side, opts) {
    if (!splitter || !paneEl) return;
    opts = opts || {};
    var defW = opts.defaultWidth != null
      ? opts.defaultWidth
      : (side === 'left' ? PANE_DEFAULT.editor : PANE_DEFAULT.panel);
    var minW = opts.minWidth != null ? opts.minWidth : 220;
    var maxRatio = opts.maxRatio != null ? opts.maxRatio : 0.7;
    var widthKey = opts.widthStorageKey || null;

    function persistWidth() {
      if (!widthKey) return;
      savePaneWidth(widthKey, paneEl.getBoundingClientRect().width);
    }

    var savedW = widthKey ? readPaneWidth(widthKey, minW) : null;
    if (savedW) paneEl.style.flex = '0 0 ' + savedW + 'px';

    splitter.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var startX = e.clientX;
      var startW = paneEl.getBoundingClientRect().width;
      function move(ev) {
        var dx = ev.clientX - startX;
        var w = side === 'left' ? startW + dx : startW - dx;
        w = Math.max(minW, Math.min(w, window.innerWidth * maxRatio));
        paneEl.style.flex = '0 0 ' + w + 'px';
      }
      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
        persistWidth();
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.body.style.cursor = 'col-resize';
    });
    splitter.addEventListener('dblclick', function () {
      paneEl.style.flex = '0 0 ' + defW + 'px';
      if (widthKey) savePaneWidth(widthKey, defW);
    });
    splitter.title = uiT('splitterHint');
  }

  // ---- 缩放遮罩（图片 / 流程图共用）----
  function fenceMermaidSource(src) {
    var body = String(src || '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
    return '```mermaid\n' + body + '\n```';
  }

  function fenceCodeSource(lang, code) {
    var body = String(code || '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
    var tag = lang ? String(lang).trim() : '';
    return '```' + tag + '\n' + body + '\n```';
  }

  function copyZoomMermaidSource(opts) {
    var src = (opts && opts.mermaidSrc) || '';
    if (!src) {
      showToast(uiT('toastNoCopy'));
      return;
    }
    copyTextWithToast(fenceMermaidSource(src), uiT('toastZoomCopiedMermaid'));
  }

  function copyZoomMermaidImage(opts) {
    var svg = (opts && opts.svgNode) || null;
    if (!svg) {
      uiAlert(uiT('alertZoomCopyFail', { error: uiT('unknownError') }));
      return;
    }
    copyMermaidSvgAsImage(svg);
  }

  /** mode: 'image' | 'source'；流程图默认 image（Ctrl+C） */
  function copyZoomContent(opts, mode) {
    opts = opts || {};
    if (opts.kind === 'mermaid') {
      if (mode === 'source') copyZoomMermaidSource(opts);
      else copyZoomMermaidImage(opts);
      return;
    }
    var imageSrc = opts.imageSrc || '';
    var preferredImg = null;
    if (opts.svgNode && opts.svgNode.tagName && String(opts.svgNode.tagName).toLowerCase() === 'img') {
      preferredImg = opts.svgNode;
    }
    // 缩放层舞台上的 img
    var zoomImg = document.querySelector('.mda-zoom-stage img');
    if (!preferredImg && zoomImg) preferredImg = zoomImg;
    if (!imageSrc && preferredImg) imageSrc = preferredImg.getAttribute('src') || '';
    if (!imageSrc && !preferredImg) {
      showToast(uiT('toastNoCopy'));
      return;
    }
    copyBitmapImageToClipboard(imageSrc, preferredImg, opts.mdSrc || opts.mdHref || '').then(function (ok) {
      if (!ok) { /* toast/alert 已由 helper 处理 */ }
    });
  }

  /**
   * 将已解码的 <img> 栅格化为 PNG dataUrl（GIF/WebP 首帧可用；系统剪贴板不支持动图）。
   * @param {HTMLImageElement} img
   * @returns {string}
   */
  function imgElementToPngDataUrl(img) {
    if (!img) throw new Error(uiT('unknownError'));
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error(uiT('unknownError'));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(uiT('unknownError'));
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function decodeImageHref(href) {
    if (!href) return '';
    var h = String(href).split('#')[0].split('?')[0];
    if (!/%[0-9A-Fa-f]{2}/.test(h)) return h;
    try {
      return decodeURIComponent(h);
    } catch (e) {
      return h;
    }
  }

  function resolveCopyImageLocalPath(src) {
    if (!src) return null;
    var local = fileUrlToPath(src);
    if (local) return local;
    if (/^(https?:|data:)/i.test(src)) return null;
    if (!currentFilePath || !api.resolvePath) return null;
    return api.resolvePath(currentFilePath, decodeImageHref(src));
  }

  function isGifLikeSrc(src) {
    var s = decodeImageHref(src);
    return /^data:image\/gif/i.test(s) || /\.gif(\?|#|$)/i.test(s);
  }

  function isPreserveFormatSrc(src) {
    var s = decodeImageHref(src);
    return (
      isGifLikeSrc(s) ||
      /^data:image\/(webp|svg\+xml)/i.test(s) ||
      /\.(webp|svg)(\?|#|$)/i.test(s)
    );
  }

  /**
   * 写入剪贴板图片。GIF 保留原字节供 MDA 粘贴，同时尽量写入系统位图。
   * @param {string} imageSrc
   * @param {HTMLImageElement | null} [preferredImg]
   * @param {string} [mdHref] markdown 源码中的图片路径（用于 GIF/WebP 保留原格式）
   * @returns {Promise<boolean>}
   */
  function copyBitmapImageToClipboard(imageSrc, preferredImg, mdHref) {
    function fail(err) {
      uiAlert(uiT('alertZoomCopyFail', { error: err || uiT('unknownError') }));
      return false;
    }
    if (!api.copyClipboardImage) return Promise.resolve(fail(uiT('unknownError')));

    function ok() {
      showToast(uiT('toastZoomCopiedImage'));
      return true;
    }

    function writeRasterFallback(elOrSrc) {
      return new Promise(function (resolve) {
        function sendPng(dataUrl) {
          api
            .copyClipboardImage({
              dataUrl: dataUrl,
              keepOriginalCache: true,
            })
            .then(function (r2) {
              if (r2 && r2.success) resolve(ok());
              else resolve(fail(r2 && r2.error));
            })
            .catch(function (e) {
              resolve(fail(e && e.message ? e.message : String(e)));
            });
        }
        try {
          if (elOrSrc && elOrSrc.tagName === 'IMG') {
            if (elOrSrc.naturalWidth) {
              sendPng(imgElementToPngDataUrl(elOrSrc));
              return;
            }
            elOrSrc.addEventListener(
              'load',
              function () {
                try {
                  sendPng(imgElementToPngDataUrl(elOrSrc));
                } catch (e) {
                  resolve(fail(e && e.message ? e.message : String(e)));
                }
              },
              { once: true }
            );
            elOrSrc.addEventListener(
              'error',
              function () {
                resolve(fail(uiT('unknownError')));
              },
              { once: true }
            );
            return;
          }
          var probe = new Image();
          probe.onload = function () {
            try {
              sendPng(imgElementToPngDataUrl(probe));
            } catch (e) {
              resolve(fail(e && e.message ? e.message : String(e)));
            }
          };
          probe.onerror = function () {
            resolve(fail(uiT('unknownError')));
          };
          probe.src = String(elOrSrc || '');
        } catch (e) {
          resolve(fail(e && e.message ? e.message : String(e)));
        }
      });
    }

    function afterCopyResult(r, fallbackTarget) {
      if (r && r.success && !r.needsRasterFallback) return Promise.resolve(ok());
      if ((r && r.needsRasterFallback) || fallbackTarget) {
        return writeRasterFallback(fallbackTarget);
      }
      return Promise.resolve(fail(r && r.error));
    }

    var src = imageSrc || (preferredImg && preferredImg.getAttribute('src')) || '';
    var pathHint = mdHref || src;
    var localPath = resolveCopyImageLocalPath(src);
    if (!localPath && mdHref) localPath = resolveCopyImageLocalPath(mdHref);
    var fallbackTarget = preferredImg && preferredImg.naturalWidth ? preferredImg : src;

    if (localPath && isPreserveFormatSrc(pathHint)) {
      return api
        .copyClipboardImage({ filePath: localPath, preserveOriginal: true })
        .then(function (r) {
          return afterCopyResult(r, fallbackTarget);
        });
    }
    if (isPreserveFormatSrc(pathHint) || isPreserveFormatSrc(src)) {
      if (/^data:image\//i.test(src)) {
        return api
          .copyClipboardImage({ dataUrl: src, preserveOriginal: true })
          .then(function (r) {
            return afterCopyResult(r, fallbackTarget);
          });
      }
      if (localPath) {
        return api
          .copyClipboardImage({ filePath: localPath, preserveOriginal: true })
          .then(function (r) {
            return afterCopyResult(r, fallbackTarget);
          });
      }
    }

    if (/^data:image\/(png|jpe?g|bmp)/i.test(src)) {
      return api.copyClipboardImage({ dataUrl: src }).then(function (r) {
        if (r && r.success) return ok();
        return afterCopyResult(r, fallbackTarget);
      });
    }

    if (localPath) {
      return api.copyClipboardImage({ filePath: localPath }).then(function (r) {
        if (r && r.success && !r.needsRasterFallback) return ok();
        return afterCopyResult(r, fallbackTarget);
      });
    }

    if (preferredImg || src) {
      return writeRasterFallback(fallbackTarget || preferredImg || src);
    }
    return Promise.resolve(fail(uiT('toastNoCopy')));
  }

  function imageMdHrefFromBlock(block) {
    if (block && block.meta && block.meta.src) return block.meta.src;
    var source = block && block.source ? String(block.source) : '';
    var m = /^!\[[^\]]*\]\(\s*<?([^)\s>]+)>?/.exec(source.trim());
    return m ? m[1] : '';
  }

  function getCm6BlockSource(block) {
    if (block && block.source) return String(block.source);
    if (!isCm6Ready() || !cm6Editor.view || !window.MDAEditor) return '';
    var range = window.MDAEditor.resolveBlockRange(cm6Editor.view, block);
    if (!range) return '';
    return cm6Editor.view.state.doc.sliceString(range.from, range.to);
  }

  function imageBlockMarkdownWithAbsPath(block) {
    var source = getCm6BlockSource(block);
    if (!source) return '';
    var href = imageMdHrefFromBlock(block);
    if (!href) return source;
    var abs =
      resolveCopyImageLocalPath(resolveImageUrlForEditor(href) || href) ||
      resolveCopyImageLocalPath(href);
    if (!abs) return source;
    abs = String(abs).replace(/\\/g, '/');
    var meta = { alt: '', src: abs, title: '' };
    var m = /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)$/.exec(
      source.trim()
    );
    if (m) {
      meta.alt = m[1] || '';
      meta.title = m[3] || m[4] || '';
    }
    if (window.MDAEditor && window.MDAEditor.serializeImageMarkdown) {
      return window.MDAEditor.serializeImageMarkdown(meta);
    }
    return '![' + meta.alt + '](' + abs + (meta.title ? ' "' + meta.title + '"' : '') + ')';
  }

  function copyCm6BlockAsMarkdown(block, kind) {
    var text = '';
    if (kind === 'image') text = imageBlockMarkdownWithAbsPath(block);
    else text = getCm6BlockSource(block);
    if (!text) {
      showToast(uiT('toastNoCopy'));
      return;
    }
    if (api.copyToClipboard) api.copyToClipboard(text);
    showToast(uiT('toastCopied'));
  }

  function stripBlockExportChrome(root) {
    if (!root) return;
    root.querySelectorAll(
      '.mda-cm-block-toolbar,.mda-cm-block-drag-handle,.mda-cm-image-handles,.mda-cm-mermaid-handles,.mda-cm-code-lang-picker,.mda-cm-block-type-icon'
    ).forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    root.classList.remove(
      'mda-cm-media-selected',
      'mda-cm-block-selected',
      'mda-cm-code-editing',
      'mda-cm-mermaid-source-mode'
    );
  }

  function expandBlockExportClone(clone) {
    if (!clone) return;
    clone.style.overflow = 'visible';
    clone.style.maxHeight = 'none';
    clone.style.height = 'auto';
    clone.querySelectorAll(
      '.mda-cm-code-preview,.mda-cm-code-scroll,.mda-cm-code-stage,.mda-cm-code-stack,.mda-cm-code-highlight,.mda-cm-code-input,.mda-cm-mermaid-stage,.mda-cm-mermaid-frame,.mda-cm-mermaid-source,.mda-cm-image-inner,.mda-md-surface'
    ).forEach(function (node) {
      node.style.overflow = 'visible';
      node.style.maxHeight = 'none';
      node.style.height = 'auto';
      node.style.maxWidth = 'none';
    });
    clone.querySelectorAll('.mda-cm-mermaid-source').forEach(function (node) {
      node.style.display = 'none';
    });
  }

  function measureOffscreenBlock(clone) {
    var wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;overflow:visible;z-index:-1;';
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    var w = Math.ceil(
      Math.max(
        clone.scrollWidth || 0,
        clone.offsetWidth || 0,
        clone.getBoundingClientRect().width || 0
      )
    );
    var h = Math.ceil(
      Math.max(
        clone.scrollHeight || 0,
        clone.offsetHeight || 0,
        clone.getBoundingClientRect().height || 0
      )
    );
    document.body.removeChild(wrap);
    return { w: Math.max(w, 1), h: Math.max(h, 1) };
  }

  var EXPORT_EDGE_PAD = 8;
  var EXPORT_MEASURE_BUFFER = 2;
  var EXPORT_BITMAP_SCALE = 2;

  function exportBitmapScale() {
    return Math.min(3, Math.max(EXPORT_BITMAP_SCALE, Math.round(window.devicePixelRatio || EXPORT_BITMAP_SCALE)));
  }

  function normalizeCapturePngForExport(dataUrl, logicalW, logicalH) {
    var targetW = Math.max(1, Math.round(logicalW));
    var targetH = Math.max(1, Math.round(logicalH));
    var bg = readCssVar('--bg', '#ffffff');
    return new Promise(function (resolve) {
      if (!dataUrl) {
        resolve(null);
        return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          var nw = img.naturalWidth || img.width || 0;
          var nh = img.naturalHeight || img.height || 0;
          if (!nw || !nh) {
            resolve(dataUrl);
            return;
          }
          if (nw === targetW && nh === targetH) {
            resolve(dataUrl);
            return;
          }
          var canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, nw, nh, 0, 0, targetW, targetH);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = function () {
        resolve(dataUrl);
      };
      img.src = dataUrl;
    });
  }

  async function awaitExportFrames() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  function withEditorExportCapture(run) {
    var host = document.querySelector('.mda-cm6-host');
    if (host) host.classList.add('mda-export-capture');
    document.body.classList.add('mda-export-capture');
    return Promise.resolve()
      .then(function () {
        return awaitExportFrames();
      })
      .then(run)
      .finally(function () {
        if (host) host.classList.remove('mda-export-capture');
        document.body.classList.remove('mda-export-capture');
      });
  }

  function isRectCapturable(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom <= 0 || rect.right <= 0) return false;
    if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
    return true;
  }

  function readCmEditorContentRect() {
    var contentEl =
      document.querySelector('.mda-cm6-host .cm-content') ||
      document.querySelector('.mda-cm6-host .cm-scroller');
    if (!contentEl) return null;
    var r = contentEl.getBoundingClientRect();
    if (!(r.width > 0)) return null;
    return {
      left: r.left,
      top: r.top,
      width: Math.ceil(r.width),
      height: Math.ceil(r.height),
    };
  }

  /** 引用行：左缘从引用行起（不含块手柄），右缘到内容栏右边界。 */
  function unionQuoteLinesCaptureRect(lines) {
    var column = readCmEditorContentRect();
    var minTop = Infinity;
    var maxBottom = -Infinity;
    var minLeft = Infinity;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || !line.getBoundingClientRect) continue;
      var lr = line.getBoundingClientRect();
      if (!(lr.height > 0)) continue;
      minTop = Math.min(minTop, lr.top);
      maxBottom = Math.max(maxBottom, lr.bottom);
      minLeft = Math.min(minLeft, lr.left);
    }
    if (!column || !(maxBottom > minTop) || !(minLeft < Infinity)) return null;
    var right = column.left + column.width;
    return {
      left: minLeft,
      top: minTop,
      width: Math.max(1, Math.ceil(right - minLeft)),
      height: Math.max(1, Math.ceil(maxBottom - minTop)),
    };
  }

  function quoteExportColumnWidth(liveLines) {
    var column = readCmEditorContentRect();
    if (!column || !liveLines || !liveLines.length) return readCmEditorContentWidth();
    var minLeft = Infinity;
    for (var i = 0; i < liveLines.length; i++) {
      var line = liveLines[i];
      if (!line || !line.getBoundingClientRect) continue;
      minLeft = Math.min(minLeft, line.getBoundingClientRect().left);
    }
    if (!(minLeft < Infinity)) return column.width;
    return Math.max(1, Math.ceil(column.left + column.width - minLeft));
  }

  async function capturePageRegion(rect) {
    if (!api.capturePageRect || !rect) return null;
    if (!isRectCapturable(rect)) return null;
    var cap = await api.capturePageRect({
      x: Math.floor(rect.left),
      y: Math.floor(rect.top),
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    });
    if (cap && cap.success && isValidPngDataUrl(cap.dataUrl)) {
      return normalizeCapturePngForExport(cap.dataUrl, rect.width, rect.height);
    }
    return null;
  }

  async function exportMeasuredHtmlToPng(html, width, height, extraCss, opts) {
    opts = opts || {};
    var edgePad = opts.edgePad != null ? opts.edgePad : EXPORT_EDGE_PAD;
    var measureBuffer = opts.measureBuffer != null ? opts.measureBuffer : EXPORT_MEASURE_BUFFER;
    var w = Math.max(1, Math.ceil(width) + measureBuffer);
    var h = Math.max(1, Math.ceil(height) + measureBuffer);
    var payload = buildBlockDomSvgPayload(html, w, h, extraCss, edgePad, opts.scale);
    var png = await svgPayloadToPng(payload);
    return png && png.dataUrl ? png.dataUrl : null;
  }

  function buildBlockDomSvgPayload(html, contentWidth, contentHeight, extraCss, edgePad, scale) {
    var pad = Math.max(0, edgePad || 0);
    var cw = Math.max(1, Math.ceil(contentWidth));
    var ch = Math.max(1, Math.ceil(contentHeight));
    var lw = cw + pad * 2;
    var lh = ch + pad * 2;
    var bitmapScale = scale || exportBitmapScale();
    var pw = lw * bitmapScale;
    var ph = lh * bitmapScale;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var bg = dark ? '#1e1e1e' : '#ffffff';
    var fg = dark ? '#e0e0e0' : '#222222';
    var css =
      '.mda-export-root{box-sizing:border-box;margin:0;padding:0;background:' +
      bg +
      ';color:' +
      fg +
      ';overflow:visible;}' +
      'pre,code{font-family:Consolas,Monaco,"Courier New",monospace;white-space:pre;}' +
      'svg{max-width:none!important;max-height:none!important;}' +
      (extraCss || '');
    var rootBg =
      extraCss && extraCss.indexOf('background:transparent') >= 0 ? 'transparent' : bg;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" overflow="visible" width="' +
      pw +
      '" height="' +
      ph +
      '" viewBox="0 0 ' +
      lw +
      ' ' +
      lh +
      '">' +
      '<foreignObject x="0" y="0" width="' +
      lw +
      '" height="' +
      lh +
      '" overflow="visible" style="margin:0;padding:0;border:none;outline:none;box-shadow:none;">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" class="mda-export-root" style="box-sizing:border-box;width:' +
      lw +
      'px;min-height:' +
      lh +
      'px;padding:' +
      pad +
      'px;overflow:visible;background:' +
      rootBg +
      ';color:' +
      fg +
      ';border:none;outline:none;box-shadow:none;">' +
      '<style type="text/css">' +
      css +
      '</style>' +
      html +
      '</div></foreignObject></svg>';
    return {
      svg: svg,
      pixelWidth: pw,
      pixelHeight: ph,
      logicalWidth: lw,
      logicalHeight: lh,
      scale: bitmapScale,
      bg: bg,
    };
  }

  async function domCloneToPngDataUrl(clone) {
    if (!clone || !window.MDAKatexExport) throw new Error(uiT('unknownError'));
    expandBlockExportClone(clone);
    var size = measureOffscreenBlock(clone);
    var payload = buildBlockDomSvgPayload(clone.outerHTML, size.w, size.h, null, EXPORT_EDGE_PAD);
    var png = await svgPayloadToPng(payload);
    return png && png.dataUrl ? png.dataUrl : null;
  }

  async function exportBlockFrameToPng(frameEl) {
    if (!frameEl) throw new Error(uiT('unknownError'));
    var expandSel =
      '.mda-cm-code-preview,.mda-cm-code-scroll,.mda-cm-code-stage,.mda-cm-code-stack,.mda-cm-mermaid-stage,.mda-cm-mermaid-source';
    var saved = [];
    var nodes = [frameEl].concat(Array.prototype.slice.call(frameEl.querySelectorAll(expandSel)));
    nodes.forEach(function (node) {
      saved.push({
        node: node,
        overflow: node.style.overflow,
        maxHeight: node.style.maxHeight,
        height: node.style.height,
      });
      node.style.overflow = 'visible';
      node.style.maxHeight = 'none';
      node.style.height = 'auto';
    });
    var clone = frameEl.cloneNode(true);
    stripBlockExportChrome(clone);
    var liveW = Math.ceil(frameEl.getBoundingClientRect().width);
    if (liveW > 0) clone.style.width = liveW + 'px';
    saved.forEach(function (s) {
      s.node.style.overflow = s.overflow;
      s.node.style.maxHeight = s.maxHeight;
      s.node.style.height = s.height;
    });
    return domCloneToPngDataUrl(clone);
  }

  function readCodeBlockExportText(frameEl) {
    var input = frameEl.querySelector('.mda-cm-code-input');
    if (!input) return '';
    return (input.innerText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\u00a0/g, ' ');
  }

  function readCodeBlockExportLangLabel(frameEl) {
    var lab = frameEl.querySelector('.mda-cm-code-lang-idle-label');
    if (lab && lab.textContent) return lab.textContent.trim();
    return uiT('widgetCodeLangPlain');
  }

  function readCodeBlockExportLangId(frameEl) {
    var input = frameEl.querySelector('.mda-cm-code-input');
    if (!input) return '';
    var m = /\blanguage-([^\s]+)/.exec(input.className || '');
    return m ? m[1] : '';
  }

  function buildCodeBlockExportHighlightHtml(frameEl, codeText, langId) {
    var input = frameEl.querySelector('.mda-cm-code-input');
    if (
      input &&
      !frameEl.classList.contains('mda-cm-code-editing') &&
      input.innerHTML &&
      /<span\b/i.test(input.innerHTML)
    ) {
      return input.innerHTML;
    }
    if (api.highlightSource && codeText) {
      var fenceLang = langId && langId !== 'plaintext' ? langId : '';
      var fenced = '```' + fenceLang + '\n' + codeText + '\n```';
      var hl = api.highlightSource(fenced);
      if (hl) {
        var m = /<code[^>]*>([\s\S]*?)<\/code>/i.exec(hl);
        if (m) return m[1];
      }
    }
    return escHtml(codeText);
  }

  function codeBlockExportThemeCss() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      return (
        '.mda-export-code .mda-export-code-pre code{color:#e6edf3;}' +
        '.mda-export-code .hljs-comment,.mda-export-code .hljs-quote{color:#768390;}' +
        '.mda-export-code .hljs-string,.mda-export-code .hljs-doctag,.mda-export-code .hljs-regexp,.mda-export-code .hljs-addition{color:#91c8ff;}' +
        '.mda-export-code .hljs-number,.mda-export-code .hljs-literal,.mda-export-code .hljs-variable,.mda-export-code .hljs-attr,.mda-export-code .hljs-attribute,.mda-export-code .hljs-meta{color:#6cb6ff;}'
      );
    }
    return (
      '.mda-export-code .mda-export-code-pre code{color:#24292f;}' +
      '.mda-export-code .hljs-comment,.mda-export-code .hljs-quote{color:#57606a;}' +
      '.mda-export-code .hljs-string,.mda-export-code .hljs-doctag,.mda-export-code .hljs-regexp,.mda-export-code .hljs-addition{color:#021b3d;}' +
      '.mda-export-code .hljs-number,.mda-export-code .hljs-literal,.mda-export-code .hljs-variable,.mda-export-code .hljs-attr,.mda-export-code .hljs-attribute,.mda-export-code .hljs-meta{color:#0049b0;}'
    );
  }

  function buildCodeBlockExportHtml(codeText, langLabel, codeHtml) {
    var lines = codeText.split('\n');
    var gutter = '';
    for (var i = 0; i < lines.length; i++) {
      gutter += '<div class="mda-export-code-gutter-line">' + (i + 1) + '</div>';
    }
    return (
      '<div class="mda-export-code">' +
      '<div class="mda-export-code-toolbar">' +
      '<span class="mda-export-code-lang">' +
      escHtml(langLabel) +
      '</span>' +
      '<span class="mda-export-code-copy-btn">' +
      escHtml(uiT('copyBtn')) +
      '</span>' +
      '</div>' +
      '<div class="mda-export-code-stage">' +
      '<div class="mda-export-code-gutter">' +
      gutter +
      '</div>' +
      '<div class="mda-export-code-scroll">' +
      '<pre class="mda-export-code-pre"><code class="hljs">' +
      codeHtml +
      '</code></pre>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function codeBlockExportLayoutCss(colors) {
    return (
      '.mda-export-root{background:transparent!important;padding:0!important;}' +
      '.mda-export-code{box-sizing:border-box;border:none;border-radius:8px;box-shadow:inset 0 0 0 1px ' +
      colors.border +
      ';background:' +
      colors.bg +
      ';overflow:visible;font-family:"Cascadia Code",Consolas,"Courier New","Microsoft YaHei",monospace;font-size:13px;line-height:21px;}' +
      '.mda-export-code-toolbar{display:flex;align-items:center;justify-content:space-between;min-height:36px;padding:0 10px;box-shadow:inset 0 -1px 0 0 ' +
      colors.borderLight +
      ';background:' +
      colors.toolbarBg +
      ';font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif;font-size:12px;border-radius:7px 7px 0 0;}' +
      '.mda-export-code-lang{color:' +
      colors.muted +
      ';font-weight:600;}' +
      '.mda-export-code-copy-btn{display:inline-block;padding:2px 8px;border-radius:4px;border:1px solid ' +
      colors.btnBorder +
      ';background:' +
      colors.btnBg +
      ';color:' +
      colors.btnText +
      ';}' +
      '.mda-export-code-stage{display:flex;align-items:stretch;min-height:45px;border-radius:0 0 7px 7px;overflow:hidden;}' +
      '.mda-export-code-gutter{flex:0 0 40px;width:40px;padding:12px 8px 12px 12px;text-align:right;color:' +
      colors.gutterText +
      ';background:' +
      colors.gutterBg +
      ';box-shadow:inset -1px 0 0 0 ' +
      colors.border +
      ';box-sizing:border-box;user-select:none;}' +
      '.mda-export-code-gutter-line{height:21px;white-space:pre;}' +
      '.mda-export-code-scroll{flex:1 1 auto;min-width:0;padding:12px 12px 12px 6px;overflow:visible;box-sizing:border-box;}' +
      '.mda-export-code-pre{margin:0;padding:0;background:transparent;}' +
      '.mda-export-code-pre code{display:block;margin:0;padding:0;font-family:inherit;font-size:inherit;line-height:21px;white-space:pre;tab-size:4;}'
    );
  }

  function readCodeBlockExportColors(frameEl) {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var cs = window.getComputedStyle(frameEl);
    var gutter = frameEl.querySelector('.mda-cm-code-gutter');
    var gutterCs = gutter ? window.getComputedStyle(gutter) : cs;
    var toolbar = frameEl.querySelector('.mda-cm-block-toolbar');
    var toolbarCs = toolbar ? window.getComputedStyle(toolbar) : cs;
    return {
      dark: dark,
      border: cs.borderColor || (dark ? '#3c3c3c' : '#d8dee4'),
      borderLight: toolbarCs.borderBottomColor || cs.borderColor || (dark ? '#3c3c3c' : '#e8ecef'),
      bg: cs.backgroundColor || (dark ? '#252526' : '#f6f8fa'),
      toolbarBg: toolbarCs.backgroundColor || (dark ? '#2d2d2d' : '#ffffff'),
      muted: dark ? '#8b949e' : '#57606a',
      gutterBg: gutterCs.backgroundColor || (dark ? '#0d1117' : '#eef1f4'),
      gutterText: gutterCs.color || (dark ? '#6e7681' : '#8c959f'),
      btnBorder: dark ? '#3c3c3c' : '#d8dee4',
      btnBg: dark ? '#252526' : '#ffffff',
      btnText: dark ? '#e6edf3' : '#24292f',
    };
  }

  async function exportCodeBlockToPng(frameEl) {
    if (!frameEl) throw new Error(uiT('unknownError'));
    frameEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    await awaitExportFrames();
    var liveRect = frameEl.getBoundingClientRect();
    if (liveRect.width > 0 && liveRect.height > 0) {
      var liveCaptured = await capturePageRegion({
        left: liveRect.left,
        top: liveRect.top,
        width: liveRect.width,
        height: liveRect.height,
      });
      if (liveCaptured) return liveCaptured;
    }

    var codeText = readCodeBlockExportText(frameEl);
    var langLabel = readCodeBlockExportLangLabel(frameEl);
    var langId = readCodeBlockExportLangId(frameEl);
    var codeHtml = buildCodeBlockExportHighlightHtml(frameEl, codeText, langId);
    var colors = readCodeBlockExportColors(frameEl);
    var layoutCss = codeBlockExportLayoutCss(colors);
    var themeCss = codeBlockExportThemeCss();
    var html = buildCodeBlockExportHtml(codeText, langLabel, codeHtml);
    var frameWidth = Math.ceil(frameEl.getBoundingClientRect().width);
    var maxW = readCmEditorContentWidth();

    var measureHost = document.createElement('div');
    measureHost.setAttribute('aria-hidden', 'true');
    measureHost.style.cssText =
      'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;overflow:visible;z-index:-1;padding:0;border:none;margin:0;background:transparent;';
    var styleEl = document.createElement('style');
    styleEl.textContent = layoutCss + themeCss;
    measureHost.appendChild(styleEl);
    var mount = document.createElement('div');
    mount.innerHTML = html;
    var root = mount.firstElementChild;
    if (!root) throw new Error(uiT('unknownError'));
    measureHost.appendChild(root);
    document.body.appendChild(measureHost);
    try {
      var pre = root.querySelector('.mda-export-code-pre code');
      var gutterEl = root.querySelector('.mda-export-code-gutter');
      var contentW = pre
        ? Math.ceil(pre.scrollWidth + (gutterEl ? gutterEl.offsetWidth : 40) + 18)
        : 0;
      var w = Math.max(frameWidth, contentW, 320);
      w = Math.min(w, maxW);
      root.style.width = w + 'px';
      root.style.maxWidth = w + 'px';
      root.style.margin = '0';
      var h = Math.max(
        1,
        Math.ceil(root.scrollHeight),
        Math.ceil(root.getBoundingClientRect().height)
      );
      return exportMeasuredHtmlToPng(root.outerHTML, w, h, layoutCss + themeCss, {
        edgePad: 0,
        measureBuffer: 0,
      });
    } finally {
      if (measureHost.parentNode) measureHost.parentNode.removeChild(measureHost);
    }
  }

  function readCssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function readTableExportColors(wrapEl, tableEl) {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var wrapCs = wrapEl ? window.getComputedStyle(wrapEl) : null;
    var tableCs = tableEl ? window.getComputedStyle(tableEl) : null;
    var th = tableEl && tableEl.querySelector('th');
    var thCs = th ? window.getComputedStyle(th) : tableCs;
    return {
      dark: dark,
      border: (wrapCs && wrapCs.borderColor) || readCssVar('--border', dark ? '#30363d' : '#d0d7de'),
      bg: (wrapCs && wrapCs.backgroundColor) || readCssVar('--bg', dark ? '#0d1117' : '#ffffff'),
      bgTertiary: (thCs && thCs.backgroundColor) || readCssVar('--bg-tertiary', dark ? '#161b22' : '#f6f8fa'),
      tableAlt: readCssVar('--table-alt', readCssVar('--bg-secondary', dark ? '#161b22' : '#f6f8fa')),
      text: (tableCs && tableCs.color) || readCssVar('--text', dark ? '#c9d1d9' : '#24292f'),
    };
  }

  function tableExportLayoutCss(colors) {
    return (
      '.mda-export-table-wrap{box-sizing:border-box;display:inline-block;width:fit-content;max-width:100%;border:1px solid ' +
      colors.border +
      ';background:' +
      colors.bg +
      ';color:' +
      colors.text +
      ';overflow:visible;}' +
      '.mda-export-table{border-collapse:collapse;width:100%;min-width:0;font-size:14px;background:' +
      colors.bg +
      ';margin:0;border:none;}' +
      '.mda-export-table th,.mda-export-table td{padding:6px 13px;border-right:1px solid ' +
      colors.border +
      ';border-bottom:1px solid ' +
      colors.border +
      ';text-align:left;vertical-align:top;color:' +
      colors.text +
      ';}' +
      '.mda-export-table tr th:last-child,.mda-export-table tr td:last-child{border-right:none;}' +
      '.mda-export-table tbody tr:last-child td{border-bottom:none;}' +
      '.mda-export-table th{background:' +
      colors.bgTertiary +
      ';font-weight:600;}' +
      '.mda-export-table tbody tr:nth-child(2n) td{background:' +
      colors.tableAlt +
      ';}' +
      '.mda-export-table .mda-cm-table-math,.mda-export-table .katex{font-size:1.05em;line-height:1.2;vertical-align:-0.04em;}' +
      '.mda-export-table .mda-cm-table-img{display:block;width:100%;max-width:100%;line-height:0;}' +
      '.mda-export-table .mda-cm-table-img img{display:block;width:100%;max-width:100%;height:auto;object-fit:contain;}'
    );
  }

  function sanitizeTableCloneForExport(clone) {
    if (!clone) return;
    clone.className = 'mda-export-table';
    clone.removeAttribute('data-mda-layout');
    clone.style.tableLayout = 'fixed';
    clone.querySelectorAll('.mda-cm-table-cell-selected').forEach(function (el) {
      el.classList.remove('mda-cm-table-cell-selected');
    });
    clone.querySelectorAll('[contenteditable]').forEach(function (el) {
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
      el.style.boxShadow = '';
      el.style.outline = '';
    });
  }

  function syncTableCloneDimensions(liveTable, cloneTable) {
    if (!liveTable || !cloneTable) return;
    var liveWrap = liveTable.closest('.mda-cm-table-wrap');
    var tableW = Math.ceil((liveWrap || liveTable).getBoundingClientRect().width);
    if (tableW > 0) {
      cloneTable.style.width = tableW + 'px';
      cloneTable.style.maxWidth = tableW + 'px';
      cloneTable.style.tableLayout = 'fixed';
    }
    var liveHeaderCells = liveTable.querySelectorAll('thead th');
    var cloneHeaderCells = cloneTable.querySelectorAll('thead th');
    for (var i = 0; i < liveHeaderCells.length; i++) {
      var cw = Math.ceil(liveHeaderCells[i].getBoundingClientRect().width);
      if (cw > 0 && cloneHeaderCells[i]) {
        cloneHeaderCells[i].style.width = cw + 'px';
        cloneHeaderCells[i].style.minWidth = cw + 'px';
        cloneHeaderCells[i].style.maxWidth = cw + 'px';
      }
    }
    var liveRows = liveTable.querySelectorAll('tr');
    var cloneRows = cloneTable.querySelectorAll('tr');
    for (var r = 0; r < liveRows.length; r++) {
      var rh = Math.ceil(liveRows[r].getBoundingClientRect().height);
      if (rh > 0 && cloneRows[r]) cloneRows[r].style.height = rh + 'px';
    }
  }

  function waitForExportImages(root, timeoutMs) {
    if (!root) return Promise.resolve();
    var imgs = root.querySelectorAll('img');
    if (!imgs.length) return Promise.resolve();
    var pending = [];
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        if (img.complete && img.naturalWidth > 0) return;
        pending.push(
          new Promise(function (resolve) {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })
        );
      })(imgs[i]);
    }
    if (!pending.length) return Promise.resolve();
    return Promise.race([
      Promise.all(pending),
      new Promise(function (resolve) {
        setTimeout(resolve, timeoutMs || 8000);
      }),
    ]);
  }

  async function inlineExportImage(cloneImg, liveImg) {
    if (!cloneImg) return;
    var src = cloneImg.getAttribute('src') || '';
    if (!src || /^data:/i.test(src)) return;
    var filePath = fileUrlToPath(src);
    if (!filePath && currentFilePath) filePath = api.resolvePath(currentFilePath, src);
    if (filePath && api.readFileAsDataUrl) {
      var r = await api.readFileAsDataUrl(filePath);
      if (r && r.success && r.dataUrl) {
        cloneImg.setAttribute('src', r.dataUrl);
        return;
      }
    }
    var sourceImg = liveImg;
    if (!sourceImg && src) {
      sourceImg = document.querySelector('img[src="' + String(src).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]');
    }
    if (sourceImg && sourceImg.complete && sourceImg.naturalWidth > 0) {
      try {
        cloneImg.setAttribute('src', await imgElementToDataUrl(sourceImg));
      } catch (e) {
        /* keep original src */
      }
    }
  }

  async function captureExportNodePng(node, logicalW, logicalH) {
    if (!node) return null;
    await waitForExportImages(node);
    await awaitExportFrames();
    var rect = node.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    return capturePageRegion({
      left: rect.left,
      top: rect.top,
      width: logicalW > 0 ? logicalW : rect.width,
      height: logicalH > 0 ? logicalH : rect.height,
    });
  }

  function placeExportCaptureHost(host, wrapWidth, wrapHeight) {
    var pad = 12;
    var w = Math.max(1, Math.ceil(wrapWidth));
    var h = Math.max(1, Math.ceil(wrapHeight));
    var left = Math.max(pad, window.innerWidth - w - pad);
    var top = Math.max(pad, window.innerHeight - h - pad);
    host.style.cssText =
      'position:fixed;left:' +
      left +
      'px;top:' +
      top +
      'px;z-index:2147483646;pointer-events:none;overflow:visible;visibility:visible;background:transparent;';
  }

  async function exportTableBlockToPng(blockEl) {
    if (!blockEl) throw new Error(uiT('unknownError'));
    var liveTable = blockEl.querySelector('table.mda-cm-table');
    if (!liveTable) throw new Error(uiT('unknownError'));
    var liveWrap = blockEl.querySelector('.mda-cm-table-wrap');
    var cloneTable = liveTable.cloneNode(true);
    sanitizeTableCloneForExport(cloneTable);
    syncTableCloneDimensions(liveTable, cloneTable);
    var colors = readTableExportColors(liveWrap, liveTable);
    var layoutCss = tableExportLayoutCss(colors);
    var frameWidth = Math.ceil((liveWrap || blockEl).getBoundingClientRect().width);

    var measureHost = document.createElement('div');
    measureHost.setAttribute('aria-hidden', 'true');
    measureHost.style.cssText =
      'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;overflow:visible;z-index:-1;';
    var styleEl = document.createElement('style');
    styleEl.textContent = layoutCss;
    var wrap = document.createElement('div');
    wrap.className = 'mda-export-table-wrap';
    wrap.appendChild(cloneTable);
    measureHost.appendChild(styleEl);
    measureHost.appendChild(wrap);
    document.body.appendChild(measureHost);
    try {
      var liveImgs = liveTable.querySelectorAll('img');
      var cloneImgs = cloneTable.querySelectorAll('img');
      for (var i = 0; i < cloneImgs.length; i++) {
        await inlineExportImage(cloneImgs[i], liveImgs[i]);
      }
      await waitForExportImages(wrap);

      var contentW = Math.max(
        frameWidth,
        Math.ceil(cloneTable.scrollWidth),
        Math.ceil(cloneTable.getBoundingClientRect().width),
        240
      );
      wrap.style.width = contentW + 'px';
      cloneTable.style.width = '100%';
      cloneTable.style.maxWidth = '100%';

      var wrapRect = wrap.getBoundingClientRect();
      var h = Math.max(1, Math.ceil(wrapRect.height), Math.ceil(wrap.scrollHeight));

      placeExportCaptureHost(measureHost, contentW, h);
      var captured = await captureExportNodePng(wrap, contentW, h);
      if (captured) return captured;

      measureHost.style.cssText =
        'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;overflow:visible;z-index:-1;';
      return exportMeasuredHtmlToPng(wrap.outerHTML, contentW, h, layoutCss, {
        edgePad: 0,
        measureBuffer: 0,
      });
    } finally {
      if (measureHost.parentNode) measureHost.parentNode.removeChild(measureHost);
    }
  }

  function copyPngDataUrlToClipboard(dataUrl) {
    if (!isValidPngDataUrl(dataUrl) || !api.copyClipboardImage) {
      return Promise.reject(new Error(uiT('unknownError')));
    }
    return api.copyClipboardImage({ dataUrl: dataUrl }).then(function (r) {
      if (r && r.success) {
        showToast(uiT('toastZoomCopiedImage'));
        return true;
      }
      throw new Error((r && r.error) || uiT('unknownError'));
    });
  }

  function findCm6BlockElement(block, kind) {
    if (!block || block.from == null) return null;
    var from = String(block.from);
    var map = {
      image: '.mda-cm-image-block[data-mda-block-from="' + from + '"] .mda-cm-image-frame',
      mermaid: '.mda-cm-mermaid-block[data-mda-block-from="' + from + '"] .mda-cm-mermaid-frame',
      math: '.mda-cm-math-block[data-mda-block-from="' + from + '"]',
      code: '.mda-cm-code-block[data-mda-block-from="' + from + '"] .mda-cm-code-frame',
      table: '.mda-cm-table-block[data-mda-block-from="' + from + '"]',
      hr: '.mda-cm-hr-block[data-mda-block-from="' + from + '"]',
      quote: '.mda-cm-quote-handle-anchor[data-mda-block-from="' + from + '"]',
    };
    var sel = (kind && map[kind]) || '[data-mda-block-from="' + from + '"]';
    return document.querySelector(sel);
  }

  function copyImageBlockToClipboard(block) {
    var from = block && block.from != null ? String(block.from) : '';
    var img =
      (from && document.querySelector('.mda-cm-image-block[data-mda-block-from="' + from + '"] img')) ||
      document.querySelector('.mda-cm-image-frame.mda-cm-media-selected img') ||
      document.querySelector('.mda-cm-image-block .mda-cm-media-selected img');
    var mdHref = imageMdHrefFromBlock(block);
    var imageSrc = (img && img.getAttribute('src')) || '';
    if (!imageSrc && mdHref) {
      imageSrc = resolveImageUrlForEditor(mdHref) || mdHref;
    }
    if (!imageSrc && !img) {
      showToast(uiT('toastNoCopy'));
      return Promise.resolve(false);
    }
    return copyBitmapImageToClipboard(imageSrc, img, mdHref);
  }

  function readCmEditorContentWidth() {
    var host =
      document.querySelector('.mda-cm6-host .cm-content') ||
      document.querySelector('.mda-cm6-host .cm-scroller');
    var w = host ? Math.ceil(host.getBoundingClientRect().width) : 0;
    return Math.max(w, 320);
  }

  function readQuoteExportColors() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      dark: dark,
      bar: readCssVar('--blockquote-bar', dark ? '#484f58' : '#d9dde3'),
      text: readCssVar('--text-muted', dark ? '#8b949e' : '#6a737d'),
      emphasis: readCssVar('--text-emphasis', dark ? '#e6edf3' : '#1b1f23'),
      link: readCssVar('--link', dark ? '#4493f8' : '#0969da'),
      codeBg: dark ? 'rgba(110, 118, 129, 0.28)' : '#eef0f3',
      codeBorder: readCssVar('--border-light', dark ? '#30363d' : '#eaecef'),
      bg: readCssVar('--bg', dark ? '#1e1e1e' : '#ffffff'),
    };
  }

  function quoteExportLayoutCss(colors) {
    return (
      '.mda-export-quote{box-sizing:border-box;display:block;width:100%;max-width:100%;vertical-align:top;background:' +
      colors.bg +
      ';overflow:visible;border:none;outline:none;}' +
      '.mda-export-quote-line{box-sizing:border-box;display:block;margin:0;padding:0 0 0 12px;border:none;border-left:3px solid ' +
      colors.bar +
      ';border-top:none;border-right:none;border-bottom:none;outline:none;box-shadow:none;background:transparent;color:' +
      colors.text +
      ';font-family:"Segoe UI","Microsoft YaHei",sans-serif;font-size:16px;line-height:26px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;}' +
      '.mda-export-quote .mda-cm-code{background:' +
      colors.codeBg +
      ';border:1px solid ' +
      colors.codeBorder +
      ';border-radius:4px;padding:1px 5px;font-size:0.9em;font-family:"Cascadia Code",Consolas,"Courier New",monospace;font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0;box-sizing:border-box;color:' +
      colors.emphasis +
      ';}' +
      '.mda-export-quote .mda-cm-strong{font-weight:normal;}' +
      '.mda-export-quote .mda-cm-link{text-decoration:none;}' +
      '.mda-export-quote .mda-cm-em{font-style:italic;}' +
      '.mda-export-quote .mda-cm-strike{text-decoration:line-through;opacity:0.85;}'
    );
  }

  function collectCmEditorLinesInRange(view, from, to) {
    var lines = [];
    if (!view || from == null || to == null) return lines;
    var doc = view.state.doc;
    var len = doc.length;
    if (len <= 0) return lines;
    var pos = Math.max(0, Math.min(from, len - 1));
    var end = Math.max(pos, Math.min(to, len));
    var guard = 0;
    while (pos < end || (pos === from && from === to)) {
      if (++guard > 500) break;
      var lineEl = null;
      try {
        var at = view.domAtPos(pos);
        var node = at && at.node;
        if (node) {
          lineEl =
            node.nodeType === 1
              ? node.closest('.cm-line')
              : node.parentElement && node.parentElement.closest('.cm-line');
        }
      } catch (_) {
        lineEl = null;
      }
      if (lineEl && lines.indexOf(lineEl) < 0) lines.push(lineEl);
      var next = pos + 1;
      try {
        var lb = view.lineBlockAt(pos);
        next = lb.to > pos ? lb.to : pos + 1;
      } catch (_) {
        next = pos + 1;
      }
      if (next <= pos) break;
      pos = next;
      if (pos >= end) break;
    }
    return lines;
  }

  function cloneQuoteLineForExport(lineEl) {
    var clone = lineEl.cloneNode(true);
    clone
      .querySelectorAll(
        '.mda-cm-quote-handle-anchor,.mda-cm-block-drag-handle,.mda-cm-hide-mark,.cm-widget,.cm-widgetBuffer,.mda-cm-tight-sel-layer,.cm-selectionBackground'
      )
      .forEach(function (n) {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
    clone.className = 'mda-export-quote-line';
    return clone;
  }

  function syncQuoteExportInlineStyles(liveLine, cloneLine) {
    var pairs = [
      ['.mda-cm-code', ['backgroundColor', 'color', 'borderRadius', 'borderColor', 'borderWidth', 'borderStyle', 'padding', 'fontSize', 'fontFamily']],
      ['.mda-cm-strong', ['color', 'textShadow']],
      ['.mda-cm-link', ['color']],
      ['.mda-cm-em', ['fontStyle']],
    ];
    for (var p = 0; p < pairs.length; p++) {
      var sel = pairs[p][0];
      var props = pairs[p][1];
      var liveNodes = liveLine.querySelectorAll(sel);
      var cloneNodes = cloneLine.querySelectorAll(sel);
      for (var i = 0; i < cloneNodes.length; i++) {
        var live = liveNodes[i];
        if (!live) continue;
        var cs = getComputedStyle(live);
        for (var j = 0; j < props.length; j++) {
          var prop = props[j];
          var val = cs[prop];
          if (val) cloneNodes[i].style[prop] = val;
        }
      }
    }
  }

  function measureLiveQuoteBlockBounds(liveLines) {
    var minLeft = Infinity;
    var maxRight = -Infinity;
    var minTop = Infinity;
    var maxBottom = -Infinity;
    for (var i = 0; i < liveLines.length; i++) {
      var r = liveLines[i].getBoundingClientRect();
      minLeft = Math.min(minLeft, r.left);
      maxRight = Math.max(maxRight, r.right);
      minTop = Math.min(minTop, r.top);
      maxBottom = Math.max(maxBottom, r.bottom);
    }
    if (!(maxRight > minLeft) || !(maxBottom > minTop)) {
      return { width: 0, height: 0 };
    }
    return {
      width: Math.ceil(maxRight - minLeft),
      height: Math.ceil(maxBottom - minTop),
    };
  }

  function buildQuoteExportDom(block) {
    if (!isCm6Ready() || !cm6Editor.view) return null;
    var view = cm6Editor.view;
    var range = null;
    if (block.from != null && block.to != null) {
      range = { from: block.from, to: block.to };
    } else if (window.MDAEditor && window.MDAEditor.resolveBlockRange) {
      range = window.MDAEditor.resolveBlockRange(view, block);
    }
    if (!range) return null;
    var liveLines = collectCmEditorLinesInRange(view, range.from, range.to);
    if (!liveLines.length) return null;
    var wrap = document.createElement('div');
    wrap.className = 'mda-export-quote';
    for (var i = 0; i < liveLines.length; i++) {
      var clone = cloneQuoteLineForExport(liveLines[i]);
      syncQuoteExportInlineStyles(liveLines[i], clone);
      wrap.appendChild(clone);
    }
    return { root: wrap, liveLines: liveLines };
  }

  function readHrExportColors() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      border: readCssVar('--border', dark ? '#30363d' : '#d0d7de'),
      bg: readCssVar('--bg', dark ? '#1e1e1e' : '#ffffff'),
    };
  }

  function hrBlockExportLayoutCss(colors) {
    return (
      '.mda-export-hr-wrap{box-sizing:border-box;width:100%;padding:16px 0;background:' +
      colors.bg +
      ';overflow:visible;}' +
      '.mda-export-hr-line{display:block;width:100%;height:0;border:none;border-top:1px solid ' +
      colors.border +
      ';margin:0;}'
    );
  }

  function buildHrBlockExportHtml() {
    return '<div class="mda-export-hr-wrap"><hr class="mda-export-hr-line" aria-hidden="true" /></div>';
  }

  function measureExportContentLineWidth(root, columnWidth) {
    if (!root) return 0;
    root.style.boxSizing = 'border-box';
    root.style.width = columnWidth + 'px';
    root.style.maxWidth = columnWidth + 'px';
    var maxLineW = 0;
    var blocks = root.querySelectorAll('.mda-export-quote-line, blockquote, p, li, h1, h2, h3, h4, h5, h6');
    var targets = blocks.length ? blocks : [root];
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      try {
        var range = document.createRange();
        range.selectNodeContents(el);
        var rects = range.getClientRects();
        for (var j = 0; j < rects.length; j++) {
          if (rects[j].width > 0) maxLineW = Math.max(maxLineW, rects[j].width);
        }
      } catch (_) {
        var rect = el.getBoundingClientRect();
        if (rect.width > 0) maxLineW = Math.max(maxLineW, rect.width);
      }
    }
    if (!(maxLineW > 0)) {
      maxLineW = Math.max(root.scrollWidth, root.getBoundingClientRect().width);
    }
    return Math.ceil(maxLineW);
  }

  async function exportQuoteBlockToPng(block) {
    if (!isCm6Ready() || !cm6Editor.view) throw new Error(uiT('unknownError'));
    var view = cm6Editor.view;
    var range = null;
    if (block.from != null && block.to != null) {
      range = { from: block.from, to: block.to };
    } else if (window.MDAEditor && window.MDAEditor.resolveBlockRange) {
      range = window.MDAEditor.resolveBlockRange(view, block);
    }
    if (!range) throw new Error(uiT('unknownError'));
    var liveLines = collectCmEditorLinesInRange(view, range.from, range.to);
    if (!liveLines.length) throw new Error(uiT('unknownError'));

    liveLines[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return withEditorExportCapture(async function () {
      var capRect = unionQuoteLinesCaptureRect(liveLines);
      if (capRect) {
        var liveCaptured = await capturePageRegion(capRect);
        if (liveCaptured) return liveCaptured;
      }

      var built = buildQuoteExportDom(block);
      if (!built || !built.root || !built.liveLines.length) throw new Error(uiT('unknownError'));
      var colors = readQuoteExportColors();
      var layoutCss = quoteExportLayoutCss(colors);
      var columnW = quoteExportColumnWidth(liveLines);

      var measureHost = document.createElement('div');
      measureHost.setAttribute('aria-hidden', 'true');
      measureHost.style.cssText =
        'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;overflow:visible;z-index:-1;';
      var styleEl = document.createElement('style');
      styleEl.textContent = layoutCss;
      measureHost.appendChild(styleEl);
      measureHost.appendChild(built.root);
      document.body.appendChild(measureHost);
      try {
        var root = built.root;
        root.style.margin = '0';
        root.style.border = 'none';
        root.style.outline = 'none';
        root.style.boxShadow = 'none';
        root.style.background = colors.bg;
        var w = columnW;
        root.style.display = 'block';
        root.style.width = w + 'px';
        root.style.maxWidth = w + 'px';
        built.root.querySelectorAll('.mda-export-quote-line').forEach(function (lineEl) {
          lineEl.style.width = '100%';
          lineEl.style.boxSizing = 'border-box';
          lineEl.style.outline = 'none';
          lineEl.style.boxShadow = 'none';
        });
        var h = Math.max(
          26,
          Math.ceil(root.scrollHeight),
          Math.ceil(root.getBoundingClientRect().height)
        );
        return exportMeasuredHtmlToPng(root.outerHTML, w, h, layoutCss, {
          edgePad: 0,
          measureBuffer: 0,
        });
      } finally {
        if (measureHost.parentNode) measureHost.parentNode.removeChild(measureHost);
      }
    });
  }

  async function exportHrBlockToPng(blockEl) {
    if (!blockEl) throw new Error(uiT('unknownError'));
    var colors = readHrExportColors();
    var layoutCss = hrBlockExportLayoutCss(colors);
    var html = buildHrBlockExportHtml();
    var w = Math.max(240, Math.min(readCmEditorContentWidth(), Math.ceil(blockEl.getBoundingClientRect().width)));
    var h = 33;
    return exportMeasuredHtmlToPng(html, w, h, layoutCss, { edgePad: 0, measureBuffer: 0 });
  }

  function copyCm6BlockAsImage(block, kind) {
    if (!block) {
      showToast(uiT('toastNoCopy'));
      return;
    }
    if (kind === 'image') {
      copyImageBlockToClipboard(block);
      return;
    }
    if (kind === 'mermaid') {
      var mFrame = findCm6BlockElement(block, 'mermaid');
      var stage = mFrame && mFrame.querySelector('.mda-cm-mermaid-stage');
      if (!stage) {
        showToast(uiT('toastNoCopy'));
        return;
      }
      var mSvg = stage.querySelector('svg');
      if (!mSvg) {
        showToast(uiT('toastNoCopy'));
        return;
      }
      copyMermaidSvgAsImage(mSvg);
      return;
    }
    if (kind === 'math') {
      var mathRoot = findCm6BlockElement(block, 'math');
      if (!mathRoot) {
        showToast(uiT('toastNoCopy'));
        return;
      }
      var katexEl = mathRoot.querySelector('.katex-display') || mathRoot.querySelector('.katex');
      if (!katexEl) {
        showToast(uiT('toastNoCopy'));
        return;
      }
      katexElToPngDataUrl(katexEl)
        .then(function (png) {
          var dataUrl = png && typeof png === 'object' ? png.dataUrl : png;
          return copyPngDataUrlToClipboard(dataUrl);
        })
        .catch(function (e) {
          uiAlert(uiT('alertZoomCopyFail', { error: e && e.message ? e.message : String(e) }));
        });
      return;
    }
    if (kind === 'quote') {
      exportQuoteBlockToPng(block)
        .then(function (dataUrl) {
          return copyPngDataUrlToClipboard(dataUrl);
        })
        .catch(function (e) {
          uiAlert(uiT('alertZoomCopyFail', { error: e && e.message ? e.message : String(e) }));
        });
      return;
    }
    if (kind === 'hr') {
      var hrRoot = findCm6BlockElement(block, 'hr');
      if (!hrRoot) {
        showToast(uiT('toastNoCopy'));
        return;
      }
      exportHrBlockToPng(hrRoot)
        .then(function (dataUrl) {
          return copyPngDataUrlToClipboard(dataUrl);
        })
        .catch(function (e) {
          uiAlert(uiT('alertZoomCopyFail', { error: e && e.message ? e.message : String(e) }));
        });
      return;
    }
    var el = findCm6BlockElement(block, kind);
    if (!el) {
      showToast(uiT('toastNoCopy'));
      return;
    }
    var exportFn =
      kind === 'code'
        ? exportCodeBlockToPng
        : kind === 'table'
          ? exportTableBlockToPng
          : exportBlockFrameToPng;
    exportFn(el)
      .then(function (dataUrl) {
        return copyPngDataUrlToClipboard(dataUrl);
      })
      .catch(function (e) {
        uiAlert(uiT('alertZoomCopyFail', { error: e && e.message ? e.message : String(e) }));
      });
  }

  /** 深色全屏预览：去掉 SVG 内近白铺底，避免浅色字落在白底上发灰发糊。 */
  function neutralizeZoomSvgBg(svg) {
    if (!svg) return;
    var vw = 0, vh = 0;
    if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) {
      vw = svg.viewBox.baseVal.width;
      vh = svg.viewBox.baseVal.height;
    }
    var rects = svg.querySelectorAll('rect');
    var limit = Math.min(rects.length, 12);
    for (var i = 0; i < limit; i++) {
      var r = rects[i];
      var fill = r.getAttribute('fill') || (r.style && r.style.fill) || '';
      if (!fill || fill === 'none' || fill === 'transparent') continue;
      var rgb = parseCssColor(fill);
      if (!rgb || relativeLuminance(rgb.r, rgb.g, rgb.b) < 0.82) continue;
      var rw = parseFloat(r.getAttribute('width'));
      var rh = parseFloat(r.getAttribute('height'));
      if (!isFinite(rw) || !isFinite(rh)) continue;
      // 接近整图的铺底 rect（Mermaid 部分图型会画一块浅底）
      if (vw && vh && rw >= vw * 0.85 && rh >= vh * 0.85) {
        r.setAttribute('fill', '#1e1e1e');
        if (r.style) r.style.fill = '#1e1e1e';
      }
    }
  }

  function openZoom(node, opts) {
    opts = opts || {};
    if (opts.kind === 'mermaid' && node) opts.svgNode = node;
    var ov = document.createElement('div');
    ov.className = 'mda-zoom';
    var stage = document.createElement('div');
    stage.className = 'mda-zoom-stage';
    stage.appendChild(node);
    var bar = document.createElement('div');
    bar.className = 'mda-zoom-bar';
    var copyBtns = opts.kind === 'mermaid'
      ? '<button data-z="copy-img" title="' + uiT('zoomCopyImage') + '">' + uiT('zoomCopyImage') + '</button>' +
        '<button data-z="copy-src" title="' + uiT('zoomCopySource') + '">' + uiT('zoomCopySource') + '</button>'
      : '<button data-z="copy" title="' + uiT('zoomCopy') + '">' + uiT('copyBtn') + '</button>';
    bar.innerHTML = copyBtns +
      '<button data-z="in" title="' + uiT('zoomIn') + '">+</button>' +
      '<button data-z="out" title="' + uiT('zoomOut') + '">\u2212</button>' +
      '<button data-z="reset" title="' + uiT('zoomReset') + '">\u21ba</button>' +
      '<button data-z="close" title="' + uiT('zoomClose') + '">\u2715</button>';
    ov.appendChild(bar);
    ov.appendChild(stage);
    document.body.appendChild(ov);

    var MIN_SCALE = 0.3, MAX_SCALE = 8;
    var scale = 1, tx = 0, ty = 0;
    // SVG：用改 width/height 缩放（矢量重排），避免 transform:scale 在部分 GPU 路径上栅格化发糊
    var isSvgZoom = !!(node && node.tagName && String(node.tagName).toLowerCase() === 'svg');
    var baseW = 0, baseH = 0;
    if (isSvgZoom) {
      node.classList.add('mda-zoom-svg-fit');
      node.removeAttribute('width');
      node.removeAttribute('height');
      node.style.maxWidth = 'none';
      node.style.maxHeight = 'none';
      // 深色：浅色字必须配深色底；顺带改掉 Mermaid 画在 SVG 内的近白铺底 rect
      if (isDark()) {
        ov.classList.add('mda-zoom-dark');
        node.style.background = '#1e1e1e';
        neutralizeZoomSvgBg(node);
        // 克隆后再次统一 Timeline 连接线（覆盖 SVG 内嵌 section 色）
        tuneTimelineConnectors(node);
        tuneDarkStrokes(node);
      }
    }

    function measureSvgBase() {
      if (!isSvgZoom || baseW > 0) return;
      var vw = 0, vh = 0;
      if (node.viewBox && node.viewBox.baseVal && node.viewBox.baseVal.width) {
        vw = node.viewBox.baseVal.width;
        vh = node.viewBox.baseVal.height;
      }
      if (!vw || !vh) {
        try {
          var box = node.getBBox();
          if (box && box.width && box.height) { vw = box.width; vh = box.height; }
        } catch (e) { /* 未布局 */ }
      }
      if (vw && vh) {
        // 默认约 72% 视口，避免一打开就铺满显得过大
        var fit = Math.min((window.innerWidth * 0.50) / vw, (window.innerHeight * 0.50) / vh);
        baseW = vw * fit;
        baseH = vh * fit;
        return;
      }
      var rect = node.getBoundingClientRect();
      baseW = rect.width || node.clientWidth || 0;
      baseH = rect.height || node.clientHeight || 0;
    }

    // 平移边界：保证内容中心始终留在视口内，避免被拖到不可见区域
    function clampPan() {
      var maxX = window.innerWidth / 2;
      var maxY = window.innerHeight / 2;
      tx = Math.max(-maxX, Math.min(maxX, tx));
      ty = Math.max(-maxY, Math.min(maxY, ty));
    }
    function apply() {
      clampPan();
      measureSvgBase();
      if (isSvgZoom && baseW > 0 && baseH > 0) {
        node.style.width = (baseW * scale) + 'px';
        node.style.height = (baseH * scale) + 'px';
        // SVG 路径：平移用 left/top，舞台不加任何 transform（含 translate 也可能促栅格化糊字）
        stage.style.transform = 'none';
        stage.style.left = tx + 'px';
        stage.style.top = ty + 'px';
      } else {
        stage.style.left = '';
        stage.style.top = '';
        stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      }
    }
    function zoom(factor) { scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor)); apply(); }
    function reset() { scale = 1; tx = 0; ty = 0; apply(); }

    // 首帧测尺寸后再 apply，保证 1× 已按视口适配
    requestAnimationFrame(function () {
      measureSvgBase();
      apply();
    });

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
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        copyZoomContent(opts);
      }
    }
    document.addEventListener('keydown', onKey);

    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    // 仅在内容本身双击才复位（避免连点 +/- 按钮误触发复位）
    stage.addEventListener('dblclick', function (e) { e.stopPropagation(); reset(); });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      var z = b.getAttribute('data-z');
      if (z === 'copy' || z === 'copy-img') copyZoomContent(opts, 'image');
      else if (z === 'copy-src') copyZoomContent(opts, 'source');
      else if (z === 'in') zoom(1.2);
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

  function saveFile(onSuccess, opts) {
    opts = opts || {};
    if (docState === 'welcome') return;
    if (!currentFilePath) {
      if (opts.quiet) return; // 自动保存不对未命名文档弹另存为
      saveAs(onSuccess);
      return;
    }
    if (!dirty) {
      if (typeof onSuccess === 'function') onSuccess();
      return;
    }
    writeToPath(currentFilePath, onSuccess, opts);
  }

  function autosaveModeLabel(mode) {
    if (mode === 'blur') return uiT('autosaveModeBlur');
    if (mode === 'interval:30') return uiT('autosaveModeInterval30');
    if (mode === 'interval:60') return uiT('autosaveModeInterval60');
    return uiT('autosaveModeOff');
  }

  function clearAutosaveTimer() {
    if (autosaveTimer) {
      clearInterval(autosaveTimer);
      autosaveTimer = null;
    }
  }

  function tryAutosave() {
    if (autosaveSaving) return;
    if (autosavePref === 'off') return;
    if (docState !== 'open' || !currentFilePath || !dirty || !editorEl) return;
    autosaveSaving = true;
    writeToPath(currentFilePath, function () { autosaveSaving = false; }, { quiet: true });
  }

  function restartAutosaveTimer() {
    clearAutosaveTimer();
    var sec = 0;
    if (autosavePref === 'interval:30') sec = 30;
    else if (autosavePref === 'interval:60') sec = 60;
    if (sec > 0) {
      autosaveTimer = setInterval(tryAutosave, sec * 1000);
    }
  }

  function applyAutosavePref(mode, opts) {
    opts = opts || {};
    var next = String(mode || 'off');
    if (['off', 'blur', 'interval:30', 'interval:60'].indexOf(next) < 0) next = 'off';
    autosavePref = next;
    try { localStorage.setItem('mda-autosave', next); } catch (e) { /* ignore */ }
    restartAutosaveTimer();
    if (opts.persist && api.setAutosavePref) api.setAutosavePref(next);
    if (opts.toast) showToast(uiT('toastAutosaveOn', { mode: autosaveModeLabel(next) }));
  }

  function initAutosave() {
    var stored = 'off';
    try { stored = localStorage.getItem('mda-autosave') || 'off'; } catch (e) { /* ignore */ }
    applyAutosavePref(stored, { persist: true, toast: false });
    if (editorEl && !editorEl.dataset.autosaveBlurBound) {
      editorEl.dataset.autosaveBlurBound = '1';
      editorEl.addEventListener('blur', function () {
        if (autosavePref === 'blur') tryAutosave();
      });
    }
    bindCm6AutosaveBlur();
  }

  function bindCm6AutosaveBlur() {
    if (!isCm6Ready() || !cm6Editor || !cm6Editor.view) return;
    var dom = cm6Editor.view.dom;
    if (!dom || dom.dataset.autosaveBlurBound) return;
    dom.dataset.autosaveBlurBound = '1';
    // focusout：块内 widget 互点不触发；离开编辑器才失焦保存
    dom.addEventListener('focusout', function (e) {
      if (autosavePref !== 'blur') return;
      var related = e.relatedTarget;
      if (related && dom.contains(related)) return;
      tryAutosave();
    });
  }

  function clearCloseTimers() {
    clearAutosaveTimer();
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    if (outlineScrollRaf) {
      cancelAnimationFrame(outlineScrollRaf);
      outlineScrollRaf = null;
    }
  }

  function handleAppCloseRequest() {
    if (document.getElementById('settings-dialog')) return;
    if (!dirty) {
      clearCloseTimers();
      api.confirmClose();
      return;
    }
    if (closePromptOpen) return;
    closePromptOpen = true;
    uiCloseConfirm().then(function (choice) {
      closePromptOpen = false;
      if (choice === 'cancel') return;
      if (choice === 'discard') {
        clearCloseTimers();
        api.confirmClose();
        return;
      }
      saveFile(function () {
        clearCloseTimers();
        api.confirmClose();
      });
    });
  }

  function guardDiscard() {
    if (!dirty) return Promise.resolve(true);
    return uiConfirm(uiT('alertDiscardDirty'));
  }

  function requestOpen(filePath) {
    allowAddRecent = true;
    guardDiscard().then(function (yes) {
      // 仅切换到不同文件时回到文档开头；同文件重载（如 Ctrl+R）保留滚动位置
      if (yes) openFile(filePath, { scrollToTop: filePath !== currentFilePath });
    });
  }

  function updateToolbar() {
    if (tbFilesBtn) {
      var filesReady = !!(workspaceRoot && leftRailEl && !leftRailEl.classList.contains('hidden') && fileSidebar);
      tbFilesBtn.disabled = !filesReady;
      // active = 侧栏展开（与编辑/批注一致：亮起表示该区可见）
      tbFilesBtn.classList.toggle('active', filesReady && fileSidebar && !fileSidebar.isCollapsed());
    }
    if (tbEditBtn) {
      tbEditBtn.classList.toggle('active', editorVisible);
      tbEditBtn.disabled = docState === 'welcome';
    }
    if (tbPanelBtn) tbPanelBtn.classList.toggle('active', panelVisible);
    if (tbFileNameEl) {
      var name = '';
      if (docState === 'untitled') name = uiT('untitled');
      else if (currentFilePath) name = currentFilePath.replace(/\\/g, '/').split('/').pop();
      tbFileNameEl.setAttribute('data-filename', name || '');
      tbFileNameEl.title = name ? uiT('filenameCopyHint', { name: name }) : '';
      tbFileNameEl.innerHTML = name ? (escHtml(name) + (dirty ? '<span class="dirty-dot">●</span>' : '')) : '';
    }
    if (addBtn) addBtn.disabled = docState !== 'open' || !currentFilePath;
    if (clearAllBtn) {
      clearAllBtn.disabled = docState !== 'open' || !currentFilePath || !annotations.length;
    }
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
      else uiAlert(uiT('alertMdOnly'));
    });
  }

  // ---- 预览区链接 ----
  function handleLinkClick(href) {
    if (!href) return;
    if (href.charAt(0) === '#') return;
    if (/^(https?:|mailto:|file:)/i.test(href)) { api.openExternal(href); return; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return;
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
    var item = annoListEl ? annoListEl.querySelector('[data-anno-id="' + id + '"]') : null;
    if (item) item.scrollIntoView({ block: 'nearest' });
    if (!scrollPreview) return;
    locateAnnotationViews(id);
  }

  /**
   * 将预览 + 编辑定位到批注所属段落。
   * 不走 attach 内 withSyncLock 串行（避免第二次被排队延迟/冲掉）；
   * 布局未稳时多试几次（开编辑栏 / 图片高度）。
   */
  function locateAnnotationViews(id) {
    var anno = findAnno(id);
    var p = findParagraphByAnnotationId(id);
    if (!anno && !p) return;

    var needOpenEditor = !editorVisible;
    if (needOpenEditor) showEditorPane(true);

    var tries = 0;
    var maxTries = needOpenEditor ? 4 : 3;

    function scrollOnce() {
      tries++;
      if (anno && anno.anchor && selAnchor && selAnchor.validateAnchor(getSourceText(), anno.anchor)) {
        var domRange = selAnchor.anchorToPreviewRange(previewEl, getSourceText(), anno.anchor);
        if (domRange) scrollPreviewToRange(domRange);
        if (editorVisible || needOpenEditor) {
          if (!editorVisible) showEditorPane(true);
          selAnchor.scrollEditorToAnchor(editorEl, anno.anchor, syncEditorScrollLayers);
        }
        return;
      }

      var previewLine = p ? p.startLine : (anno && anno.line);
      // 面板展示的是批注行 a.line；跳到段落 startLine 会在「批注紧贴正文」时刚好多 1 行
      var editorLine = (anno && anno.line) ? anno.line : previewLine;
      if (!previewLine && !editorLine) return;

      cursorLine = previewLine || editorLine || null;

      // 直接几何定位预览，强制滚入（onlyIfNeeded:false），避开 sync 锁与「已可见」误判
      if (previewLine && previewScrollEl && previewEl && window.MDASyncScroll) {
        var map = window.MDASyncScroll.buildBlockMap(previewEl);
        if (syncScrollCtrl && syncScrollCtrl.refreshMap) syncScrollCtrl.refreshMap();
        window.MDASyncScroll.scrollPreviewToLine(previewScrollEl, previewLine, map, { onlyIfNeeded: false });
        var entry = null;
        for (var i = 0; i < map.length; i++) {
          if (map[i].line <= previewLine) entry = map[i];
          else break;
        }
        if (entry && entry.el) highlightCursorBlock(entry.el);
        updateOutlineActiveFromLine(previewLine, { skipScroll: true });
      }

      if (editorLine) {
        if (syncScrollCtrl) {
          syncScrollCtrl.scrollEditorToLine(editorLine, { skipPreview: true });
        } else {
          jumpEditorToLine(editorLine);
        }
      }
    }

    scrollOnce();
    requestAnimationFrame(function () {
      scrollOnce();
      if (tries < maxTries) {
        setTimeout(function () {
          scrollOnce();
          if (tries < maxTries) setTimeout(scrollOnce, 120);
        }, 50);
      }
    });
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
        previewTop: previewScrollEl ? previewScrollEl.scrollTop : 0,
        selStart: editorEl.selectionStart,
        selEnd: editorEl.selectionEnd,
      };
    }
    var result = await api.readFile(filePath);
    if (!result.success) { uiAlert(uiT('alertOpenFail', { error: result.error })); return; }
    currentFilePath = filePath;
    setDocState('open');
    setEditorTextValue(result.content, {
      resetHistory: true,
      selectionStart: scrollToTop ? 0 : (savedScroll ? savedScroll.selStart : undefined),
      selectionEnd: scrollToTop ? 0 : (savedScroll ? savedScroll.selEnd : undefined),
    });
    currentText = isCm6Ready() ? getEditorTextValue() : result.content;
    setDirtyState(false);
    // CM6：默认预览模式；2.0：展开左侧源码栏
    if (shouldAutoOpenEditor() && !editorVisible) {
      if (isCm6Enabled() && cm6Editor) {
        cm6Editor.setMode(window.MDAEditor.MODE_PREVIEW || 'preview');
        focusActiveEditor();
      } else {
        showEditorPane(true);
      }
    } else if (editorVisible && !isCm6Enabled()) refreshEditorDecorations();
    setTitle(filePath);
    parseAndRender(result.content, filePath, { selectAnnoId: opts.selectAnnoId || null });
    if (isCm6Ready()) {
      requestAnimationFrame(function () {
        refreshCm6Decorations();
        requestAnimationFrame(refreshCm6Decorations);
      });
    }
    updateToolbar();
    if (api.addRecentFile && allowAddRecent) {
      api.addRecentFile(filePath).then(function () { refreshWelcomeRecents(); });
    }
    if (fileSidebar) fileSidebar.setActive(filePath);
    if (scrollToTop) {
      resetScrollTop();
      requestAnimationFrame(resetScrollTop);
    } else if (savedScroll && !isCm6Enabled()) {
      editorEl.scrollTop = savedScroll.editorTop;
      editorEl.scrollLeft = savedScroll.editorLeft;
      if (srcGutterEl) srcGutterEl.scrollTop = savedScroll.gutterTop;
      if (srcHighlightEl) {
        var hp = srcHighlightEl.parentNode;
        hp.scrollTop = savedScroll.editorTop;
        hp.scrollLeft = savedScroll.editorLeft;
      }
      if (previewScrollEl) previewScrollEl.scrollTop = savedScroll.previewTop;
    } else if (savedScroll && previewScrollEl) {
      previewScrollEl.scrollTop = savedScroll.previewTop;
    }
  }

  // 编辑区（textarea/高亮层/行号槽）与预览区滚动位置归零
  function resetScrollTop() {
    if (editorEl) { editorEl.scrollTop = 0; editorEl.scrollLeft = 0; }
    if (srcHighlightEl) { var hp = srcHighlightEl.parentNode; hp.scrollTop = 0; hp.scrollLeft = 0; }
    if (srcGutterEl) srcGutterEl.scrollTop = 0;
    if (previewScrollEl) previewScrollEl.scrollTop = 0;
  }

  function setTitle(filePath) {
    if (docState === 'untitled') {
      api.setTitle('MDA - ' + uiT('untitled'));
    } else if (filePath) {
      var name = filePath.replace(/\\/g, '/').split('/').pop();
      api.setTitle('MDA - ' + name);
    } else if (docState === 'welcome') {
      api.setTitle('MDA');
    } else {
      api.setTitle('MDA');
    }
  }

  function reloadFile(opts) {
    opts = opts || {};
    if (currentFilePath) openFile(currentFilePath, { scrollToTop: false, selectAnnoId: opts.selectAnnoId || null });
  }

  function parseAndRender(text, filePath, opts) {
    opts = opts || {};
    var parsed = api.parseAnnotations(text);
    annotations = parsed.annotations;
    paragraphs = parsed.paragraphs;
    for (var i = 0; i < annotations.length; i++) {
      annotations[i].file = filePath || currentFilePath;
    }
    buildTagFilters();
    updateOutline(text);
    if (!isCm6Ready() || opts.forceHtmlPreview) {
      renderMarkdownContent(text, opts);
    }
    renderPanel();
  }

  // ---- Markdown 渲染 ----
  function renderMarkdownContent(text, opts) {
    opts = opts || {};
    var liveEdit = !!opts.liveEdit;
    var myGen = opts.liveEditGen || 0;
    var selectAnnoId = opts.selectAnnoId || null;
    var skipOutlineSync = !!opts.skipOutlineSync;
    var onReady = typeof opts.onReady === 'function' ? opts.onReady : null;
    var savedScroll = opts.preserveScroll
      ? (opts.savedScroll || captureViewScroll())
      : null;
    var result = api.renderMarkdown(text);
    if (!result.success) {
      previewEl.innerHTML = '<p style="color:var(--danger)">' + escHtml(uiT('alertRenderError', { error: result.error })) + '</p>';
      updateToolbar();
      if (liveEdit) unfreezeEditorScroll();
      if (onReady) onReady(false);
      return;
    }
    htmlContent = result.html;
    previewEl.innerHTML = htmlContent;

    resolveImages();       // 相对/本地图片 → 绝对 file:// URL
    setupImageFallback();
    updateToolbar();
    // 清空预览 DOM 后立刻钉回滚动，避免中间帧视口跳到顶部
    if (savedScroll) restoreViewScroll(savedScroll);
    renderMermaidBlocks().then(function () {
      // 过期的实时重渲：勿解冻/勿改滚动（已被更新一代接管）
      if (liveEdit && myGen !== liveEditGen) return;
      enhanceCodeBlocks();
      decorateParagraphs();
      wrapPreviewTables();
      if (savedScroll) {
        restoreViewScroll(savedScroll);
        requestAnimationFrame(function () {
          if (liveEdit && myGen !== liveEditGen) return;
          restoreViewScroll(savedScroll);
          if (liveEdit) unfreezeEditorScroll();
        });
        if (syncScrollCtrl) syncScrollCtrl.refreshMap();
      } else if (syncScrollCtrl) {
        syncScrollCtrl.refreshMap();
        if (liveEdit) unfreezeEditorScroll();
      } else if (liveEdit) {
        unfreezeEditorScroll();
      }
      if (findMatchState && findMatchState.query) {
        updateFindPreviewHighlights({ skipScroll: liveEdit });
      }
      applyAnchorHighlights();
      updateToolbar();
      if (onReady) onReady(true);
      requestAnimationFrame(function () {
        if (liveEdit && myGen !== liveEditGen) return;
        if (!skipOutlineSync) {
          if (liveEdit) {
            var caretLine = 1;
            if (window.MDASyncScroll && editorEl) {
              caretLine = window.MDASyncScroll.lineAtCaret(editorEl);
            }
            updateOutlineActiveFromLine(caretLine, { skipScroll: true });
          } else {
            updateOutlineActiveFromScroll();
          }
        }
        // 新建/编辑批注后：预览 DOM 与色条就绪再选中定位
        if (selectAnnoId) {
          if (!panelVisible) {
            applyPanelVisible(true);
            savePanelVisiblePref(true);
          }
          selectAnnotation(selectAnnoId, true);
        }
      });
    }).catch(function () {
      if (liveEdit && myGen === liveEditGen) unfreezeEditorScroll();
      if (onReady) onReady(false);
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
    if (isValidPngDataUrl(png)) return png;
    var svg = liveHolder.querySelector('svg');
    if (svg) {
      try {
        var fromSvg = await mermaidSvgToPngDataUrl(svg);
        var dw = parseInt(liveHolder.getAttribute('data-mda-display-width') || '', 10);
        if (!(dw > 0)) dw = renderedWidthPx(liveHolder);
        if (dw > 0 && isValidPngDataUrl(fromSvg)) {
          fromSvg = await scalePngDataUrlToWidth(fromSvg, dw);
        }
        if (isValidPngDataUrl(fromSvg)) return fromSvg;
      } catch (e) { /* fallback */ }
    }
    throw new Error('diagram export failed');
  }

  function renderedWidthPx(el) {
    if (!el || !el.getBoundingClientRect) return 0;
    var rect = el.getBoundingClientRect();
    return rect && rect.width > 0 ? Math.round(rect.width) : 0;
  }

  function scalePngDataUrlToWidth(dataUrl, targetW) {
    return new Promise(function (resolve) {
      var tw = Math.round(targetW);
      if (!(tw > 0) || !dataUrl) { resolve(dataUrl); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var nw = img.naturalWidth || img.width || 0;
          var nh = img.naturalHeight || img.height || 0;
          if (!nw || !nh) { resolve(dataUrl); return; }
          var th = Math.max(1, Math.round(nh * tw / nw));
          var c = document.createElement('canvas');
          c.width = tw;
          c.height = th;
          c.getContext('2d').drawImage(img, 0, 0, tw, th);
          resolve(c.toDataURL('image/png'));
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  /** 收集顶层 KaTeX 节点（块级 .katex-display 或非其内的 .katex） */
  function listTopKatexNodes(root) {
    var out = [];
    if (!root) return out;
    var all = root.querySelectorAll('.katex-display, .katex');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.classList.contains('katex-display')) out.push(el);
      else if (el.classList.contains('katex') && !el.closest('.katex-display')) out.push(el);
    }
    return out;
  }

  function katexAnnotationTeX(el) {
    if (!el) return '';
    var ann = el.querySelector('annotation[encoding="application/x-tex"]');
    return ann && ann.textContent ? String(ann.textContent).trim() : '';
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
  }

  var katexExportCssPromise = null;

  /** 将 katex.min.css 中的 fonts/ 引用内联为 data URL，供离屏 SVG foreignObject 使用（不挂 DOM、不闪屏）。 */
  function loadKatexCssForExport() {
    if (katexExportCssPromise) return katexExportCssPromise;
    katexExportCssPromise = (async function () {
      var css = await fetch('./katex.min.css').then(function (r) {
        if (!r.ok) throw new Error('katex.css ' + r.status);
        return r.text();
      });
      // Chromium 支持 woff2；去掉 woff/ttf 备用源，避免每个公式 PNG 重复内联三套字体。
      if (window.MDAKatexExport && window.MDAKatexExport.preferWoff2Sources) {
        css = window.MDAKatexExport.preferWoff2Sources(css);
      }
      var re = /url\((['"]?)([^)'"]+)\1\)/g;
      var found = {};
      var m;
      while ((m = re.exec(css))) {
        var url = m[2];
        if (!url || url.indexOf('data:') === 0) continue;
        found[url] = true;
      }
      var map = {};
      var missing = [];
      var urls = Object.keys(found);
      for (var i = 0; i < urls.length; i++) {
        var u = urls[i];
        var resolved = u;
        if (u.indexOf('fonts/') === 0) resolved = './' + u;
        else if (u.indexOf('./') !== 0 && u.indexOf('/') !== 0 && u.indexOf('file:') !== 0) resolved = './' + u;
        try {
          var resp = await fetch(resolved);
          if (!resp.ok) { missing.push(u); continue; }
          var ab = await resp.arrayBuffer();
          var mime = /\.woff2$/i.test(u) ? 'font/woff2'
            : /\.woff$/i.test(u) ? 'font/woff'
              : /\.ttf$/i.test(u) ? 'font/ttf'
                : 'application/octet-stream';
          map[u] = 'url(data:' + mime + ';base64,' + arrayBufferToBase64(ab) + ')';
        } catch (e) { missing.push(u); }
      }
      if (missing.length) throw new Error('KaTeX fonts unavailable: ' + missing.join(', '));
      return css.replace(/url\((['"]?)([^)'"]+)\1\)/g, function (full, q, url) {
        return map[url] || full;
      });
    })().catch(function (err) {
      katexExportCssPromise = null;
      throw err;
    });
    return katexExportCssPromise;
  }

  /**
   * KaTeX → PNG：纯离屏 foreignObject 栅格化（白底），不 capturePage、不往视口插节点 → 复制预览不闪烁。
   */
  async function katexElToPngDataUrl(liveEl) {
    if (!liveEl) throw new Error('formula export failed');
    if (!window.MDAKatexExport || !window.MDAKatexExport.buildSvgPayload) {
      throw new Error('formula export helper unavailable');
    }
    var css = await loadKatexCssForExport();
    // display 节点通常占满整行；只按内部公式本体采样，避免导出大块空白。
    var renderEl = liveEl.classList.contains('katex-display')
      ? (liveEl.querySelector('.katex') || liveEl)
      : liveEl;
    if (document.fonts && document.fonts.ready) {
      await withTimeout(document.fonts.ready, 2000, null);
    }
    var computed = window.getComputedStyle(renderEl);
    var clone = renderEl.cloneNode(true);
    clone.querySelectorAll('.katex-mathml').forEach(function (m) { m.remove(); });
    // 导出 CSS 的默认字号为 1.21em；锁定预览 computed size，避免内容比测量框更大而被裁切。
    clone.style.fontSize = computed.fontSize;
    clone.style.lineHeight = computed.lineHeight;
    clone.style.color = '#222222';
    clone.style.display = 'inline-block';
    clone.style.maxWidth = 'none';
    clone.style.verticalAlign = 'baseline';

    var visualBox = measureKatexVisualBox(renderEl);
    var w = Math.ceil(Math.max(visualBox.width || 0, renderEl.offsetWidth || 0));
    var h = Math.ceil(Math.max(visualBox.height || 0, renderEl.offsetHeight || 0));
    if (w < 2) w = Math.ceil(renderEl.scrollWidth) || 200;
    if (h < 2) h = Math.ceil(renderEl.scrollHeight) || 40;
    var isBlock = liveEl.classList.contains('katex-display');
    var padding = window.MDAKatexExport.formulaPadding
      ? window.MDAKatexExport.formulaPadding(isBlock)
      : (isBlock ? { x: 16, y: 12 } : { x: 4, y: 4 });
    var padX = padding.x;
    var padY = padding.y;
    var tw = w + padX * 2;
    var th = h + padY * 2;

    var payloadOptions = {
      html: clone.outerHTML,
      css: css,
      width: tw,
      height: th,
      padX: padX,
      padY: padY,
      offsetX: visualBox.offsetX,
      offsetY: visualBox.offsetY,
      scale: 2,
    };
    try {
      return await svgPayloadToPng(window.MDAKatexExport.buildSvgPayload(payloadOptions));
    } catch (error) {
      // 极复杂公式在部分 Chromium/显卡组合下无法创建 2× canvas，仅该公式降到 1×，避免回退为 TeX。
      payloadOptions.scale = 1;
      return svgPayloadToPng(window.MDAKatexExport.buildSvgPayload(payloadOptions));
    }
  }

  async function katexTableToPngDataUrl(liveTable) {
    var css = await loadKatexCssForExport();
    if (document.fonts && document.fonts.ready) {
      await withTimeout(document.fonts.ready, 2000, null);
    }
    var rect = liveTable.getBoundingClientRect();
    var width = Math.ceil(Math.max(rect.width || 0, liveTable.scrollWidth || 0));
    var height = Math.ceil(Math.max(rect.height || 0, liveTable.scrollHeight || 0));
    if (width < 2 || height < 2) throw new Error('table export failed');

    var clone = liveTable.cloneNode(true);
    clone.querySelectorAll('.katex-mathml').forEach(function (node) { node.remove(); });
    clone.setAttribute('style', 'border-collapse:collapse;table-layout:auto;width:' + width
      + 'px;margin:0;background:#ffffff;color:#222222;font-size:15px;line-height:1.5;white-space:normal;');
    clone.querySelectorAll('th,td').forEach(function (cell) {
      cell.setAttribute('style', 'border:1px solid #d8dee4;padding:8px 12px;background:#ffffff;'
        + 'color:#222222;text-align:left;vertical-align:middle;white-space:normal;');
    });
    clone.querySelectorAll('th').forEach(function (cell) {
      cell.style.fontWeight = 'bold';
      cell.style.background = '#f6f8fa';
    });

    var liveKatex = liveTable.querySelectorAll('.katex');
    var cloneKatex = clone.querySelectorAll('.katex');
    for (var i = 0; i < cloneKatex.length; i++) {
      var source = liveKatex[i];
      if (!source) continue;
      var computed = window.getComputedStyle(source);
      cloneKatex[i].style.fontSize = computed.fontSize;
      cloneKatex[i].style.lineHeight = computed.lineHeight;
      cloneKatex[i].style.color = '#222222';
    }

    var padX = 8;
    var padY = 8;
    var payloadOptions = {
      html: clone.outerHTML,
      css: css,
      width: width + padX * 2,
      height: height + padY * 2,
      padX: padX,
      padY: padY,
      scale: 2,
    };
    try {
      return await svgPayloadToPng(window.MDAKatexExport.buildSvgPayload(payloadOptions));
    } catch (error) {
      payloadOptions.scale = 1;
      return svgPayloadToPng(window.MDAKatexExport.buildSvgPayload(payloadOptions));
    }
  }

  function replaceKatexNodeWithImg(node, exported, isBlock) {
    var dataUrl = typeof exported === 'string' ? exported : exported.dataUrl;
    var logicalWidth = typeof exported === 'object' ? exported.width : 0;
    var logicalHeight = typeof exported === 'object' ? exported.height : 0;
    var img = document.createElement('img');
    img.src = dataUrl;
    img.setAttribute('alt', uiT('formula'));
    img.className = isBlock ? 'mda-formula-img mda-formula-img-block' : 'mda-formula-img mda-formula-img-inline';
    if (logicalWidth > 0) {
      img.setAttribute('data-mda-display-width', String(logicalWidth));
      img.setAttribute('width', String(logicalWidth));
    }
    if (logicalHeight > 0) img.setAttribute('height', String(logicalHeight));
    img.setAttribute('style', isBlock
      ? 'display:block;margin:12px auto;width:' + logicalWidth + 'px;max-width:100%;height:auto;'
      : 'display:inline;vertical-align:middle;margin:0 2px;width:' + logicalWidth + 'px;max-width:100%;height:auto;');
    var target = isBlock && node.parentElement && node.parentElement.classList.contains('katex-block')
      ? node.parentElement
      : node;
    if (isBlock) {
      var p = document.createElement('p');
      p.setAttribute('style', 'text-align:center;margin:16px 0;');
      p.appendChild(img);
      if (target.parentNode) target.parentNode.replaceChild(p, target);
    } else if (target.parentNode) {
      target.parentNode.replaceChild(img, target);
    }
  }

  /** 流程图导出：与全屏预览一致，深色下调 SVG 铺底/描边后再栅格化。 */
  function prepareMermaidSvgForExport(svg) {
    var clone = svg.cloneNode(true);
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (isDark()) {
      neutralizeZoomSvgBg(clone);
      var holder = document.createElement('div');
      holder.appendChild(clone);
      tuneMermaidSvgContrast(holder);
      clone = holder.querySelector('svg');
      if (clone && !clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    return clone;
  }

  function mermaidSvgToPngDataUrl(svg) {
    return new Promise(function (resolve, reject) {
      if (!svg) {
        reject(new Error('SVG to PNG failed'));
        return;
      }
      var clone = prepareMermaidSvgForExport(svg);
      var dim = svgDimensions(clone);
      var w = dim.w;
      var h = dim.h;
      clone.setAttribute('width', String(w));
      clone.setAttribute('height', String(h));
      if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var svgStr = new XMLSerializer().serializeToString(clone);
      var svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('SVG to PNG failed');
          ctx.fillStyle = isDark() ? '#1e1e1e' : '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function () { reject(new Error('SVG to PNG failed')); };
      img.src = svg64;
    });
  }

  function copyMermaidSvgAsImage(svg) {
    if (!svg || !api.copyClipboardImage) {
      uiAlert(uiT('alertZoomCopyFail', { error: uiT('unknownError') }));
      return Promise.resolve();
    }
    return mermaidSvgToPngDataUrl(svg)
      .then(function (dataUrl) {
        return copyPngDataUrlToClipboard(dataUrl);
      })
      .catch(function (e) {
        uiAlert(uiT('alertZoomCopyFail', { error: e && e.message ? e.message : String(e) }));
      });
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
      img.onerror = function () { reject(new Error('SVG to PNG failed')); };
      img.src = svg64;
    });
  }

  function imgElementToDataUrl(img) {
    return new Promise(function (resolve, reject) {
      function draw() {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) { reject(new Error('invalid image size')); return; }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) { reject(e); }
      }
      if (img.complete && img.naturalWidth) draw();
      else { img.onload = draw; img.onerror = function () { reject(new Error('image load failed')); }; }
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
      TABLE: 'border-collapse:collapse;width:auto;max-width:100%;margin:0 0 16px;font-size:15px;',
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
      if (tag === 'IMG' && el.classList && el.classList.contains('mda-formula-img')) {
        var formulaWidth = parseInt(el.getAttribute('data-mda-display-width') || '', 10);
        var formulaWidthStyle = formulaWidth > 0 ? 'width:' + formulaWidth + 'px;' : '';
        el.setAttribute('style', el.classList.contains('mda-formula-img-inline')
          ? 'display:inline;vertical-align:-0.12em;margin:0 1px;' + formulaWidthStyle + 'max-width:100%;height:auto;'
          : 'display:block;margin:12px auto;' + formulaWidthStyle + 'max-width:100%;height:auto;');
        continue;
      }
      if (tag === 'IMG') {
        var dw = parseInt(el.getAttribute('data-mda-display-width') || '', 10);
        if (dw > 0) {
          el.setAttribute('style', 'width:' + dw + 'px;max-width:100%;height:auto;display:block;margin:12px auto;');
          continue;
        }
      }
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
    var dw = parseInt(img.getAttribute('data-mda-display-width') || '', 10);
    if (dw > 0) {
      img.setAttribute('width', String(dw));
      img.style.width = dw + 'px';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      var nh = img.naturalHeight || 0;
      var nw = img.naturalWidth || 0;
      if (nw > 0 && nh > 0) {
        img.setAttribute('height', String(Math.round(dw * nh / nw)));
      }
      return Promise.resolve();
    }
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

    // 克隆节点脱离布局后无法获知 auto/max-width 的实际显示宽；先从 live DOM 固化。
    var clonedPreviewImages = root.querySelectorAll('img');
    var livePreviewImages = previewEl.querySelectorAll('img');
    for (var li = 0; li < clonedPreviewImages.length; li++) {
      var liveImg = livePreviewImages[li];
      var renderedW = renderedWidthPx(liveImg);
      if (renderedW > 0) {
        clonedPreviewImages[li].setAttribute('data-mda-display-width', String(renderedW));
      }
    }

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
            : await mermaidSvgToPngDataUrl(svg);
          mmdImg.setAttribute('alt', uiT('diagram'));
          var mmdW = liveHolder
            ? parseInt(liveHolder.getAttribute('data-mda-display-width') || '', 10)
            : 0;
          if (!(mmdW > 0) && liveHolder) mmdW = renderedWidthPx(liveHolder);
          if (mmdW > 0) {
            mmdImg.setAttribute('data-mda-display-width', String(mmdW));
            mmdImg.setAttribute('width', String(mmdW));
            mmdImg.setAttribute('style', 'width:' + mmdW + 'px;max-width:100%;height:auto;');
          }
          p.appendChild(mmdImg);
        } catch (e) {
          p.textContent = uiT('diagramBracket');
        }
      } else {
        p.textContent = uiT('diagramBracket');
      }
      if (holder.parentNode) holder.parentNode.replaceChild(p, holder);
    }

    root.querySelectorAll('.mda-mermaid-error').forEach(function (el) {
      var p = document.createElement('p');
      p.setAttribute('style', 'color:#999;font-style:italic;');
      p.textContent = el.textContent || uiT('diagramFailBracket');
      if (el.parentNode) el.parentNode.replaceChild(p, el);
    });

    // 含公式表格整体转图，避免目标编辑器把单元格内多个公式图片重新换行。
    var liveTables = previewEl.querySelectorAll('table');
    var cloneTables = root.querySelectorAll('table');
    var groupedLiveTables = new WeakSet();
    var groupedCloneTables = new WeakSet();
    var tableCount = Math.min(liveTables.length, cloneTables.length);
    for (var ti = 0; ti < tableCount; ti++) {
      if (!liveTables[ti].querySelector('.katex')) continue;
      try {
        var tablePng = await katexTableToPngDataUrl(liveTables[ti]);
        var tableImg = document.createElement('img');
        tableImg.src = tablePng.dataUrl;
        tableImg.alt = uiT('formulaTable');
        tableImg.className = 'mda-formula-table-img';
        tableImg.setAttribute('data-mda-display-width', String(tablePng.width));
        tableImg.setAttribute('width', String(tablePng.width));
        tableImg.setAttribute('height', String(tablePng.height));
        tableImg.setAttribute('style', 'display:block;margin:12px auto;width:' + tablePng.width
          + 'px;max-width:100%;height:auto;');
        groupedLiveTables.add(liveTables[ti]);
        groupedCloneTables.add(cloneTables[ti]);
        cloneTables[ti].parentNode.replaceChild(tableImg, cloneTables[ti]);
      } catch (e) { /* 整表失败时继续逐公式导出 */ }
    }

    // KaTeX → PNG：纯离屏 foreignObject，不滚动预览、不插入视口节点。
    var liveKatex = listTopKatexNodes(previewEl).filter(function (node) {
      var table = node.closest('table');
      return !table || !groupedLiveTables.has(table);
    });
    var cloneKatex = listTopKatexNodes(root).filter(function (node) {
      var table = node.closest('table');
      return !table || !groupedCloneTables.has(table);
    });
    var katexCount = Math.min(liveKatex.length, cloneKatex.length);
    for (var ki = 0; ki < katexCount; ki++) {
      var liveK = liveKatex[ki];
      var cloneK = cloneKatex[ki];
      var isBlock = !!(cloneK && cloneK.classList && cloneK.classList.contains('katex-display'));
      try {
        var kPng = await katexElToPngDataUrl(liveK);
        replaceKatexNodeWithImg(cloneK, kPng, isBlock);
      } catch (e) {
        var fallback = document.createElement(isBlock ? 'p' : 'span');
        fallback.setAttribute('style', isBlock
          ? 'text-align:center;color:#999;font-style:italic;margin:12px 0;'
          : 'color:#999;font-style:italic;');
        var tex = katexAnnotationTeX(liveK) || katexAnnotationTeX(cloneK);
        fallback.textContent = tex ? ('$' + tex + '$') : uiT('formulaBracket');
        var fallbackTarget = isBlock && cloneK.parentElement && cloneK.parentElement.classList.contains('katex-block')
          ? cloneK.parentElement
          : cloneK;
        if (fallbackTarget.parentNode) fallbackTarget.parentNode.replaceChild(fallback, fallbackTarget);
      }
    }
    for (var kr = katexCount; kr < cloneKatex.length; kr++) {
      var unmatched = cloneKatex[kr];
      var unmatchedBlock = unmatched.classList && unmatched.classList.contains('katex-display');
      var unmatchedFallback = document.createElement(unmatchedBlock ? 'p' : 'span');
      unmatchedFallback.setAttribute('style', unmatchedBlock
        ? 'text-align:center;color:#999;font-style:italic;margin:12px 0;'
        : 'color:#999;font-style:italic;');
      var unmatchedTex = katexAnnotationTeX(unmatched);
      unmatchedFallback.textContent = unmatchedTex ? ('$' + unmatchedTex + '$') : uiT('formulaBracket');
      var unmatchedTarget = unmatchedBlock && unmatched.parentElement && unmatched.parentElement.classList.contains('katex-block')
        ? unmatched.parentElement
        : unmatched;
      if (unmatchedTarget.parentNode) unmatchedTarget.parentNode.replaceChild(unmatchedFallback, unmatchedTarget);
    }
    root.querySelectorAll('.katex-mathml, .katex-display, .katex, .katex-block').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
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

  /**
   * CM6 下 #preview-content 常为空；导出/微信复制前用当前源码填入隐藏预览 DOM（不闪界面）。
   * @returns {Promise<boolean>}
   */
  function ensurePreviewHtmlForExport() {
    return new Promise(function (resolve) {
      var text = getEditorTextValue();
      if (!text || !String(text).trim()) {
        resolve(false);
        return;
      }
      if (!isCm6Ready() && previewEl && previewEl.textContent && previewEl.textContent.trim()) {
        resolve(true);
        return;
      }
      renderMarkdownContent(text, {
        skipOutlineSync: true,
        onReady: function () {
          resolve(!!(previewEl && previewEl.textContent && previewEl.textContent.trim()));
        },
      });
    });
  }

  async function copyPreviewForArticle() {
    var ready = await ensurePreviewHtmlForExport();
    if (!ready) {
      uiAlert(uiT('alertPreviewEmpty'));
      return;
    }
    try {
      var pack = await buildArticleClipboardContent();
      if (!pack.text && !pack.html) {
        uiAlert(uiT('alertCopyEmpty'));
        return;
      }
      var r = await api.copyArticleHtml(pack.html, pack.text);
      if (r && r.success !== false) {
        uiAlert(uiT('alertCopyWechatOk'));
      } else {
        uiAlert(uiT('alertCopyFail', { error: (r && r.error) || uiT('unknownError') }));
      }
    } catch (err) {
      uiAlert(uiT('alertCopyFail', { error: (err && err.message) ? err.message : String(err) }));
    }
  }

  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(fallback);
      }, ms);
      Promise.resolve(promise).then(
        function (v) {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve(v);
        },
        function () {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve(fallback);
        },
      );
    });
  }

  /** 整段导出超时（拒绝而非吞掉），默认 60s */
  var EXPORT_TIMEOUT_MS = 60000;

  function raceWithTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var t = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(uiT('exportTimeout', { label: label || uiT('exportDefaultLabel'), sec: Math.round(ms / 1000) })));
      }, ms);
      Promise.resolve(promise).then(
        function (v) {
          if (settled) return;
          settled = true;
          clearTimeout(t);
          resolve(v);
        },
        function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(t);
          reject(err);
        },
      );
    });
  }

  var exportBusyEl = null;

  function showExportBusy(message) {
    hideExportBusy();
    var overlay = document.createElement('div');
    overlay.id = 'mda-export-busy';
    overlay.className = 'modal-overlay mda-export-busy';
    overlay.innerHTML =
      '<div class="modal-box" role="status" aria-live="polite">' +
        '<div class="mda-export-spin" aria-hidden="true"></div>' +
        '<p class="mda-export-msg">' + escHtml(message || uiT('exportBusy')) + '</p>' +
        '<p class="mda-export-hint">' + uiT('exportBusyHint') + '</p>' +
      '</div>';
    document.body.appendChild(overlay);
    exportBusyEl = overlay;
  }

  function setExportBusyMessage(message) {
    if (!exportBusyEl) return;
    var msg = exportBusyEl.querySelector('.mda-export-msg');
    if (msg) msg.textContent = message || uiT('exportBusy');
  }

  function hideExportBusy() {
    if (exportBusyEl) {
      exportBusyEl.remove();
      exportBusyEl = null;
    }
    var orphan = document.getElementById('mda-export-busy');
    if (orphan) orphan.remove();
  }

  /**
   * 文件导出专用：比公众号复制更轻量——流程图保留 SVG（不截图转 PNG），
   * 本地图片内联带超时，避免导出挂死或超大 IPC 失败。
   */
  async function buildExportHtmlContent() {
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

    // 流程图：内联 SVG（可供浏览器 / printToPDF 渲染）
    root.querySelectorAll('.mda-mermaid').forEach(function (holder, idx) {
      var live = previewEl.querySelectorAll('.mda-mermaid')[idx];
      var svg = (live && live.querySelector('svg')) || holder.querySelector('svg');
      var wrap = document.createElement('div');
      wrap.setAttribute('style', 'text-align:center;margin:16px 0;overflow-x:auto;');
      if (svg) {
        var clone = svg.cloneNode(true);
        if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        wrap.appendChild(clone);
      } else {
        wrap.textContent = uiT('diagramBracket');
      }
      if (holder.parentNode) holder.parentNode.replaceChild(wrap, holder);
    });
    root.querySelectorAll('.mda-mermaid-error').forEach(function (el) {
      var p = document.createElement('p');
      p.setAttribute('style', 'color:#999;font-style:italic;');
      p.textContent = el.textContent || uiT('diagramFailBracket');
      if (el.parentNode) el.parentNode.replaceChild(p, el);
    });

    var imgs = root.querySelectorAll('img');
    for (var ii = 0; ii < imgs.length; ii++) {
      if (imgs.length > 1) {
        setExportBusyMessage(uiT('exportBusyImages', { cur: ii + 1, total: imgs.length }));
      }
      await withTimeout(inlineImageSrc(imgs[ii]), 8000, null);
      await withTimeout(normalizeImgToPng(imgs[ii]), 5000, null);
      await withTimeout(ensureImgDimensions(imgs[ii]), 3000, null);
    }

    root.querySelectorAll('.mda-cursor-block').forEach(function (el) { el.classList.remove('mda-cursor-block'); });
    applyArticleInlineStyles(root);

    return wrapExportHtmlDocument(wrapArticleSection(root.innerHTML), exportBaseName());
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
      + safeTitle + '</title>\n'
      + '<style>body{margin:24px;background:#fff;} svg{max-width:100%;height:auto;}</style>\n'
      + '</head>\n<body>\n' + bodyHtml + '\n</body>\n</html>';
  }

  async function runExportJob(kind, writeFn) {
    var label = kind === 'pdf' ? 'PDF' : (kind === 'docx' ? 'Word' : 'HTML');
    showExportBusy(uiT('exportBusyLabel', { label: label }));
    try {
      setExportBusyMessage(uiT('exportBusyPrepare'));
      var doc = await raceWithTimeout(buildExportHtmlContent(), EXPORT_TIMEOUT_MS, uiT('prepareLabel', { label: label }));
      if (!doc) throw new Error(uiT('exportEmpty'));
      setExportBusyMessage(kind === 'pdf' ? uiT('exportBusyPdf') : uiT('exportBusyWrite'));
      var wr = await raceWithTimeout(writeFn(doc), EXPORT_TIMEOUT_MS, uiT('writeLabel', { label: label }));
      hideExportBusy();
      if (wr && wr.success) {
        uiAlert(uiT('alertExportOk', { label: label, path: wr.filePath }));
      } else {
        uiAlert(uiT('alertExportFail', { error: (wr && wr.error) || uiT('unknownError') }));
      }
    } catch (err) {
      hideExportBusy();
      uiAlert(uiT('alertExportFail', { error: (err && err.message) ? err.message : String(err) }));
    }
  }

  async function exportPreviewHtml() {
    var ready = await ensurePreviewHtmlForExport();
    if (!ready) {
      uiAlert(uiT('alertPreviewEmpty'));
      return;
    }
    if (!api.writeTextFile) {
      uiAlert(uiT('alertExportNoWrite'));
      return;
    }
    try {
      var base = exportBaseName();
      var dlgOpts = {
        title: uiT('exportHtmlTitle'),
        suggestedName: base + '.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      };
      if (workspaceRoot) dlgOpts.defaultPath = workspaceRoot;
      else if (currentFilePath && api.resolvePath) {
        dlgOpts.defaultPath = api.resolvePath(currentFilePath, '.');
      }
      var dlg = await api.showSaveDialog(dlgOpts);
      if (!dlg || !dlg.success || dlg.canceled || !dlg.filePath) return;
      await runExportJob('html', function (doc) {
        return api.writeTextFile(dlg.filePath, doc);
      });
    } catch (err) {
      hideExportBusy();
      uiAlert(uiT('alertExportFail', { error: (err && err.message) ? err.message : String(err) }));
    }
  }

  async function exportPreviewPdf() {
    var ready = await ensurePreviewHtmlForExport();
    if (!ready) {
      uiAlert(uiT('alertPreviewEmpty'));
      return;
    }
    if (!api.exportPdf) {
      uiAlert(uiT('alertExportNoPdf'));
      return;
    }
    try {
      var base = exportBaseName();
      var dlgOpts = {
        title: uiT('exportPdfTitle'),
        suggestedName: base + '.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      };
      if (workspaceRoot) dlgOpts.defaultPath = workspaceRoot;
      else if (currentFilePath && api.resolvePath) {
        dlgOpts.defaultPath = api.resolvePath(currentFilePath, '.');
      }
      var dlg = await api.showSaveDialog(dlgOpts);
      if (!dlg || !dlg.success || dlg.canceled || !dlg.filePath) return;
      await runExportJob('pdf', function (doc) {
        return api.exportPdf(dlg.filePath, doc);
      });
    } catch (err) {
      hideExportBusy();
      uiAlert(uiT('alertExportFail', { error: (err && err.message) ? err.message : String(err) }));
    }
  }

  async function exportPreviewDocx() {
    var ready = await ensurePreviewHtmlForExport();
    if (!ready) {
      uiAlert(uiT('alertPreviewEmpty'));
      return;
    }
    if (!api.exportDocx) {
      uiAlert(uiT('alertExportNoDocx'));
      return;
    }
    try {
      var base = exportBaseName();
      var dlgOpts = {
        title: uiT('exportDocxTitle'),
        suggestedName: base + '.docx',
        filters: [{ name: 'Word', extensions: ['docx'] }],
      };
      if (workspaceRoot) dlgOpts.defaultPath = workspaceRoot;
      else if (currentFilePath && api.resolvePath) {
        dlgOpts.defaultPath = api.resolvePath(currentFilePath, '.');
      }
      var dlg = await api.showSaveDialog(dlgOpts);
      if (!dlg || !dlg.success || dlg.canceled || !dlg.filePath) return;
      await runExportJob('docx', function (doc) {
        return api.exportDocx(dlg.filePath, doc);
      });
    } catch (err) {
      hideExportBusy();
      uiAlert(uiT('alertExportFail', { error: (err && err.message) ? err.message : String(err) }));
    }
  }

  // ---- 图片 / 流程图：预览内拖拽调宽（仅预览态，复制预览跟尺寸）----
  var imageDisplayWidths = {}; // src → 宽度（用户拖拽覆盖；不含设置默认）
  var mermaidDisplayWidths = {}; // mermaidSrc → 宽度（用户拖拽覆盖；不含设置默认）
  // auto | 25 | 50 | 75 —— 相对「自动」固有显示宽度的放大系数（pct/100；auto=100%）
  var mediaDefaultWidthPref = 'auto';
  var activePreviewResize = null; // { el, kind, startX, startW, moved, chromeHost }
  var MEDIA_SCALE_PCTS = { 25: true, 50: true, 75: true };
  var MEDIA_DRAG_MIN_PX = 80;

  function getPreviewMediaDragMaxWidthPx() {
    if (isCm6Ready() && cm6HostEl) {
      var colW = getCm6TextColumnWidthPx(null);
      if (colW > 0) return colW;
    }
    var host = previewEl;
    return (host && host.clientWidth)
      ? Math.max(MEDIA_DRAG_MIN_PX, host.clientWidth - 32)
      : 0;
  }

  /** CM6 编辑区正文栏宽（与 .cm-content 内文字同宽，竞品默认铺满） */
  function getCm6TextColumnWidthPx(img) {
    var content = img && img.closest ? img.closest('.cm-content') : null;
    if (!content && cm6HostEl) {
      content = cm6HostEl.querySelector('.cm-content');
    }
    if (!content) return 0;
    var style = window.getComputedStyle(content);
    var pl = parseFloat(style.paddingLeft) || 0;
    var pr = parseFloat(style.paddingRight) || 0;
    return Math.max(MEDIA_DRAG_MIN_PX, Math.round(content.clientWidth - pl - pr));
  }

  function normalizeMediaDefaultWidthPref(raw) {
    var v = String(raw == null ? 'auto' : raw);
    if (v === 'auto' || v === '100') return 'auto';
    if (MEDIA_SCALE_PCTS[v]) return v;
    // 旧档位兼容
    if (v === 'min') return '25';
    if (v === 'full' || v === '125' || v === '150') return 'auto';
    var n = parseInt(v, 10);
    if (n === 480 || n === 560) return '50';
    if (n === 640) return '75';
    if (n === 720) return 'auto';
    if (MEDIA_SCALE_PCTS[String(n)]) return String(n);
    return 'auto';
  }

  function readMediaDefaultWidthPref() {
    try {
      var v = localStorage.getItem('mda-preview-media-default-width')
        || localStorage.getItem('mda-mermaid-default-width');
      return normalizeMediaDefaultWidthPref(v);
    } catch (e) { /* ignore */ }
    return 'auto';
  }
  mediaDefaultWidthPref = readMediaDefaultWidthPref();

  var liveRevealPref = 'never';

  function readLiveRevealPref() {
    try {
      var v = localStorage.getItem('mda-live-reveal');
      if (v === 'nearby' || v === 'never' || v === 'block') return v;
    } catch (e) { /* ignore */ }
    return 'never';
  }

  function liveRevealLabel(mode) {
    if (mode === 'nearby') return uiT('settingsLiveRevealNearby');
    if (mode === 'never') return uiT('settingsLiveRevealNever');
    return uiT('settingsLiveRevealBlock');
  }

  function applyLiveRevealPref(mode, opts) {
    opts = opts || {};
    var next = String(mode || 'block');
    if (['block', 'nearby', 'never'].indexOf(next) < 0) next = 'block';
    liveRevealPref = next;
    try { localStorage.setItem('mda-live-reveal', next); } catch (e) { /* ignore */ }
    if (isCm6Enabled() && cm6Editor && cm6Editor.view) {
      try { cm6Editor.view.dispatch({}); } catch (e) { /* ignore */ }
    }
    if (opts.toast) showToast(uiT('toastLiveRevealOn', { mode: liveRevealLabel(next) }));
  }

  liveRevealPref = readLiveRevealPref();

  function applyMediaDefaultWidthPref(mode, opts) {
    opts = opts || {};
    var next = normalizeMediaDefaultWidthPref(mode);
    mediaDefaultWidthPref = next;
    try {
      localStorage.setItem('mda-preview-media-default-width', next);
      localStorage.setItem('mda-mermaid-default-width', next);
    } catch (e) { /* ignore */ }
    if (opts.reapply !== false) reapplyMediaDefaultWidths();
  }

  /** 相对自动尺寸的放大系数；auto → 1 */
  function getMediaScaleFactor() {
    if (mediaDefaultWidthPref === 'auto' || !mediaDefaultWidthPref) return 1;
    var pct = parseInt(mediaDefaultWidthPref, 10);
    if (MEDIA_SCALE_PCTS[String(pct)]) return pct / 100;
    return 1;
  }

  function readSvgNaturalWidthPx(svg) {
    if (!svg) return 0;
    var raw = svg.getAttribute('width') || '';
    if (raw && !/%$/.test(String(raw))) {
      var n = parseFloat(raw);
      if (n > 0) return n;
    }
    var vb = svg.viewBox && svg.viewBox.baseVal;
    if (vb && vb.width > 0) return vb.width;
    try {
      var box = svg.getBBox();
      if (box && box.width > 0) return box.width;
    } catch (e) { /* ignore */ }
    return 0;
  }

  function rememberMermaidNaturalWidth(holder) {
    if (!holder) return 0;
    var svg = holder.querySelector('svg');
    var natural = readSvgNaturalWidthPx(svg);
    if (natural > 0) {
      holder.setAttribute('data-mda-natural-width', String(Math.round(natural)));
    }
    return natural;
  }

  /** 「自动」基准宽 = CM6 文字栏宽；经典预览 = min(固有像素, 可拖上限) */
  function getMermaidAutoWidthPx(holder) {
    var inCm6 = !!(holder && holder.closest && holder.closest('.mda-cm-mermaid-frame'));
    if (inCm6) {
      var colW = getCm6TextColumnWidthPx(holder);
      if (colW > 0) return colW;
    }
    var natural = parseFloat(holder.getAttribute('data-mda-natural-width') || '0');
    if (!(natural > 0)) natural = rememberMermaidNaturalWidth(holder);
    var maxW = getPreviewMediaDragMaxWidthPx();
    if (natural > 0 && maxW > 0) return Math.min(natural, maxW);
    return natural || 0;
  }

  function getImageAutoWidthPx(img) {
    var inCm6 = !!(img && img.closest && img.closest('.mda-cm-image-frame'));
    if (inCm6) {
      var colW = getCm6TextColumnWidthPx(img);
      if (colW > 0) return colW;
    }
    var nw = img.naturalWidth || 0;
    if (!(nw > 0)) {
      var stored = parseFloat(img.getAttribute('data-mda-natural-width') || '0');
      if (stored > 0) nw = stored;
    } else {
      img.setAttribute('data-mda-natural-width', String(nw));
    }
    var maxW = getPreviewMediaDragMaxWidthPx();
    if (nw > 0 && maxW > 0) return Math.min(nw, maxW);
    if (nw > 0) return nw;
    var rect = img.getBoundingClientRect();
    return rect.width > 1 ? rect.width : 0;
  }

  function scaledWidthFromAuto(autoW, scale, minW) {
    if (!(autoW > 0)) return 0;
    var maxW = getPreviewMediaDragMaxWidthPx() || autoW;
    var w = Math.round(autoW * scale);
    var floor = minW != null ? minW : 16;
    return Math.max(floor, Math.min(maxW, w));
  }

  function applyDefaultScaleToMermaid(holder) {
    var scale = getMediaScaleFactor();
    var inCm6 = !!(holder && holder.closest && holder.closest('.mda-cm-mermaid-frame'));
    if (scale === 1 && !inCm6) {
      resetMermaidToIntrinsic(holder);
      return;
    }
    var autoW = getMermaidAutoWidthPx(holder);
    var w = scaledWidthFromAuto(autoW, scale, 24);
    if (w > 0) applyMermaidDisplayWidth(holder, w, { skipRemember: true });
  }

  /** CM6 围栏代码块：默认宽与图片/流程图一致（正文栏宽 × 媒体默认比例） */
  function applyDefaultScaleToCodeBlock(root) {
    if (!root) return;
    var autoW = getCm6TextColumnWidthPx(root);
    var w = scaledWidthFromAuto(autoW, getMediaScaleFactor(), 24);
    if (!(w > 0)) return;
    root.style.width = w + 'px';
    root.style.maxWidth = w + 'px';
    root.style.boxSizing = 'border-box';
    var frame = root.querySelector('.mda-cm-code-frame');
    if (frame) {
      frame.style.width = '100%';
      frame.classList.add('mda-cm-code-sized');
    }
  }

  /** CM6 表格块：默认宽与围栏代码块一致（正文栏宽 × 媒体默认比例） */
  function applyDefaultScaleToTableBlock(root) {
    if (!root) return;
    var autoW = getCm6TextColumnWidthPx(root);
    var w = scaledWidthFromAuto(autoW, getMediaScaleFactor(), 24);
    if (!(w > 0)) return;
    root.style.display = 'block';
    root.style.width = w + 'px';
    root.style.maxWidth = w + 'px';
    root.style.boxSizing = 'border-box';
    var stage = root.querySelector('.mda-cm-table-stage');
    if (stage) {
      stage.style.width = '100%';
      stage.style.maxWidth = '100%';
      stage.style.boxSizing = 'border-box';
    }
    var wrap = root.querySelector('.mda-cm-table-wrap');
    if (wrap && !wrap.hasAttribute('data-mda-snap')) {
      wrap.style.width = '100%';
      wrap.style.maxWidth = '100%';
    }
    var table = root.querySelector('table.mda-cm-table');
    if (table && table.getAttribute('data-mda-layout') !== 'fixed') {
      table.style.width = '100%';
      table.style.tableLayout = 'fixed';
    }
  }

  function applyDefaultScaleToImage(img) {
    var scale = getMediaScaleFactor();
    var inCm6 = !!(img && img.closest && img.closest('.mda-cm-image-frame'));
    function go() {
      var autoW = getImageAutoWidthPx(img);
      if (!(autoW > 0)) return;
      if (scale === 1 && !inCm6) {
        resetImageToIntrinsic(img);
        return;
      }
      var w = scaledWidthFromAuto(autoW, scale, 16);
      if (w > 0) applyImageDisplayWidth(img, w, { skipRemember: true, allowOverflow: inCm6 });
    }
    if (img.complete && img.naturalWidth) go();
    else img.addEventListener('load', go, { once: true });
  }

  function applyImageDisplayWidth(img, widthPx, opts) {
    opts = opts || {};
    var w = Math.round(widthPx);
    if (!img || !(w > 16)) return;
    img.style.width = w + 'px';
    img.style.maxWidth = opts.allowOverflow ? 'none' : '100%';
    img.style.height = 'auto';
    img.setAttribute('data-mda-display-width', String(w));
    syncCm6ImageFrameLayout(img, opts);
    if (!opts.skipRemember) {
      var key = img.getAttribute('src') || '';
      if (key) imageDisplayWidths[key] = w;
    }
  }

  /** CM6 图片块：蓝框容器须与 img 同宽 */
  function syncCm6ImageFrameLayout(img, opts) {
    opts = opts || {};
    if (!img) return;
    var frame = img.closest('.mda-cm-image-frame');
    if (!frame) return;
    var inner = frame.querySelector('.mda-cm-image-inner');
    var w = parseInt(img.getAttribute('data-mda-display-width') || '', 10);
    if (!(w > 0)) {
      w = Math.round(img.getBoundingClientRect().width || img.clientWidth || 0);
    }
    var sized = opts.allowOverflow || img.hasAttribute('data-mda-display-width');
    if (!(w > 0) && !sized) {
      frame.style.width = '';
      if (inner) inner.style.width = '';
      frame.classList.remove('mda-cm-image-sized');
      if (inner) inner.classList.remove('mda-cm-image-sized');
      frame.style.maxWidth = '';
      if (inner) inner.style.maxWidth = '';
      img.style.maxWidth = '100%';
      return;
    }
    if (!(w > 0)) return;
    frame.style.width = w + 'px';
    if (inner) inner.style.width = w + 'px';
    if (sized) {
      frame.classList.add('mda-cm-image-sized');
      if (inner) inner.classList.add('mda-cm-image-sized');
      frame.style.maxWidth = 'none';
      if (inner) inner.style.maxWidth = 'none';
      img.style.maxWidth = 'none';
    } else {
      frame.classList.remove('mda-cm-image-sized');
      if (inner) inner.classList.remove('mda-cm-image-sized');
      frame.style.maxWidth = '';
      if (inner) inner.style.maxWidth = '';
      img.style.maxWidth = '100%';
    }
  }

  function applyMermaidDisplayWidth(holder, widthPx, opts) {
    opts = opts || {};
    var w = Math.round(widthPx);
    if (!holder || !(w > 16)) return;
    holder.style.width = w + 'px';
    holder.style.maxWidth = '100%';
    holder.style.marginLeft = 'auto';
    holder.style.marginRight = 'auto';
    holder.setAttribute('data-mda-display-width', String(w));
    var svg = holder.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
    }
    if (!opts.skipRemember) {
      var key = holder.getAttribute('data-mermaid-src') || '';
      if (key) mermaidDisplayWidths[key] = w;
    }
    syncCm6MermaidFrameLayout(holder);
  }

  /** CM6 Mermaid 块：蓝框容器须与 stage 同宽 */
  function syncCm6MermaidFrameLayout(holder) {
    if (!holder) return;
    var frame = holder.closest('.mda-cm-mermaid-frame');
    if (!frame) return;
    var w = parseInt(holder.getAttribute('data-mda-display-width') || '', 10);
    if (!(w > 0)) {
      w = Math.round(holder.getBoundingClientRect().width || holder.clientWidth || 0);
    }
    if (!(w > 0)) return;
    frame.style.width = w + 'px';
    if (holder.hasAttribute('data-mda-display-width')) {
      frame.classList.add('mda-cm-mermaid-sized');
      holder.classList.add('mda-cm-mermaid-sized');
      frame.style.maxWidth = 'none';
      holder.style.maxWidth = 'none';
    } else {
      frame.classList.remove('mda-cm-mermaid-sized');
      holder.classList.remove('mda-cm-mermaid-sized');
      frame.style.maxWidth = '';
      holder.style.maxWidth = '100%';
    }
  }

  function resetMermaidToIntrinsic(holder) {
    if (!holder) return;
    holder.style.width = '';
    holder.style.maxWidth = '100%';
    holder.removeAttribute('data-mda-display-width');
    var svg = holder.querySelector('svg');
    if (svg) {
      svg.style.width = '';
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
      normalizeMermaidSvgIntrinsicSize(svg);
    }
    syncCm6MermaidFrameLayout(holder);
  }

  function resetImageToIntrinsic(img) {
    if (!img) return;
    img.style.width = '';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.removeAttribute('data-mda-display-width');
    syncCm6ImageFrameLayout(img, {});
  }

  function reapplyMediaDefaultWidths() {
    function reapplyMermaidsInRoot(root) {
      if (!root) return;
      var holders = root.querySelectorAll('.mda-cm-mermaid-stage.mda-mermaid, .mda-mermaid');
      for (var i = 0; i < holders.length; i++) {
        var h = holders[i];
        var mKey = h.getAttribute('data-mermaid-src') || '';
        if (mKey && Object.prototype.hasOwnProperty.call(mermaidDisplayWidths, mKey)) continue;
        applyDefaultScaleToMermaid(h);
      }
    }
    function reapplyCodeBlocksInRoot(root) {
      if (!root) return;
      var blocks = root.querySelectorAll('.mda-cm-code-block-line');
      for (var k = 0; k < blocks.length; k++) {
        applyDefaultScaleToCodeBlock(blocks[k]);
      }
    }
    function reapplyTableBlocksInRoot(root) {
      if (!root) return;
      var blocks = root.querySelectorAll('.mda-cm-table-block-line');
      for (var t = 0; t < blocks.length; t++) {
        applyDefaultScaleToTableBlock(blocks[t]);
      }
    }
    function reapplyInRoot(root) {
      if (!root) return;
      reapplyCodeBlocksInRoot(root);
      reapplyTableBlocksInRoot(root);
      var imgs = root.querySelectorAll('img');
      for (var j = 0; j < imgs.length; j++) {
        var img = imgs[j];
        var iKey = img.getAttribute('src') || '';
        if (iKey && Object.prototype.hasOwnProperty.call(imageDisplayWidths, iKey)) continue;
        applyDefaultScaleToImage(img);
      }
    }

    if (previewEl) {
      reapplyMermaidsInRoot(previewEl);
      reapplyInRoot(previewEl);
    }

    if (isCm6Ready() && cm6HostEl) {
      reapplyMermaidsInRoot(cm6HostEl);
      reapplyInRoot(cm6HostEl);
      if (cm6Editor && cm6Editor.view) {
        try {
          cm6Editor.view.requestMeasure();
        } catch (_) {
          /* ignore */
        }
      }
    }
  }

  // 旧名兼容
  function applyMermaidDefaultWidthPref(mode, opts) {
    applyMediaDefaultWidthPref(mode, opts);
  }
  function getMermaidDefaultWidthPx() {
    return 0;
  }
  function reapplyMermaidDefaultWidths() {
    reapplyMediaDefaultWidths();
  }

  function onPreviewResizeMove(e) {
    if (!activePreviewResize) return;
    var dx = e.clientX - activePreviewResize.startX;
    if (dx !== 0) activePreviewResize.moved = true;
    var maxW = getPreviewMediaDragMaxWidthPx() || window.innerWidth;
    var minW = activePreviewResize.kind === 'mermaid' ? MEDIA_DRAG_MIN_PX : 48;
    var next = Math.max(minW, Math.min(maxW, activePreviewResize.startW + dx));
    if (activePreviewResize.kind === 'mermaid') applyMermaidDisplayWidth(activePreviewResize.el, next);
    else applyImageDisplayWidth(activePreviewResize.el, next, { allowOverflow: true });
    if (isCm6Ready() && cm6Editor && cm6Editor.view) {
      try {
        cm6Editor.view.requestMeasure();
      } catch (_) {
        /* ignore */
      }
    }
  }
  function onPreviewResizeUp() {
    if (!activePreviewResize) return;
    var resized = activePreviewResize.moved;
    var el = activePreviewResize.el;
    if (activePreviewResize.chromeHost) {
      activePreviewResize.chromeHost.classList.remove('mda-img-resize-active');
    }
    document.body.classList.remove('mda-img-resizing');
    if (resized && el) {
      // 仅抑制拖拽松手紧接着合成的 click；超时后不吞掉下一次正常单击。
      el.dataset.suppressZoomUntil = String(Date.now() + 400);
    }
    activePreviewResize = null;
    if (resized && isCm6Ready() && cm6Editor && cm6Editor.view) {
      try {
        cm6Editor.view.requestMeasure();
      } catch (_) {
        /* ignore */
      }
    }
  }
  window.addEventListener('mousemove', onPreviewResizeMove);
  window.addEventListener('mouseup', onPreviewResizeUp);

  // 分栏变化时，「自动」基准宽可能变（宽图受预览栏约束），需按系数重算
  var mediaDefaultWidthResizeTimer = null;
  function scheduleReapplyMediaDefaultWidths() {
    if (mediaDefaultWidthResizeTimer) clearTimeout(mediaDefaultWidthResizeTimer);
    mediaDefaultWidthResizeTimer = setTimeout(function () {
      mediaDefaultWidthResizeTimer = null;
      reapplyMediaDefaultWidths();
    }, 120);
  }
  var mediaDefaultWidthResizeObserver = null;
  function setupMediaDefaultWidthResizeObserver() {
    if (mediaDefaultWidthResizeObserver || typeof ResizeObserver === 'undefined') return;
    try {
      mediaDefaultWidthResizeObserver = new ResizeObserver(function () {
        scheduleReapplyMediaDefaultWidths();
      });
      if (previewEl) mediaDefaultWidthResizeObserver.observe(previewEl);
      if (cm6HostEl) mediaDefaultWidthResizeObserver.observe(cm6HostEl);
    } catch (e) { /* ignore */ }
  }

  function measurePreviewResizeStartWidth(el, kind) {
    var saved = parseInt(el.getAttribute('data-mda-display-width') || '', 10);
    if (saved > 0) return saved;
    if (kind === 'mermaid') {
      var svg = el.querySelector('svg');
      if (svg) {
        var sw = svg.getBoundingClientRect().width;
        if (sw > 1) return sw;
      }
    }
    var rect = el.getBoundingClientRect();
    if (rect.width > 1) return rect.width;
    return el.clientWidth || 200;
  }

  function startPreviewResize(el, kind, e) {
    var chromeHost =
      kind === 'mermaid'
        ? el
        : el.closest('.md-image-wrapper') || el.closest('.mda-cm-image-frame') || el;
    if (chromeHost && chromeHost.classList) chromeHost.classList.add('mda-img-resize-active');
    activePreviewResize = {
      el: el,
      kind: kind,
      startX: e.clientX,
      startW: measurePreviewResizeStartWidth(el, kind),
      moved: false,
      chromeHost: chromeHost,
    };
    document.body.classList.add('mda-img-resizing');
    if (e.pointerId != null && chromeHost && chromeHost.setPointerCapture) {
      try {
        chromeHost.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
  }

  /** 清除手动拖拽覆盖，恢复为当前设置比例 */
  function restoreMediaToSettingsScale(el, kind) {
    if (!el) return;
    if (kind === 'mermaid') {
      var mKey = el.getAttribute('data-mermaid-src') || '';
      if (mKey) delete mermaidDisplayWidths[mKey];
      applyDefaultScaleToMermaid(el);
    } else {
      var iKey = el.getAttribute('src') || '';
      if (iKey) delete imageDisplayWidths[iKey];
      applyDefaultScaleToImage(el);
    }
  }

  function ensureMermaidResizeChrome(holder) {
    if (!holder || holder.dataset.resizeReady === '1') return;
    holder.dataset.resizeReady = '1';
    holder.classList.add('mda-mermaid-resizable');
    rememberMermaidNaturalWidth(holder);
    var key = holder.getAttribute('data-mermaid-src') || '';
    if (key && Object.prototype.hasOwnProperty.call(mermaidDisplayWidths, key)) {
      applyMermaidDisplayWidth(holder, mermaidDisplayWidths[key]);
    } else {
      applyDefaultScaleToMermaid(holder);
    }
    if (holder.querySelector('.mda-img-resize-handle')) return;
    var handle = document.createElement('span');
    handle.className = 'mda-img-resize-handle';
    handle.title = uiT('mermaidResizeHandle');
    holder.appendChild(handle);
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      startPreviewResize(holder, 'mermaid', e);
    });
    handle.addEventListener('dblclick', function (e) {
      e.preventDefault();
      e.stopPropagation();
      restoreMediaToSettingsScale(holder, 'mermaid');
    });
  }

  function ensureImageResizeChrome(img) {
    if (!img || img.dataset.resizeReady === '1') return;
    img.dataset.resizeReady = '1';

    var wrap = img.closest('.md-image-wrapper');
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'md-image-wrapper mda-img-resizable';
      if (img.parentNode) {
        img.parentNode.insertBefore(wrap, img);
        wrap.appendChild(img);
      }
    } else {
      wrap.classList.add('mda-img-resizable');
    }
    if (!img.dataset.resetScaleReady) {
      img.dataset.resetScaleReady = '1';
      img.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (img._zoomClickTimer) {
          clearTimeout(img._zoomClickTimer);
          img._zoomClickTimer = null;
        }
        restoreMediaToSettingsScale(img, 'img');
      });
    }
    if (wrap.querySelector('.mda-img-resize-handle')) return;

    var handle = document.createElement('span');
    handle.className = 'mda-img-resize-handle';
    handle.title = uiT('imgResizeHandle');
    wrap.appendChild(handle);

    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      startPreviewResize(img, 'img', e);
    });
    handle.addEventListener('dblclick', function (e) {
      e.preventDefault();
      e.stopPropagation();
      restoreMediaToSettingsScale(img, 'img');
    });
  }

  function resolveImages() {
    var imgs = previewEl.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.getAttribute('src') || '';
      if (src && !/^(https?:|data:|file:)/i.test(src) && currentFilePath) {
        var abs = api.resolvePath(currentFilePath, src);
        if (abs) {
          src = toLocalFileUrl(abs);
          img.setAttribute('src', src);
        }
      }
      var key = img.getAttribute('src') || '';
      if (key && Object.prototype.hasOwnProperty.call(imageDisplayWidths, key)) {
        applyImageDisplayWidth(img, imageDisplayWidths[key]);
      } else {
        applyDefaultScaleToImage(img);
      }
      ensureImageResizeChrome(img);
      if (!img.dataset.zoomReady) {
        img.dataset.zoomReady = '1';
        img.addEventListener('click', function (e) {
          e.stopPropagation();
          var suppressUntil = parseInt(this.dataset.suppressZoomUntil || '0', 10);
          if (suppressUntil) {
            delete this.dataset.suppressZoomUntil;
            if (Date.now() <= suppressUntil) return;
          }
          var self = this;
          if (self._zoomClickTimer) {
            clearTimeout(self._zoomClickTimer);
            self._zoomClickTimer = null;
            return;
          }
          self._zoomClickTimer = setTimeout(function () {
            self._zoomClickTimer = null;
            var z = new Image();
            z.src = self.src;
            openZoom(z, { kind: 'image', imageSrc: self.src });
          }, 280);
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
    copyBtn.textContent = uiT('copyBtn');

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
    copyTextWithToast(text, uiT('toastCopied'));
    if (btn) {
      var old = btn.textContent;
      btn.textContent = uiT('copied');
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
      '<div class="mda-menu-item' + (hasSel ? '' : ' disabled') + '" data-act="copy"><span>' + uiT('copy') + '</span><span class="mda-menu-key">' + MOD_KEY + 'C</span></div>' +
      '<div class="mda-menu-item" data-act="copy-all"><span>' + uiT('copyAll') + '</span><span class="mda-menu-key">' + MOD_KEY + 'A</span></div>' +
      '<div class="mda-menu-item' + (hasSel ? '' : ' disabled') + '" data-act="anno"><span>' + uiT('addSelAnno') + '</span></div>';
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
          uiAlert(uiT('alertSelectCodeCopy'));
          removeCodeContextMenu();
          return;
        }
        copyCode(selText, btn);
      } else if (act === 'copy-all') {
        copyCode(rawText, btn);
      } else if (act === 'anno') {
        if (!snap) {
          uiAlert(uiT('alertSelectCodeAnno'));
          removeCodeContextMenu();
          return;
        }
        previewSelectionSnap = snap;
        var anchor = resolveSelectionAnchor('preview', snap);
        removeCodeContextMenu();
        clearPreviewSelectionSnap();
        if (!anchor) {
          uiAlert(uiT('alertBadSelectionEditor'));
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

  function annoContentNeedsToggle(text) {
    var s = String(text || '');
    if (!s) return false;
    if (s.indexOf('\n') >= 0) return true;
    return s.length > 72;
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
      var full = a.content || '';
      var needsToggle = annoContentNeedsToggle(full);
      var expanded = !!(expandedAnnoIds && expandedAnnoIds[a.id]);
      var bodyCls = 'anno-content' + (needsToggle && !expanded ? ' is-collapsed' : '');
      var stale = selAnchor && selAnchor.isAnchorStale(getSourceText(), a);
      var anchorBadge = a.anchor
        ? '<span style="font-size:10px;color:var(--text-muted);margin-left:4px">' + uiT('selBadge') + '</span>' : '';
      var staleBadge = stale ? '<span class="anno-stale-badge">' + uiT('staleBadge') + '</span>' : '';
      var toggleBtn = needsToggle
        ? ('<button type="button" class="anno-expand-toggle" data-id="' + escHtml(a.id) + '">' +
            (expanded ? uiT('annoCollapse') : uiT('annoExpand')) +
          '</button>')
        : '';

      html += '<div class="anno-item' + selCls + '" data-anno-id="' + escHtml(a.id) + '">' +
        '<div class="anno-meta">' +
        '<span style="border-left:3px solid ' + LEVEL_COLORS[a.level] + ';padding-left:4px;margin-right:8px"></span>' +
        uiT('linePrefix') + (a.line || '?') + anchorBadge + staleBadge + ' · ' +
        '<span style="color:' + LEVEL_COLORS[a.level] + ';font-weight:bold">' + a.level + '</span> · ' +
        '<span>' + a.status + '</span> · ' + (a.created_at || '').slice(0, 10) +
        '</div>' +
        '<div class="' + bodyCls + '">' + escHtml(full) + '</div>' +
        toggleBtn +
        '<div class="anno-tags">' +
        (a.tags || []).map(function (t) { return '<span class="anno-tag">' + escHtml(t) + '</span>'; }).join('') +
        '</div>' +
        '<div class="anno-actions">' +
        '<button class="btn-mini btn-edit" data-id="' + escHtml(a.id) + '">' + uiT('edit') + '</button>' +
        '<button class="btn-mini danger btn-del" data-id="' + escHtml(a.id) + '">' + uiT('del') + '</button>' +
        '</div></div>';
    }

    if (filtered.length === 0) html = '<div class="anno-empty">' + uiT('annoEmpty') + '</div>';

    annoListEl.innerHTML = html;
    if (addBtn) addBtn.disabled = !currentFilePath;
    if (clearAllBtn) {
      clearAllBtn.disabled = !currentFilePath || !annotations.length;
    }

    var items = annoListEl.querySelectorAll('[data-anno-id]');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        selectAnnotation(this.dataset.annoId, true);
      });
    }
    var toggles = annoListEl.querySelectorAll('.anno-expand-toggle');
    for (var t = 0; t < toggles.length; t++) {
      toggles[t].addEventListener('click', function (e) {
        e.stopPropagation();
        var aid = this.dataset.id;
        if (expandedAnnoIds[aid]) delete expandedAnnoIds[aid];
        else expandedAnnoIds[aid] = true;
        renderPanel();
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

  function saveDocumentForAnnotation() {
    return new Promise(function (resolve) {
      if (!dirty) {
        resolve(true);
        return;
      }
      if (!currentFilePath || docState !== 'open') {
        uiAlert(uiT('alertSaveBeforeAnnoFailed', { error: uiT('alertOpenDocFirst') }));
        resolve(false);
        return;
      }
      var content = getEditorSaveText();
      var bad = (api.findMalformedAnnotations && api.findMalformedAnnotations(content)) || [];
      if (bad.length) {
        var sep = (window.MDAI18n && MDAI18n.getLang() === 'en') ? ', ' : '、';
        uiAlert(uiT('alertMalformedAnno', { lines: bad.join(sep) }));
        resolve(false);
        return;
      }
      api.saveFile(currentFilePath, content).then(function (r) {
        if (!r.success) {
          uiAlert(uiT('alertSaveBeforeAnnoFailed', { error: r.error || uiT('unknownError') }));
          resolve(false);
          return;
        }
        currentText = content;
        setDirtyState(false);
        parseAndRender(content, currentFilePath);
        refreshEditorDecorations();
        resolve(true);
      });
    });
  }

  function withFreshDisk(action) {
    annoWriteQueue = annoWriteQueue
      .then(function () {
        var needSave = dirty;
        return saveDocumentForAnnotation().then(function (ok) {
          if (!ok) {
            annoWriteQueue = Promise.resolve();
            window.clearTimeout(annoAutoSaveToastTimer);
            annoAutoSaveToastTimer = 0;
            return null;
          }
          if (needSave) {
            if (!annoAutoSaveToastTimer) {
              showToast(uiT('toastAutoSavedForAnno'));
            }
            window.clearTimeout(annoAutoSaveToastTimer);
            annoAutoSaveToastTimer = window.setTimeout(function () {
              annoAutoSaveToastTimer = 0;
            }, 800);
          }
          return action();
        });
      })
      .catch(function () {
        annoWriteQueue = Promise.resolve();
      });
    return annoWriteQueue;
  }

  function editAnnotation(id) {
    var anno = findAnno(id);
    if (!anno) return;
    showEditDialog('edit', anno, null);
  }

  function clearAllAnnotationsInFile() {
    if (!currentFilePath || !annotations.length) return;
    uiConfirm(uiT('alertClearAllAnnos'), {
      preferCancel: true,
      okLabel: uiT('confirm'),
    }).then(function (yes) {
      if (!yes) return;
      if (!api.clearAllAnnotations) {
        uiAlert(uiT('alertClearAllFail', { error: uiT('unknownError') }));
        return;
      }
      withFreshDisk(function () {
        return api.clearAllAnnotations(currentFilePath).then(function (r) {
          if (!r || !r.success) {
            uiAlert(uiT('alertClearAllFail', { error: (r && r.error) || uiT('unknownError') }));
            return;
          }
          selectedAnnotationId = null;
          var n = typeof r.value === 'number' ? r.value : 0;
          showToast(uiT('toastClearAllOk', { count: n }));
          reloadFile();
        });
      });
    });
  }

  function showSettingsDialog(initialPane) {
    var existing = document.getElementById('settings-dialog');
    if (existing) {
      if (initialPane) switchSettingsPane(existing, initialPane);
      return;
    }
    settingsOpenPane = initialPane === 'pro' ? 'pro' : 'general';
    // 锁定菜单动作 / 窗口关闭（不卸载菜单栏）；构建失败必须解锁，否则菜单永久无响应
    if (api.setSettingsModal) api.setSettingsModal(true);
    var overlay = null;
    var licenseP = api.getLicenseStatus ? api.getLicenseStatus() : Promise.resolve({ success: true, value: {} });
    var aiP = api.getAiSettings ? api.getAiSettings() : Promise.resolve({ success: true, value: {} });
    Promise.all([licenseP, aiP]).then(function (pair) {
      var lic = (pair[0] && pair[0].success && pair[0].value) ? pair[0].value : {};
      var ai = (pair[1] && pair[1].success && pair[1].value) ? pair[1].value : {};
      buildSettingsDialog(lic, ai);
    }).catch(function (err) {
      if (api.setSettingsModal) api.setSettingsModal(false);
      uiAlert(uiT('alertSettingsFail', {
        error: (err && err.message) ? err.message : String(err),
      }));
    });

    function buildSettingsDialog(lic, ai) {
    try {
      var cur = autosavePref || 'off';
      var modes = [
        { id: 'off', label: uiT('autosaveModeOff') },
        { id: 'blur', label: uiT('autosaveModeBlur') },
        { id: 'interval:30', label: uiT('autosaveModeInterval30') },
        { id: 'interval:60', label: uiT('autosaveModeInterval60') },
      ];
      var options = modes.map(function (m) {
        return '<option value="' + m.id + '"' + (cur === m.id ? ' selected' : '') + '>' +
          escHtml(m.label) + '</option>';
      }).join('');
      var rememberOn = isRememberLayout();
      var sessionOn = isRememberSession();
      var mermaidW = mediaDefaultWidthPref || 'auto';
      var mermaidWidthModes = [
        { id: 'auto', label: uiT('settingsMermaidWidthAuto') },
        { id: '25', label: uiT('settingsMermaidWidthPct', { n: 25 }) },
        { id: '50', label: uiT('settingsMermaidWidthPct', { n: 50 }) },
        { id: '75', label: uiT('settingsMermaidWidthPct', { n: 75 }) },
      ];
      var mermaidWidthOptions = mermaidWidthModes.map(function (m) {
        return '<option value="' + m.id + '"' + (mermaidW === m.id ? ' selected' : '') + '>' +
          escHtml(m.label) + '</option>';
      }).join('');
      var revealW = liveRevealPref || 'block';
      var revealModes = [
        { id: 'block', label: uiT('settingsLiveRevealBlock') },
        { id: 'nearby', label: uiT('settingsLiveRevealNearby') },
        { id: 'never', label: uiT('settingsLiveRevealNever') },
      ];
      var liveRevealOptions = revealModes.map(function (m) {
        return '<option value="' + m.id + '"' + (revealW === m.id ? ' selected' : '') + '>' +
          escHtml(m.label) + '</option>';
      }).join('');

      var proHtml = (window.MDASettingsAi && window.MDASettingsAi.buildProPaneHtml)
        ? window.MDASettingsAi.buildProPaneHtml({ license: lic, ai: ai })
        : '';

      overlay = document.createElement('div');
      overlay.id = 'settings-dialog';
      overlay.className = 'modal-overlay mda-settings-overlay';
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML =
        '<div class="mda-settings-shell" role="dialog" aria-modal="true" aria-label="' +
          escHtml(uiT('settingsTitle')) + '">' +
          '<aside class="mda-settings-nav">' +
            '<div class="mda-settings-brand">' + escHtml(uiT('settingsTitle')) + '</div>' +
            '<button type="button" class="mda-settings-nav-item" data-pane="general">' +
              escHtml(uiT('settingsNavGeneral')) +
            '</button>' +
            '<button type="button" class="mda-settings-nav-item" data-pane="pro">' +
              escHtml(uiT('settingsNavPro')) +
            '</button>' +
          '</aside>' +
          '<div class="mda-settings-main">' +
            '<div class="mda-settings-body" data-pane-panel="general">' +
              '<h2 class="mda-settings-heading">' + escHtml(uiT('settingsNavGeneral')) + '</h2>' +
              '<div class="mda-settings-group">' +
                '<div class="mda-settings-row">' +
                  '<div class="mda-settings-row-text">' +
                    '<div class="mda-settings-row-title">' + escHtml(uiT('settingsAutosave')) + '</div>' +
                    '<div class="mda-settings-row-desc">' + escHtml(uiT('settingsAutosaveDesc')) + '</div>' +
                  '</div>' +
                  '<div class="mda-settings-row-ctrl">' +
                    '<select id="settings-autosave" class="mda-settings-select">' + options + '</select>' +
                  '</div>' +
                '</div>' +
                '<div class="mda-settings-row">' +
                  '<div class="mda-settings-row-text">' +
                    '<div class="mda-settings-row-title">' + escHtml(uiT('settingsMermaidWidth')) + '</div>' +
                    '<div class="mda-settings-row-desc">' + escHtml(uiT('settingsMermaidWidthDesc')) + '</div>' +
                  '</div>' +
                  '<div class="mda-settings-row-ctrl">' +
                    '<select id="settings-mermaid-width" class="mda-settings-select">' + mermaidWidthOptions + '</select>' +
                  '</div>' +
                '</div>' +
                '<div class="mda-settings-row">' +
                  '<div class="mda-settings-row-text">' +
                    '<div class="mda-settings-row-title">' + escHtml(uiT('settingsLiveReveal')) + '</div>' +
                    '<div class="mda-settings-row-desc">' + escHtml(uiT('settingsLiveRevealDesc')) + '</div>' +
                  '</div>' +
                  '<div class="mda-settings-row-ctrl">' +
                    '<select id="settings-live-reveal" class="mda-settings-select">' + liveRevealOptions + '</select>' +
                  '</div>' +
                '</div>' +
                '<div class="mda-settings-row">' +
                  '<div class="mda-settings-row-text">' +
                    '<div class="mda-settings-row-title">' + escHtml(uiT('settingsRememberSession')) + '</div>' +
                    '<div class="mda-settings-row-desc">' + escHtml(uiT('settingsRememberSessionDesc')) + '</div>' +
                  '</div>' +
                  '<div class="mda-settings-row-ctrl">' +
                    '<label class="mda-settings-switch" title="' + escHtml(uiT('settingsRememberSession')) + '">' +
                      '<input type="checkbox" id="settings-remember-session"' +
                        (sessionOn ? ' checked' : '') + ' />' +
                      '<span class="mda-settings-switch-track" aria-hidden="true"></span>' +
                    '</label>' +
                  '</div>' +
                '</div>' +
                '<div class="mda-settings-row">' +
                  '<div class="mda-settings-row-text">' +
                    '<div class="mda-settings-row-title">' + escHtml(uiT('settingsRememberLayout')) + '</div>' +
                    '<div class="mda-settings-row-desc">' + escHtml(uiT('settingsRememberLayoutDesc')) + '</div>' +
                  '</div>' +
                  '<div class="mda-settings-row-ctrl">' +
                    '<label class="mda-settings-switch" title="' + escHtml(uiT('settingsRememberLayout')) + '">' +
                      '<input type="checkbox" id="settings-remember-layout"' +
                        (rememberOn ? ' checked' : '') + ' />' +
                      '<span class="mda-settings-switch-track" aria-hidden="true"></span>' +
                    '</label>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            proHtml +
            '<div class="mda-settings-footer">' +
              '<button type="button" id="settings-cancel" class="mda-settings-btn">' + escHtml(uiT('settingsCancel')) + '</button>' +
              '<button type="button" id="settings-save" class="mda-settings-btn mda-settings-btn-primary">' +
                escHtml(uiT('settingsSave')) +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      function close() {
        if (overlay && overlay.isConnected) overlay.remove();
        if (api.setSettingsModal) api.setSettingsModal(false);
      }
      trapModalFocus(overlay, close);
      overlay.querySelector('#settings-cancel').addEventListener('click', close);
      overlay.querySelectorAll('.mda-settings-nav-item').forEach(function (btn) {
        btn.addEventListener('click', function () {
          switchSettingsPane(overlay, btn.getAttribute('data-pane') || 'general');
        });
      });
      if (window.MDASettingsAi && window.MDASettingsAi.wireProPane) {
        window.MDASettingsAi.wireProPane(overlay, {
          api: api,
          toast: showToast,
          alert: uiAlert,
          confirm: uiConfirm,
        });
      }
      switchSettingsPane(overlay, settingsOpenPane);
      overlay.querySelector('#settings-save').addEventListener('click', function () {
        var sel = overlay.querySelector('#settings-autosave');
        var mode = sel ? sel.value : 'off';
        var rem = overlay.querySelector('#settings-remember-layout');
        var nextRemember = !!(rem && rem.checked);
        var remSess = overlay.querySelector('#settings-remember-session');
        var nextSession = !!(remSess && remSess.checked);
        var mwSel = overlay.querySelector('#settings-mermaid-width');
        var nextMermaidW = mwSel ? mwSel.value : 'auto';
        var lrSel = overlay.querySelector('#settings-live-reveal');
        var nextReveal = lrSel ? lrSel.value : 'block';
        var rememberChanged = nextRemember !== isRememberLayout();
        var sessionChanged = nextSession !== isRememberSession();
        var mermaidChanged = nextMermaidW !== mediaDefaultWidthPref;
        var revealChanged = nextReveal !== liveRevealPref;
        var toastOther = !rememberChanged && !sessionChanged && !mermaidChanged && !revealChanged;
        applyAutosavePref(mode, { toast: toastOther, persist: true });
        applyMediaDefaultWidthPref(nextMermaidW, { reapply: true });
        applyLiveRevealPref(nextReveal, { toast: revealChanged });
        applyRememberLayoutPref(nextRemember, { toast: rememberChanged && !sessionChanged });
        applyRememberSessionPref(nextSession, { toast: sessionChanged });
        var aiPatch = window.MDASettingsAi && window.MDASettingsAi.collectAiSettingsPatch
          ? window.MDASettingsAi.collectAiSettingsPatch(overlay)
          : null;
        var finish = function () { close(); };
        if (aiPatch && api.saveAiSettings) {
          api.saveAiSettings(aiPatch).then(function (r) {
            if (!r || !r.success) {
              uiAlert(uiT('aiErrorGeneric', { error: (r && r.error) || '' }));
              return;
            }
            finish();
          });
        } else {
          finish();
        }
      });
      requestAnimationFrame(function () {
        var sel = overlay.querySelector('#settings-autosave');
        if (settingsOpenPane === 'pro') {
          var keyInput = overlay.querySelector('#settings-license-key');
          if (keyInput) keyInput.focus();
        } else if (sel) {
          sel.focus();
        }
      });
    } catch (err) {
      if (overlay && overlay.isConnected) overlay.remove();
      if (api.setSettingsModal) api.setSettingsModal(false);
      uiAlert(uiT('alertSettingsFail', {
        error: (err && err.message) ? err.message : String(err),
      }));
    }
    }
  }

  function switchSettingsPane(overlay, pane) {
    var id = pane === 'pro' ? 'pro' : 'general';
    settingsOpenPane = id;
    overlay.querySelectorAll('.mda-settings-nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-pane') === id);
    });
    overlay.querySelectorAll('[data-pane-panel]').forEach(function (panel) {
      var match = panel.getAttribute('data-pane-panel') === id;
      if (match) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    });
  }

  function deleteAnnotation(id) {
    uiConfirm(uiT('alertDelAnno')).then(function (yes) {
      if (!yes) return;
      withFreshDisk(function () {
        return api.removeAnnotation(currentFilePath, id).then(function (r) {
          if (r.success) {
            if (selectedAnnotationId === id) selectedAnnotationId = null;
            reloadFile();
          } else { uiAlert(uiT('alertDelFail', { error: r.error })); }
        });
      });
    });
  }

  function findAnno(id) {
    for (var i = 0; i < annotations.length; i++) { if (annotations[i].id === id) return annotations[i]; }
    return null;
  }

  // ---- DOM 弹窗 ----
  /** 将 Tab 循环限制在 overlay 内，避免焦点逃到源码编辑器触发缩进/改脏 */
  function trapModalFocus(overlay, onEscape) {
    var disposed = false;
    var removalObserver = null;

    function dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('keydown', onKey, true);
      if (removalObserver) removalObserver.disconnect();
      removalObserver = null;
    }

    function focusableList() {
      var nodes = overlay.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      var list = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
        list.push(el);
      }
      return list;
    }

    function onKey(e) {
      if (!overlay.isConnected) {
        dispose();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof onEscape === 'function') onEscape();
        return;
      }
      if (e.key !== 'Tab') return;

      var list = focusableList();
      if (!list.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      var first = list[0];
      var last = list[list.length - 1];
      var active = document.activeElement;
      var inside = overlay.contains(active);

      if (!inside) {
        e.preventDefault();
        e.stopImmediatePropagation();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          e.stopImmediatePropagation();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        e.stopImmediatePropagation();
        first.focus();
      }
    }

    // 用捕获阶段挂到 document：早于编辑器辅助键，且焦点已跑出框时仍能拦回
    document.addEventListener('keydown', onKey, true);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      removalObserver = new MutationObserver(function () {
        if (!overlay.isConnected) dispose();
      });
      removalObserver.observe(document.body, { childList: true, subtree: true });
    }
    return dispose;
  }

  function uiModal(message, withCancel, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      // 高于设置 / AI 面板，避免嵌套时提示框被挡住无法点「确定」
      overlay.className = 'modal-overlay mda-ui-modal';
      var preferCancel = !!(withCancel && opts.preferCancel);
      var okLabel = opts.okLabel || uiT('ok');
      var cancelLabel = opts.cancelLabel || uiT('cancel');
      var actionsHtml;
      if (!withCancel) {
        actionsHtml = '<button id="ui-ok" class="btn-ok">' + okLabel + '</button>';
      } else if (preferCancel) {
        // 破坏性操作：确认在左（次要），取消在右且为蓝色默认焦点
        actionsHtml =
          '<button id="ui-ok" class="btn-ghost">' + okLabel + '</button>' +
          '<button id="ui-cancel" class="btn-ok">' + cancelLabel + '</button>';
      } else {
        actionsHtml =
          '<button id="ui-cancel" class="btn-ghost">' + cancelLabel + '</button>' +
          '<button id="ui-ok" class="btn-ok">' + okLabel + '</button>';
      }
      overlay.innerHTML =
        '<div class="modal-box" style="min-width:280px;max-width:420px">' +
          '<div style="font-size:14px;margin-bottom:20px;line-height:1.6">' + escHtml(message) + '</div>' +
          '<div class="modal-actions">' + actionsHtml + '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      function close(val) { overlay.remove(); resolve(val); }
      trapModalFocus(overlay, function () { close(false); });
      overlay.querySelector('#ui-ok').addEventListener('click', function () { close(true); });
      var cancelBtn = overlay.querySelector('#ui-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', function () { close(false); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
      var focusEl = preferCancel && cancelBtn ? cancelBtn : overlay.querySelector('#ui-ok');
      if (focusEl) focusEl.focus();
    });
  }

  function uiConfirm(message, opts) { return uiModal(message, true, opts); }
  function uiAlert(message) { return uiModal(message, false); }

  function showHelpDialog() {
    if (document.getElementById('help-dialog')) return;
    var exts = (api.markdownExtensions || ['md', 'markdown', 'txt', 'mdc']).map(function (e) {
      return '.' + e;
    }).join(' / ');
    var overlay = document.createElement('div');
    overlay.id = 'help-dialog';
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box mda-help-box" role="dialog" aria-label="' +
        escHtml(uiT('helpTitle')) + '">' +
        '<h2 class="mda-help-title">' + uiT('helpTitle') + '</h2>' +
        '<div class="mda-help-body">' +
          (window.MDAI18n && MDAI18n.buildHelpHtml ? MDAI18n.buildHelpHtml(exts) : '') +
        '</div>' +
        '<div class="modal-actions"><button id="ui-help-ok" class="btn-ok">' + uiT('close') + '</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    trapModalFocus(overlay, close);
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
          '<div style="font-size:14px;margin-bottom:20px;line-height:1.6">' + uiT('alertCloseDirty') + '</div>' +
          '<div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">' +
            '<button id="ui-discard" class="btn-ghost">' + uiT('discard') + '</button>' +
            '<button id="ui-cancel" class="btn-ghost">' + uiT('cancel') + '</button>' +
            '<button id="ui-save" class="btn-ok">' + uiT('save') + '</button>' +
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
    var existing = document.getElementById('edit-dialog');
    if (existing) existing.remove();

    var isAdd = mode === 'add';
    var title = isAdd ? (pendingAnchor ? uiT('addSelAnno') : uiT('addAnno')) : uiT('editAnno');

    var overlay = document.createElement('div');
    overlay.id = 'edit-dialog';
    overlay.className = 'modal-overlay';

    var formHtml = '<div class="modal-box" style="width:440px"><h3>' + title + '</h3>';

    if (isAdd && pendingAnchor) {
      var quotePreview = pendingAnchor.quote || getSourceText().slice(pendingAnchor.start, pendingAnchor.end);
      formHtml += '<div class="modal-field"><label>' + uiT('labelQuote') + '</label>' +
        '<div style="font-size:12px;color:var(--text-muted);max-height:56px;overflow:auto;white-space:pre-wrap;border:1px solid var(--border-light);border-radius:4px;padding:6px 8px">' +
        escHtml(quotePreview) + '</div></div>';
    } else if (isAdd) {
      formHtml += '<div class="modal-field"><label>' + uiT('labelLine') + '</label>' +
        '<input id="ed-line" type="number" min="1" value="' + (defaultLine || '') + '"></div>';
    }

    formHtml +=
      '<div class="modal-field"><label>' + uiT('labelContent') + '</label>' +
        '<textarea id="ed-content" rows="3">' + (anno ? escHtml(anno.content) : '') + '</textarea></div>' +
      '<div class="modal-field"><label>' + uiT('labelTags') + '</label>' +
        '<input id="ed-tags" value="' + (anno ? (anno.tags || []).join(', ') : '') + '"></div>' +
      '<div style="display:flex;gap:12px" class="modal-field">' +
        '<div style="flex:1"><label>' + uiT('labelLevel') + '</label>' +
          '<select id="ed-level">' +
          '<option value="info"' + (anno && anno.level === 'info' ? ' selected' : '') + '>info</option>' +
          '<option value="minor"' + (anno && anno.level === 'minor' ? ' selected' : '') + '>minor</option>' +
          '<option value="major"' + (anno && anno.level === 'major' ? ' selected' : '') + '>major</option>' +
          '<option value="critical"' + (anno && anno.level === 'critical' ? ' selected' : '') + '>critical</option>' +
          '</select></div>';

    if (!isAdd) {
      formHtml +=
        '<div style="flex:1"><label>' + uiT('labelStatus') + '</label>' +
          '<select id="ed-status">' +
          '<option value="open"' + (anno && anno.status === 'open' ? ' selected' : '') + '>open</option>' +
          '<option value="resolved"' + (anno && anno.status === 'resolved' ? ' selected' : '') + '>resolved</option>' +
          '<option value="wontfix"' + (anno && anno.status === 'wontfix' ? ' selected' : '') + '>wontfix</option>' +
          '</select></div>';
    }

    formHtml += '</div>';
    formHtml +=
      '<div class="modal-actions">' +
      '<button id="ed-cancel" class="btn-ghost">' + uiT('cancel') + '</button>' +
      '<button id="ed-save" class="btn-ok">' + uiT('save') + '</button>' +
      '</div></div>';

    overlay.innerHTML = formHtml;
    document.body.appendChild(overlay);

    function closeEdit() { overlay.remove(); }
    trapModalFocus(overlay, closeEdit);

    document.getElementById('ed-cancel').addEventListener('click', closeEdit);
    document.getElementById('ed-save').addEventListener('click', function () {
      var content = document.getElementById('ed-content').value.trim();
      if (!content) { uiAlert(uiT('alertNeedAnnoContent')); return; }
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
          if (isNaN(line) || line < 1) { uiAlert(uiT('alertInvalidLine')); return; }
          doAdd(line, content, tags, level, null);
        }
      } else {
        var status = document.getElementById('ed-status').value;
        doEdit(anno.id, content, tags, level, status);
      }
      closeEdit();
    });

    // 点遮罩不关闭：避免误触丢失未保存的批注草稿（取消 / Esc 仍可关）
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
    withFreshDisk(function () {
      return api.addAnnotation(currentFilePath, line, input).then(function (r) {
        if (!r.success) { uiAlert(uiT('alertSaveFail', { error: r.error })); return; }
        var newId = r.value && r.value.id;
        reloadFile({ selectAnnoId: newId || null });
      });
    });
  }

  function doEdit(id, content, tags, level, status) {
    withFreshDisk(function () {
      return api.editAnnotation(currentFilePath, id, { content: content, tags: tags, level: level, status: status })
        .then(function (r) {
          if (!r.success) { uiAlert(uiT('alertSaveFail', { error: r.error })); return; }
          reloadFile({ selectAnnoId: id });
        });
    });
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  init();
})();

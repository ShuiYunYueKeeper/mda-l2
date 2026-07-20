// 渲染进程 i18n — 所有用户可见文案集中于此；新增 UI 必须同时补 zh + en。
(function (global) {
  var STRINGS = {
    zh: {
      tbFiles: '文件列表',
      tbFilesTitle: '文件列表 (Ctrl+\\)',
      tbEdit: '编辑',
      tbEditTitle: '编辑栏 (Ctrl+E)',
      tbPanel: '批注',
      tbPanelTitle: '批注栏 (Ctrl+B)',
      fsTitle: '文件列表',
      fsExpand: '展开文件列表 (Ctrl+\\)',
      fsCollapse: '收起文件列表 (Ctrl+\\)',
      fsRefresh: '刷新',
      fsClearList: '清空文件列表（不删除磁盘文件）',
      fsClearListConfirm: '清空文件列表？将关闭侧栏工作区，不会删除磁盘上的任何文件。',
      fsEmpty: '此文件夹中没有 Markdown 文件',
      fsNavHint: '↑↓ 切换 · Ctrl+C/X/V/Z/R · Delete',
      fsCopyName: '拷贝文件名',
      fsCopyFile: '复制',
      fsCutFile: '剪切',
      fsPasteFile: '粘贴',
      fsCopyFail: '复制失败：{error}',
      fsMoveFail: '移动失败：{error}',
      fsNothingToPaste: '剪贴板中没有文件',
      fsUndoEmpty: '没有可撤销的文件操作',
      fsUndoFail: '撤销失败：{error}',
      toastFsClipCopy: '已复制到剪贴板',
      toastFsClipCut: '已剪切到剪贴板',
      toastFsCopied: '已复制文件',
      toastFsMoved: '已移动文件',
      toastFsListCleared: '已清空文件列表',
      toastFsUndo: '已撤销',
      fsRename: '重命名',
      fsRenameTitle: '重命名文件',
      fsRenameExtHint: '扩展名保持不变，不可修改',
      fsRenameEmpty: '文件名不能为空',
      fsRenameInvalid: '文件名包含非法字符',
      fsRenameFail: '重命名失败：{error}',
      fsDelete: '删除',
      fsDeleteConfirm: '确认删除文件「{name}」？此操作不可撤销。',
      fsDeleteFail: '删除失败：{error}',
      fsConflictTitle: '文件已存在',
      fsConflictMsg: '目标位置已存在「{name}」，如何处理？',
      fsConflictOverwrite: '覆盖',
      fsConflictRename: '自动重命名',
      outlineTitle: '大纲',
      outlineCollapse: '收起',
      outlineExpand: '展开',
      outlineEmpty: '无标题',
      welcomeLead: '本地优先的 Markdown 工作台 — 预览 · 编辑 · 批注 · 文件',
      welcomePitch: '把 AI 产出的 .md 打开、看懂、轻改、批注，再导出或交给 Agent',
      welcomeNew: '新建文档',
      welcomeOpen: '打开文件',
      welcomeFolder: '打开文件夹',
      welcomeRecent: '最近打开',
      welcomeRecentEmpty: '暂无最近文件',
      btnAddAnno: '+ 添加批注',
      filterStatus: '状态',
      filterLevel: '级别',
      filterTags: '标签',
      annoEmpty: '无批注',
      annoExpand: '展开',
      annoCollapse: '收起',
      untitled: '未命名.md',
      editorPlaceholder: '在此编辑 Markdown 源码…',
      ok: '确定',
      cancel: '取消',
      close: '关闭',
      save: '保存',
      discard: '不保存',
      copy: '拷贝',
      copyAll: '拷贝全部',
      copyBtn: '复制',
      copied: '已复制',
      edit: '编辑',
      del: '删除',
      jump: '跳转',
      replace: '替换',
      replaceAll: '全部替换',
      findPlaceholder: '查找',
      replacePlaceholder: '替换为',
      findCase: '区分大小写',
      findRegex: '正则',
      findPrev: '上一个 (Shift+Enter)',
      findNext: '下一个 (Enter)',
      findClose: '关闭 (Esc)',
      findNoMatch: '无匹配',
      addAnno: '添加批注',
      addSelAnno: '添加选区批注',
      editAnno: '编辑批注',
      labelContent: '内容',
      labelTags: '标签（逗号分隔）',
      labelLevel: '级别',
      labelStatus: '状态',
      labelLine: '行号',
      labelQuote: '选中文本',
      linePrefix: '行',
      selBadge: '选区',
      staleBadge: '锚点失效',
      gotoTitle: '跳转到行',
      gotoPlaceholder: '行号',
      splitterHint: '拖动调整宽度，双击复位',
      zoomIn: '放大',
      zoomOut: '缩小',
      zoomReset: '复位',
      zoomClose: '关闭',
      zoomCopy: '复制',
      toastZoomCopiedImage: '已复制图片',
      toastZoomCopiedMermaid: '已复制流程图源码',
      alertZoomCopyFail: '复制失败: {error}',
      filenameCopyHint: '{name}（可选中后 Ctrl+C 拷贝）',
      toastNoCopy: '没有可拷贝的内容',
      toastCopied: '拷贝成功',
      alertOpenFileFirst: '请先打开一个文件',
      alertOpenDocFirst: '请先打开文档',
      alertNewOrOpen: '请先新建或打开文档',
      alertOpenFolderFirst: '请先打开文件夹（Ctrl+Alt+O）',
      alertInvalidLine: '请输入有效行号',
      alertNeedAnnoContent: '请输入批注内容',
      alertSelectCopy: '请先选中要拷贝的文本',
      alertSelectCodeCopy: '请先选中要拷贝的代码',
      alertSelectAnno: '请先选中文本再添加选区批注',
      alertSelectCodeAnno: '请先选中代码再添加选区批注',
      alertBadSelection: '无法识别选区',
      alertBadSelectionEditor: '无法识别选区，请尝试在源码编辑区选择',
      alertMdOnly: '仅支持打开 .md / .markdown / .txt / .mdc 文件',
      alertListFolderFail: '读取文件夹失败: {error}',
      alertSaveFail: '保存失败: {error}',
      alertOpenFail: '无法打开文件: {error}',
      alertRenderError: '渲染错误: {error}',
      alertDiscardDirty: '有未保存的修改，确定放弃吗？',
      alertCloseDirty: '有未保存的修改，是否在关闭前保存？',
      alertDelAnno: '确认删除此批注？',
      alertDelFail: '删除失败: {error}',
      alertDirtyAnno: '存在未保存的编辑，请先保存或撤销后再操作批注',
      alertMalformedAnno: '第 {lines} 行的批注格式不正确，将无法被识别为批注。仍要保存吗？',
      alertPreviewEmpty: '预览区尚无内容，请先打开 Markdown 文件',
      alertCopyEmpty: '复制失败: 剪贴板内容为空',
      alertCopyWechatOk: '已复制微信公众号格式到剪贴板，可直接粘贴到公众号编辑器。',
      alertCopyFail: '复制失败: {error}',
      alertExportOk: '已导出 {label}：{path}',
      alertExportFail: '导出失败: {error}',
      alertExportWriteFail: '导出失败: 写入未成功',
      alertExportNoWrite: '导出不可用：请重新构建并重启 GUI（缺少 writeTextFile）',
      alertExportNoPdf: '导出不可用：请重新构建并重启 GUI（缺少 exportPdf）',
      alertExportNoDocx: '导出不可用：请重新构建并重启 GUI（缺少 exportDocx）',
      toastAutosaveFail: '自动保存失败: {error}',
      toastAutosaveSkipMalformed: '存在格式异常的批注行，已跳过自动保存',
      toastAutosaveOn: '自动保存：{mode}',
      autosaveModeOff: '关闭',
      autosaveModeBlur: '失焦保存',
      autosaveModeInterval30: '每 30 秒',
      autosaveModeInterval60: '每 60 秒',
      unknownError: '未知错误',
      mermaidMissing: '流程图渲染失败: mermaid 未加载',
      mermaidFail: '流程图渲染失败: {error}',
      diagram: '流程图',
      diagramBracket: '[流程图]',
      diagramFailBracket: '[流程图渲染失败]',
      exportTimeout: '{label}超时（超过 {sec} 秒），请精简文档中的大图后重试',
      exportBusy: '正在导出…',
      exportBusyHint: '请稍候，大文档可能需要更长时间',
      exportBusyLabel: '正在导出 {label}…',
      exportBusyPrepare: '正在准备导出内容…',
      exportBusyPdf: '正在生成 PDF…',
      exportBusyWrite: '正在写入文件…',
      exportBusyImages: '正在导出…（内联图片 {cur}/{total}）',
      exportEmpty: '导出内容为空',
      exportHtmlTitle: '导出 HTML',
      exportPdfTitle: '导出 PDF',
      exportDocxTitle: '导出 Word',
      exportDefaultLabel: '导出',
      prepareLabel: '准备{label}',
      writeLabel: '写入{label}',
      helpTitle: 'MDA 功能与快捷键',
    },
    en: {
      tbFiles: 'Files',
      tbFilesTitle: 'File list (Ctrl+\\)',
      tbEdit: 'Edit',
      tbEditTitle: 'Editor pane (Ctrl+E)',
      tbPanel: 'Notes',
      tbPanelTitle: 'Annotation pane (Ctrl+B)',
      fsTitle: 'Files',
      fsExpand: 'Expand file list (Ctrl+\\)',
      fsCollapse: 'Collapse file list (Ctrl+\\)',
      fsRefresh: 'Refresh',
      fsClearList: 'Clear file list (does not delete files)',
      fsClearListConfirm: 'Clear the file list? The sidebar workspace will close; no files on disk will be deleted.',
      fsEmpty: 'No Markdown files in this folder',
      fsNavHint: '↑↓ switch · Ctrl+C/X/V/Z/R · Delete',
      fsCopyName: 'Copy filename',
      fsCopyFile: 'Copy',
      fsCutFile: 'Cut',
      fsPasteFile: 'Paste',
      fsCopyFail: 'Copy failed: {error}',
      fsMoveFail: 'Move failed: {error}',
      fsNothingToPaste: 'No file in clipboard',
      fsUndoEmpty: 'Nothing to undo',
      fsUndoFail: 'Undo failed: {error}',
      toastFsClipCopy: 'Copied to clipboard',
      toastFsClipCut: 'Cut to clipboard',
      toastFsCopied: 'File copied',
      toastFsMoved: 'File moved',
      toastFsListCleared: 'File list cleared',
      toastFsUndo: 'Undone',
      fsRename: 'Rename',
      fsRenameTitle: 'Rename file',
      fsRenameExtHint: 'Extension is fixed and cannot be changed',
      fsRenameEmpty: 'Filename cannot be empty',
      fsRenameInvalid: 'Filename contains invalid characters',
      fsRenameFail: 'Rename failed: {error}',
      fsDelete: 'Delete',
      fsDeleteConfirm: 'Delete "{name}"? This cannot be undone.',
      fsDeleteFail: 'Delete failed: {error}',
      fsConflictTitle: 'File already exists',
      fsConflictMsg: '"{name}" already exists at the destination. What would you like to do?',
      fsConflictOverwrite: 'Overwrite',
      fsConflictRename: 'Auto-rename',
      outlineTitle: 'Outline',
      outlineCollapse: 'Collapse',
      outlineExpand: 'Expand',
      outlineEmpty: 'No headings',
      welcomeLead: 'Local-first Markdown workspace — preview · edit · annotate · files',
      welcomePitch: 'Open AI-generated .md, skim, tweak, annotate — then export or hand off to an Agent',
      welcomeNew: 'New Document',
      welcomeOpen: 'Open File',
      welcomeFolder: 'Open Folder',
      welcomeRecent: 'Recent',
      welcomeRecentEmpty: 'No recent files',
      btnAddAnno: '+ Add note',
      filterStatus: 'Status',
      filterLevel: 'Level',
      filterTags: 'Tags',
      annoEmpty: 'No annotations',
      annoExpand: 'Show more',
      annoCollapse: 'Show less',
      untitled: 'Untitled.md',
      editorPlaceholder: 'Edit Markdown source…',
      ok: 'OK',
      cancel: 'Cancel',
      close: 'Close',
      save: 'Save',
      discard: 'Don\'t Save',
      copy: 'Copy',
      copyAll: 'Copy All',
      copyBtn: 'Copy',
      copied: 'Copied',
      edit: 'Edit',
      del: 'Delete',
      jump: 'Go',
      replace: 'Replace',
      replaceAll: 'Replace All',
      findPlaceholder: 'Find',
      replacePlaceholder: 'Replace with',
      findCase: 'Match case',
      findRegex: 'Regex',
      findPrev: 'Previous (Shift+Enter)',
      findNext: 'Next (Enter)',
      findClose: 'Close (Esc)',
      findNoMatch: 'No matches',
      addAnno: 'Add Annotation',
      addSelAnno: 'Add Selection Annotation',
      editAnno: 'Edit Annotation',
      labelContent: 'Content',
      labelTags: 'Tags (comma-separated)',
      labelLevel: 'Level',
      labelStatus: 'Status',
      labelLine: 'Line',
      labelQuote: 'Selected text',
      linePrefix: 'L',
      selBadge: 'sel',
      staleBadge: 'stale anchor',
      gotoTitle: 'Go to Line',
      gotoPlaceholder: 'Line number',
      splitterHint: 'Drag to resize, double-click to reset',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      zoomReset: 'Reset',
      zoomClose: 'Close',
      zoomCopy: 'Copy',
      toastZoomCopiedImage: 'Image copied',
      toastZoomCopiedMermaid: 'Mermaid source copied',
      alertZoomCopyFail: 'Copy failed: {error}',
      filenameCopyHint: '{name} (select then Ctrl+C to copy)',
      toastNoCopy: 'Nothing to copy',
      toastCopied: 'Copied',
      alertOpenFileFirst: 'Open a file first',
      alertOpenDocFirst: 'Open a document first',
      alertNewOrOpen: 'Create or open a document first',
      alertOpenFolderFirst: 'Open a folder first (Ctrl+Alt+O)',
      alertInvalidLine: 'Enter a valid line number',
      alertNeedAnnoContent: 'Enter annotation content',
      alertSelectCopy: 'Select text to copy first',
      alertSelectCodeCopy: 'Select code to copy first',
      alertSelectAnno: 'Select text before adding a selection annotation',
      alertSelectCodeAnno: 'Select code before adding a selection annotation',
      alertBadSelection: 'Could not resolve selection',
      alertBadSelectionEditor: 'Could not resolve selection; try selecting in the source editor',
      alertMdOnly: 'Only .md / .markdown / .txt / .mdc files are supported',
      alertListFolderFail: 'Failed to read folder: {error}',
      alertSaveFail: 'Save failed: {error}',
      alertOpenFail: 'Cannot open file: {error}',
      alertRenderError: 'Render error: {error}',
      alertDiscardDirty: 'You have unsaved changes. Discard them?',
      alertCloseDirty: 'You have unsaved changes. Save before closing?',
      alertDelAnno: 'Delete this annotation?',
      alertDelFail: 'Delete failed: {error}',
      alertDirtyAnno: 'Unsaved edits exist. Save or discard before changing annotations',
      alertMalformedAnno: 'Annotation format is invalid on line(s) {lines} and will not be recognized. Save anyway?',
      alertPreviewEmpty: 'Preview is empty. Open a Markdown file first',
      alertCopyEmpty: 'Copy failed: clipboard is empty',
      alertCopyWechatOk: 'Copied WeChat-ready rich text to the clipboard.',
      alertCopyFail: 'Copy failed: {error}',
      alertExportOk: 'Exported {label}: {path}',
      alertExportFail: 'Export failed: {error}',
      alertExportWriteFail: 'Export failed: write did not succeed',
      alertExportNoWrite: 'Export unavailable: rebuild and restart GUI (missing writeTextFile)',
      alertExportNoPdf: 'Export unavailable: rebuild and restart GUI (missing exportPdf)',
      alertExportNoDocx: 'Export unavailable: rebuild and restart GUI (missing exportDocx)',
      toastAutosaveFail: 'Auto-save failed: {error}',
      toastAutosaveSkipMalformed: 'Malformed annotation lines found; auto-save skipped',
      toastAutosaveOn: 'Auto-save: {mode}',
      autosaveModeOff: 'Off',
      autosaveModeBlur: 'On blur',
      autosaveModeInterval30: 'Every 30s',
      autosaveModeInterval60: 'Every 60s',
      unknownError: 'Unknown error',
      mermaidMissing: 'Diagram render failed: mermaid not loaded',
      mermaidFail: 'Diagram render failed: {error}',
      diagram: 'Diagram',
      diagramBracket: '[Diagram]',
      diagramFailBracket: '[Diagram render failed]',
      exportTimeout: '{label} timed out (>{sec}s). Reduce large images and retry',
      exportBusy: 'Exporting…',
      exportBusyHint: 'Please wait; large documents may take longer',
      exportBusyLabel: 'Exporting {label}…',
      exportBusyPrepare: 'Preparing export…',
      exportBusyPdf: 'Generating PDF…',
      exportBusyWrite: 'Writing file…',
      exportBusyImages: 'Exporting… (images {cur}/{total})',
      exportEmpty: 'Export content is empty',
      exportHtmlTitle: 'Export HTML',
      exportPdfTitle: 'Export PDF',
      exportDocxTitle: 'Export Word',
      exportDefaultLabel: 'Export',
      prepareLabel: 'Prepare {label}',
      writeLabel: 'Write {label}',
      helpTitle: 'MDA Features & Shortcuts',
    },
  };

  var lang = 'zh';

  function setLang(l) {
    lang = l === 'en' ? 'en' : 'zh';
  }

  function getLang() {
    return lang;
  }

  function t(key, vars) {
    var table = STRINGS[lang] || STRINGS.zh;
    var s = table[key] != null ? table[key] : (STRINGS.zh[key] || key);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      });
    }
    return s;
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 帮助正文 HTML（随语言切换）；exts 为已转义扩展名列表文案 */
  function buildHelpHtml(exts) {
    exts = escHtml(exts || '');
    if (lang === 'en') {
      return (
        '<p class="mda-help-lead">MDA is a local-first Markdown workspace: open .md natively, preview and lightly edit, keep structured annotations in git, with export and Agent (MCP) hooks.</p>' +
        '<h3>Supported files</h3>' +
        '<p>Open ' + exts + '; drag onto the window, use File → Open, the welcome page, or <code>mda path/to/file</code>.</p>' +
        '<h3>Files</h3>' +
        '<ul class="mda-help-list">' +
          '<li><kbd>Ctrl+N</kbd> new untitled document; first save opens Save As</li>' +
          '<li><kbd>Ctrl+Alt+O</kbd> open folder; left <strong>Files</strong> list; ✕ clears the list (closes workspace, does not delete files); drag edge to resize, double-click to reset; toolbar / ‹ / <kbd>Ctrl+\\</kbd> collapse; hover for full name; ↑↓ when list focused; <kbd>Ctrl+C/X/V/Z/R</kbd> copy/cut/paste/undo/rename; <kbd>Delete</kbd> delete file</li>' +
          '<li>Recent Files keeps the last 20 paths</li>' +
        '</ul>' +
        '<h3>Annotations</h3>' +
        '<ul class="mda-help-list">' +
          '<li>Left color bars show level (critical / major / minor / info)</li>' +
          '<li>Click preview ↔ annotation list for two-way locate</li>' +
          '<li>Filter by status / level / tags; add / edit / remove notes (body lines protected)</li>' +
          '<li>Annotation writes are disabled while source edits are unsaved</li>' +
        '</ul>' +
        '<h3>Edit &amp; preview</h3>' +
        '<ul class="mda-help-list">' +
          '<li>Preview-first; editor pane toggles independently; notes pane remembers last open/closed</li>' +
          '<li>Click to locate (no continuous scroll sync); <strong>outline on the left</strong> — click to jump, scroll preview to sync active heading; ‹ collapse, left rail button to expand</li>' +
          '<li>Syntax highlight + line numbers; <kbd>Ctrl+S</kbd> save; unsaved close prompts</li>' +
          '<li><kbd>Ctrl+F</kbd> find, <kbd>Ctrl+H</kbd> replace, <kbd>Ctrl+G</kbd> go to line</li>' +
          '<li><kbd>Ctrl+B/I/`</kbd> bold/italic/code; <kbd>Ctrl+Shift+]/[</kbd> heading level</li>' +
          '<li>Dark mode; relative images; Mermaid; KaTeX; click image/diagram to zoom — toolbar or Ctrl+C copies (image → clipboard image; diagram → Mermaid source)</li>' +
          '<li><strong>Copy preview</strong>: menu or <kbd>Ctrl+Shift+C</kbd> for WeChat-ready rich text</li>' +
          '<li><strong>Export</strong>: File → Export HTML / PDF / Word (progress UI; ~60s timeout)</li>' +
          '<li><strong>Auto-save</strong>: File → Auto Save — Off / On blur / Every 30s / Every 60s (saved files only; untitled never auto Save As)</li>' +
          '<li>Panes are resizable; double-click splitter to reset</li>' +
        '</ul>' +
        '<h3>CLI / MCP</h3>' +
        '<ul class="mda-help-list">' +
          '<li>CLI: <code>mda-cli scan/add/edit/remove</code> shares <code>@mda/core</code></li>' +
          '<li>MCP: <code>mda-mcp</code> (stdio) — six tools</li>' +
          '<li>See README; workspace via <code>--workspace</code> or <code>MDA_WORKSPACE</code></li>' +
        '</ul>' +
        '<h3>Shortcuts</h3>' +
        '<table class="mda-help-keys">' +
          '<tr><td>New</td><td><kbd>Ctrl+N</kbd></td></tr>' +
          '<tr><td>Open file</td><td><kbd>Ctrl+O</kbd></td></tr>' +
          '<tr><td>Open folder</td><td><kbd>Ctrl+Alt+O</kbd></td></tr>' +
          '<tr><td>Toggle file list</td><td><kbd>Ctrl+\\</kbd> / Files toolbar</td></tr>' +
          '<tr><td>Prev/next file in list</td><td><kbd>↑</kbd> / <kbd>↓</kbd> (list focused)</td></tr>' +
          '<tr><td>Find</td><td><kbd>Ctrl+F</kbd></td></tr>' +
          '<tr><td>Replace</td><td><kbd>Ctrl+H</kbd></td></tr>' +
          '<tr><td>Go to line</td><td><kbd>Ctrl+G</kbd></td></tr>' +
          '<tr><td>Bold / italic / code</td><td><kbd>Ctrl+B</kbd> / <kbd>Ctrl+I</kbd> / <kbd>Ctrl+`</kbd></td></tr>' +
          '<tr><td>Heading level</td><td><kbd>Ctrl+Shift+]</kbd> / <kbd>Ctrl+Shift+[</kbd></td></tr>' +
          '<tr><td>Save</td><td><kbd>Ctrl+S</kbd></td></tr>' +
          '<tr><td>Save As</td><td><kbd>Ctrl+Shift+S</kbd></td></tr>' +
          '<tr><td>Reload</td><td><kbd>Ctrl+R</kbd> (rename when file list focused)</td></tr>' +
          '<tr><td>Show in folder</td><td><kbd>Ctrl+Shift+O</kbd></td></tr>' +
          '<tr><td>Copy preview (WeChat)</td><td><kbd>Ctrl+Shift+C</kbd></td></tr>' +
          '<tr><td>Editor pane</td><td><kbd>Ctrl+E</kbd></td></tr>' +
          '<tr><td>Annotation pane (menu)</td><td><kbd>Ctrl+B</kbd></td></tr>' +
          '<tr><td>Move line</td><td><kbd>Alt+↑</kbd> / <kbd>Alt+↓</kbd></td></tr>' +
          '<tr><td>Duplicate line</td><td><kbd>Alt+Shift+↓</kbd></td></tr>' +
          '<tr><td>Indent / outdent</td><td><kbd>Tab</kbd> / <kbd>Shift+Tab</kbd></td></tr>' +
          '<tr><td>Dark mode</td><td><kbd>Ctrl+Shift+D</kbd></td></tr>' +
          '<tr><td>Check for updates</td><td>Help → Check for Updates</td></tr>' +
          '<tr><td>This help</td><td><kbd>F1</kbd></td></tr>' +
          '<tr><td>DevTools</td><td><kbd>F12</kbd></td></tr>' +
        '</table>' +
        '<p class="mda-help-note">In dialogs, <kbd>Tab</kbd> cycles inside the box; <kbd>Esc</kbd> closes.</p>'
      );
    }
    return (
      '<p class="mda-help-lead">MDA 是本地优先的 Markdown 工作台：原生打开 .md，预览与轻量编辑，结构化批注可进 git，并支持导出与 Agent（MCP）。</p>' +
      '<h3>支持的文件</h3>' +
      '<p>可打开 ' + exts + '；拖拽文件到窗口、菜单「文件 → 打开」、欢迎页或命令行 <code>mda path/to/file</code>。</p>' +
      '<h3>文件管理</h3>' +
      '<ul class="mda-help-list">' +
        '<li><kbd>Ctrl+N</kbd> 新建未命名文档；首次保存弹出另存为对话框</li>' +
        '<li><kbd>Ctrl+Alt+O</kbd> 打开文件夹，左侧<strong>文件列表</strong>列出 Markdown；标题栏 <kbd>✕</kbd> 清空列表（关闭工作区，不删磁盘文件）；右缘拖动手柄可调宽、双击复位；工具栏「文件列表」/ ‹ / <kbd>Ctrl+\\</kbd> 可收起；悬停显示全名；列表获焦后 <kbd>↑</kbd><kbd>↓</kbd> 切换文档；<kbd>Ctrl+C/X/V/Z/R</kbd> 复制/剪切/粘贴/撤销/重命名；<kbd>Delete</kbd> 删除文件</li>' +
        '<li>菜单「最近文件」记录最近打开的 20 个文件</li>' +
      '</ul>' +
      '<h3>批注</h3>' +
      '<ul class="mda-help-list">' +
        '<li>段落左侧色条表示批注级别（critical / major / minor / info）</li>' +
        '<li>点击预览段落 ↔ 点击批注列表，双向定位</li>' +
        '<li>按状态、级别、标签筛选；增 / 删 / 改批注（写操作保护正文，仅改批注行）</li>' +
        '<li>存在未保存的源码编辑时，批注写操作会暂时禁用</li>' +
      '</ul>' +
      '<h3>编辑与预览</h3>' +
      '<ul class="mda-help-list">' +
        '<li>布局：预览为主；编辑栏可独立开关；批注栏记住上次展开/收起</li>' +
        '<li>编辑↔预览<strong>点击定位</strong>（滚动互不跟随）；预览<strong>左侧大纲</strong>点击跳转，滚动预览时标题同步高亮；‹ 收起后左侧窄栏按钮展开</li>' +
        '<li>源码语法高亮 + 行号；<kbd>Ctrl+S</kbd> 保存；关闭时未保存会提示</li>' +
        '<li><kbd>Ctrl+F</kbd> 查找、<kbd>Ctrl+H</kbd> 替换、<kbd>Ctrl+G</kbd> 跳转到行</li>' +
        '<li><kbd>Ctrl+B/I/`</kbd> 粗体/斜体/代码；<kbd>Ctrl+Shift+]/[</kbd> 标题升降级</li>' +
        '<li>深色模式；相对路径图片；Mermaid 流程图；KaTeX 数学公式；点击图片/流程图可缩放，工具栏或 Ctrl+C 可复制（图片→剪贴板图片，流程图→Mermaid 源码）</li>' +
        '<li><strong>复制预览</strong>：菜单或 <kbd>Ctrl+Shift+C</kbd>，复制为微信公众号富文本（含内嵌图片与流程图）</li>' +
        '<li><strong>导出</strong>：菜单「文件 → 导出 HTML / PDF / Word」（导出会显示进度；大文档约 60s 超时）</li>' +
        '<li><strong>自动保存</strong>：菜单「文件 → 自动保存」— 关闭 / 失焦 / 每 30 秒 / 每 60 秒（仅已保存过的磁盘文件；未命名不自动另存）</li>' +
        '<li>分栏可拖拽调宽，双击分隔条复位</li>' +
      '</ul>' +
      '<h3>CLI / MCP</h3>' +
      '<ul class="mda-help-list">' +
        '<li>CLI：<code>mda-cli scan/add/edit/remove</code> 与 GUI 共用 <code>@mda/core</code></li>' +
        '<li>MCP：<code>mda-mcp</code>（stdio）；六 tools：<code>mda_scan</code> / <code>mda_add</code> / <code>mda_edit</code> / <code>mda_remove</code> / <code>mda_read_file</code> / <code>mda_export_review_prompt</code></li>' +
        '<li>配置见 README「MCP Server」；工作区 <code>--workspace</code> 或 <code>MDA_WORKSPACE</code></li>' +
      '</ul>' +
      '<h3>快捷键</h3>' +
      '<table class="mda-help-keys">' +
        '<tr><td>新建文档</td><td><kbd>Ctrl+N</kbd></td></tr>' +
        '<tr><td>打开文件</td><td><kbd>Ctrl+O</kbd></td></tr>' +
        '<tr><td>打开文件夹</td><td><kbd>Ctrl+Alt+O</kbd></td></tr>' +
        '<tr><td>收起/展开文件列表</td><td><kbd>Ctrl+\\</kbd> / 工具栏「文件列表」</td></tr>' +
        '<tr><td>文件列表上下切换文档</td><td><kbd>↑</kbd> / <kbd>↓</kbd>（列表获焦时）</td></tr>' +
        '<tr><td>查找</td><td><kbd>Ctrl+F</kbd></td></tr>' +
        '<tr><td>替换</td><td><kbd>Ctrl+H</kbd></td></tr>' +
        '<tr><td>跳转到行</td><td><kbd>Ctrl+G</kbd></td></tr>' +
        '<tr><td>粗体 / 斜体 / 代码（仅源码栏聚焦）</td><td><kbd>Ctrl+B</kbd> / <kbd>Ctrl+I</kbd> / <kbd>Ctrl+`</kbd></td></tr>' +
        '<tr><td>标题升降级</td><td><kbd>Ctrl+Shift+]</kbd> / <kbd>Ctrl+Shift+[</kbd></td></tr>' +
        '<tr><td>保存</td><td><kbd>Ctrl+S</kbd></td></tr>' +
        '<tr><td>另存为</td><td><kbd>Ctrl+Shift+S</kbd></td></tr>' +
        '<tr><td>重新加载</td><td><kbd>Ctrl+R</kbd>（文件列表获焦时为重命名）</td></tr>' +
        '<tr><td>打开文件所在目录</td><td><kbd>Ctrl+Shift+O</kbd></td></tr>' +
        '<tr><td>复制预览（微信公众号）</td><td><kbd>Ctrl+Shift+C</kbd></td></tr>' +
        '<tr><td>编辑栏</td><td><kbd>Ctrl+E</kbd></td></tr>' +
        '<tr><td>批注栏（菜单）</td><td><kbd>Ctrl+B</kbd></td></tr>' +
        '<tr><td>移动行</td><td><kbd>Alt+↑</kbd> / <kbd>Alt+↓</kbd></td></tr>' +
        '<tr><td>重复行</td><td><kbd>Alt+Shift+↓</kbd></td></tr>' +
        '<tr><td>缩进 / 反缩进</td><td><kbd>Tab</kbd> / <kbd>Shift+Tab</kbd></td></tr>' +
        '<tr><td>切换深色模式</td><td><kbd>Ctrl+Shift+D</kbd></td></tr>' +
        '<tr><td>检查更新</td><td>菜单「帮助 → 检查更新」</td></tr>' +
        '<tr><td>功能与快捷键（本页）</td><td><kbd>F1</kbd></td></tr>' +
        '<tr><td>开发者工具</td><td><kbd>F12</kbd></td></tr>' +
      '</table>' +
      '<p class="mda-help-note">批注/确认等弹窗内 <kbd>Tab</kbd> 仅在框内循环，<kbd>Esc</kbd> 可关闭；避免焦点落到源码区误改文件。</p>'
    );
  }

  global.MDAI18n = {
    setLang: setLang,
    getLang: getLang,
    t: t,
    buildHelpHtml: buildHelpHtml,
  };
})(window);

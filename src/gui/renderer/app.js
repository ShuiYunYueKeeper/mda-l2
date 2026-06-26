// MDA Renderer — Markdown 批注管理工具 GUI
// 通过 preload 获取 markdown-it 渲染 + 文件 I/O

(function () {
  var api = window.mdaAPI;
  var currentFilePath = null;
  var annotations = [];
  var paragraphs = [];
  var selectedAnnotationId = null;
  var cursorLine = null;
  var markdownContent = '';
  var htmlContent = '';

  var filterStatus = { open: true, resolved: true, wontfix: true };
  var filterLevel = { critical: true, major: true, minor: true, info: true };
  var filterTags = {};

  var LEVEL_COLORS = { critical: '#e74c3c', major: '#e67e22', minor: '#f1c40f', info: '#95a5a6' };
  var LEVEL_ORDER = { critical: 3, major: 2, minor: 1, info: 0 };

  // DOM 元素
  var previewEl, annoListEl, statusFiltersEl, levelFiltersEl, tagFiltersEl, tagFiltersRow;
  var previewPaneEl;

  var ANNO_REGEX = /^\[comment\]:\s*<>\s*\(@anno\s+(\{.+?\})\)\s*$/;
  var VALID_LEVELS = ['critical', 'major', 'minor', 'info'];
  var VALID_STATUSES = ['open', 'resolved', 'wontfix'];

  // ---- 初始化 ----
  function init() {
    buildLayout();
    api.onFileOpened(function (filePath) { openFile(filePath); });
    api.onReload(function () { if (currentFilePath) openFile(currentFilePath); });
    setTitle(null);
  }

  function buildLayout() {
    var root = document.getElementById('root');
    root.innerHTML =
      '<div id="preview-pane" style="flex:7;overflow:auto;padding:16px;border-right:1px solid #ddd">' +
        '<div id="preview-content" style="max-width:800px;margin:0 auto;line-height:1.7"></div>' +
      '</div>' +
      '<div id="panel-pane" style="flex:3;display:flex;flex-direction:column;overflow:hidden;min-width:280px;background:#fafafa">' +
        '<div style="padding:8px;border-bottom:1px solid #ddd;background:#fff">' +
          '<button id="btn-add" style="width:100%;padding:8px;cursor:pointer;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-size:14px" disabled>+ 添加批注</button>' +
        '</div>' +
        '<div style="padding:8px;border-bottom:1px solid #eee;font-size:12px;background:#fff">' +
          '<div style="margin-bottom:4px"><b>状态</b> <span id="status-filters"></span></div>' +
          '<div style="margin-bottom:4px"><b>级别</b> <span id="level-filters"></span></div>' +
          '<div id="tag-filters-row" style="display:none"><b>标签</b> <span id="tag-filters"></span></div>' +
        '</div>' +
        '<div id="anno-list" style="flex:1;overflow:auto"></div>' +
      '</div>';

    previewEl = document.getElementById('preview-content');
    previewPaneEl = document.getElementById('preview-pane');
    statusFiltersEl = document.getElementById('status-filters');
    levelFiltersEl = document.getElementById('level-filters');
    tagFiltersEl = document.getElementById('tag-filters');
    tagFiltersRow = document.getElementById('tag-filters-row');
    annoListEl = document.getElementById('anno-list');

    document.getElementById('btn-add').addEventListener('click', function () {
      showEditDialog('add', null, cursorLine);
    });
  }

  // ---- 文件操作 ----
  async function openFile(filePath) {
    var result = await api.readFile(filePath);
    if (!result.success) {
      alert('无法打开文件: ' + result.error);
      return;
    }
    currentFilePath = filePath;
    markdownContent = result.content;
    parseAndRender(result.content, filePath);
  }

  function setTitle(filePath) {
    if (filePath) {
      var name = filePath.replace(/\\/g, '/').split('/').pop();
      api.setTitle('MDA - ' + name);
    } else {
      api.setTitle('MDA');
    }
  }

  function reloadFile() {
    if (currentFilePath) openFile(currentFilePath);
  }

  function parseAndRender(text, filePath) {
    var parsed = parseAnnotations(text);
    annotations = parsed.annotations;
    paragraphs = parsed.paragraphs;
    // 设置 file 字段
    for (var i = 0; i < annotations.length; i++) {
      annotations[i].file = filePath || currentFilePath;
    }
    buildTagFilters();
    renderMarkdownContent(text);
    renderPanel();
  }

  // ---- 批注解析 ----
  function parseAnnotations(text) {
    var lines = text.split(/\r?\n/);
    var annotations = [];
    var paragraphs = [];
    var buffer = [];
    var state = 'blank';
    var currentParagraph = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var annoMatch = line.match(ANNO_REGEX);
      var isEmpty = line.trim() === '';

      if (annoMatch) {
        try {
          var anno = JSON.parse(annoMatch[1]);
          if (isAnnotation(anno)) {
            anno.line = i + 1;
            annotations.push(anno);
            buffer.push({ lineNumber: i + 1, annotation: anno });
          }
        } catch (e) { /* skip bad JSON */ }
      } else if (isEmpty) {
        if (state === 'paragraph' && currentParagraph) {
          currentParagraph.endLine = i;
          paragraphs.push(currentParagraph);
          currentParagraph = null;
        }
        state = 'blank';
      } else {
        if (state === 'blank') {
          currentParagraph = { startLine: i + 1, endLine: i + 1, text: line, annotations: [] };
          state = 'paragraph';
        } else if (currentParagraph) {
          currentParagraph.endLine = i + 1;
          currentParagraph.text += '\n' + line;
        }
        if (currentParagraph) {
          for (var b = 0; b < buffer.length; b++) {
            currentParagraph.annotations.push(buffer[b].annotation);
          }
          buffer.length = 0;
        }
      }
    }
    if (currentParagraph) paragraphs.push(currentParagraph);
    return { annotations: annotations, paragraphs: paragraphs };
  }

  function isAnnotation(obj) {
    return typeof obj === 'object' && obj !== null &&
      typeof obj.id === 'string' &&
      typeof obj.content === 'string' &&
      Array.isArray(obj.tags) && obj.tags.every(function (t) { return typeof t === 'string'; }) &&
      VALID_LEVELS.indexOf(obj.level) !== -1 &&
      VALID_STATUSES.indexOf(obj.status) !== -1 &&
      typeof obj.created_at === 'string';
  }

  // ---- Markdown 渲染 ----
  function renderMarkdownContent(text) {
    var result = api.renderMarkdown(text);
    if (result.success) {
      htmlContent = result.html;
      previewEl.innerHTML = htmlContent;

      // 图片 fallback (MutationObserver 兜底)
      setupImageFallback();

      // Ctrl+点击链接
      setupLinkHandler();
    } else {
      previewEl.innerHTML = '<p style="color:#e74c3c">渲染错误: ' + escHtml(result.error) + '</p>';
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
          if (next && next.classList.contains('md-image-alt')) {
            next.style.display = 'inline';
          }
        });
      })(imgs[i]);
    }
  }

  function setupLinkHandler() {
    // 事件委托已在 previewPaneEl 上设置（见下方）
  }

  // Ctrl+点击链接
  previewPaneEl && previewPaneEl.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (a && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      var href = a.getAttribute('href');
      if (href) api.openExternal(href);
    }
    // 记录点击段落行号
    if (!a && !e.target.closest('button')) {
      // 简单记录
      cursorLine = null;
    }
  });

  // ---- 批注面板 ----
  function buildTagFilters() {
    var allTags = {};
    for (var i = 0; i < annotations.length; i++) {
      var tags = annotations[i].tags || [];
      for (var t = 0; t < tags.length; t++) {
        allTags[tags[t]] = true;
      }
    }
    filterTags = {};
    var keys = Object.keys(allTags).sort();
    for (var k = 0; k < keys.length; k++) {
      filterTags[keys[k]] = true;
    }
  }

  function renderTagFilterUI() {
    var keys = Object.keys(filterTags).sort();
    if (keys.length === 0) {
      tagFiltersRow.style.display = 'none';
      return;
    }
    tagFiltersRow.style.display = '';
    var html = '';
    for (var k = 0; k < keys.length; k++) {
      var c = filterTags[keys[k]] ? 'checked' : '';
      html += '<label style="margin-right:8px;cursor:pointer;font-size:11px">' +
        '<input type="checkbox" ' + c + ' data-tag="' + escHtml(keys[k]) + '">' + escHtml(keys[k]) + '</label>';
    }
    tagFiltersEl.innerHTML = html;

    // 绑定事件
    var cbs = tagFiltersEl.querySelectorAll('input[type=checkbox]');
    for (var c = 0; c < cbs.length; c++) {
      cbs[c].addEventListener('change', function () {
        filterTags[this.dataset.tag] = this.checked;
        renderPanel();
      });
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
      cbs[c].addEventListener('change', function () {
        filterStatus[this.dataset.status] = this.checked;
        renderPanel();
      });
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
      cbs[c].addEventListener('change', function () {
        filterLevel[this.dataset.level] = this.checked;
        renderPanel();
      });
    }
  }

  function getFilteredAnnotations() {
    return annotations.filter(function (a) {
      if (!filterStatus[a.status]) return false;
      if (!filterLevel[a.level]) return false;
      if (a.tags.length > 0 && Object.keys(filterTags).length > 0) {
        var hasTag = false;
        for (var t = 0; t < a.tags.length; t++) {
          if (filterTags[a.tags[t]]) { hasTag = true; break; }
        }
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
      var selected = a.id === selectedAnnotationId;
      var bg = selected ? '#e8f0fe' : (i % 2 === 0 ? '#fff' : '#fafafa');
      var content = (a.content || '').length > 50 ? a.content.slice(0, 50) + '…' : (a.content || '');

      html += '<div style="padding:10px 8px;border-bottom:1px solid #eee;background:' + bg + ';cursor:pointer"' +
        ' data-anno-id="' + escHtml(a.id) + '">' +
        '<div style="font-size:11px;color:#888;margin-bottom:4px">' +
        '<span style="border-left:3px solid ' + LEVEL_COLORS[a.level] + ';padding-left:4px;margin-right:8px"></span>' +
        '行' + (a.line || '?') + ' · ' +
        '<span style="color:' + LEVEL_COLORS[a.level] + ';font-weight:bold">' + a.level + '</span> · ' +
        '<span>' + a.status + '</span> · ' +
        (a.created_at || '').slice(0, 10) +
        '</div>' +
        '<div style="margin-bottom:6px;font-size:13px">' + escHtml(content) + '</div>' +
        '<div style="margin-bottom:6px">' +
        (a.tags || []).map(function (t) {
          return '<span style="background:#e8e8e8;border-radius:3px;padding:2px 6px;font-size:11px;margin-right:4px">' + escHtml(t) + '</span>';
        }).join('') +
        '</div>' +
        '<div style="text-align:right">' +
        '<button class="btn-edit" data-id="' + escHtml(a.id) + '" style="font-size:11px;padding:3px 8px;cursor:pointer;border:1px solid #ccc;border-radius:3px;background:#fff;margin-right:4px">编辑</button>' +
        '<button class="btn-del" data-id="' + escHtml(a.id) + '" style="font-size:11px;padding:3px 8px;cursor:pointer;border:1px solid #e74c3c;border-radius:3px;background:#fff;color:#e74c3c">删除</button>' +
        '</div></div>';
    }

    if (filtered.length === 0) {
      html = '<div style="padding:24px;color:#999;text-align:center;font-size:13px">无批注</div>';
    }

    annoListEl.innerHTML = html;
    document.getElementById('btn-add').disabled = !currentFilePath;

    // 绑定事件
    var items = annoListEl.querySelectorAll('[data-anno-id]');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', function (e) {
        if (e.target.closest('button')) return; // 按钮由下方处理
        selectedAnnotationId = this.dataset.annoId;
        renderPanel();
      });
    }

    var edits = annoListEl.querySelectorAll('.btn-edit');
    for (var e = 0; e < edits.length; e++) {
      edits[e].addEventListener('click', function (e) {
        e.stopPropagation();
        editAnnotation(this.dataset.id);
      });
    }

    var dels = annoListEl.querySelectorAll('.btn-del');
    for (var d = 0; d < dels.length; d++) {
      dels[d].addEventListener('click', function (e) {
        e.stopPropagation();
        deleteAnnotation(this.dataset.id);
      });
    }
  }

  function editAnnotation(id) {
    var anno = findAnno(id);
    if (!anno) return;
    showEditDialog('edit', anno, null);
  }

  function deleteAnnotation(id) {
    if (!confirm('确认删除此批注？')) return;
    var anno = findAnno(id);
    if (!anno) return;

    var lines = markdownContent.split(/\r?\n/);
    var idx = (anno.line || 0) - 1;
    if (idx >= 0 && idx < lines.length && lines[idx].match(ANNO_REGEX)) {
      lines.splice(idx, 1);
      // 空行压缩
      if (idx > 0 && idx < lines.length && lines[idx - 1].trim() === '' && lines[idx].trim() === '') {
        lines.splice(idx, 1);
      }
    }

    writeBack(lines);
  }

  function findAnno(id) {
    for (var i = 0; i < annotations.length; i++) {
      if (annotations[i].id === id) return annotations[i];
    }
    return null;
  }

  function writeBack(lines) {
    var newContent = lines.join('\n');
    api.writeFile(currentFilePath, newContent).then(function (r) {
      if (r.success) {
        markdownContent = newContent;
        parseAndRender(newContent, currentFilePath);
      } else {
        alert('写回失败: ' + r.error);
      }
    });
  }

  // ---- 编辑/添加弹窗 ----
  function showEditDialog(mode, anno, defaultLine) {
    var existing = document.getElementById('edit-dialog');
    if (existing) existing.remove();

    var isAdd = mode === 'add';
    var title = isAdd ? '添加批注' : '编辑批注';

    var overlay = document.createElement('div');
    overlay.id = 'edit-dialog';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;justify-content:center;align-items:center;z-index:1000';

    var formHtml =
      '<div style="background:#fff;border-radius:8px;padding:24px;width:440px;box-shadow:0 4px 16px rgba(0,0,0,0.2)">' +
      '<h3 style="margin:0 0 16px;font-size:16px">' + title + '</h3>';

    if (isAdd) {
      formHtml += '<div style="margin-bottom:12px"><label style="font-size:12px;color:#555">行号</label><br>' +
        '<input id="ed-line" type="number" min="1" value="' + (defaultLine || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;margin-top:4px"></div>';
    }

    formHtml +=
      '<div style="margin-bottom:12px"><label style="font-size:12px;color:#555">内容</label><br>' +
        '<textarea id="ed-content" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;margin-top:4px;resize:vertical">' + (anno ? escHtml(anno.content) : '') + '</textarea></div>' +
      '<div style="margin-bottom:12px"><label style="font-size:12px;color:#555">标签（逗号分隔）</label><br>' +
        '<input id="ed-tags" value="' + (anno ? (anno.tags || []).join(', ') : '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;margin-top:4px"></div>' +
      '<div style="display:flex;gap:12px;margin-bottom:12px">' +
        '<div style="flex:1"><label style="font-size:12px;color:#555">级别</label><br>' +
          '<select id="ed-level" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;margin-top:4px">' +
          '<option value="info"' + (anno && anno.level === 'info' ? ' selected' : '') + '>info</option>' +
          '<option value="minor"' + (anno && anno.level === 'minor' ? ' selected' : '') + '>minor</option>' +
          '<option value="major"' + (anno && anno.level === 'major' ? ' selected' : '') + '>major</option>' +
          '<option value="critical"' + (anno && anno.level === 'critical' ? ' selected' : '') + '>critical</option>' +
          '</select></div>';

    if (!isAdd) {
      formHtml +=
        '<div style="flex:1"><label style="font-size:12px;color:#555">状态</label><br>' +
          '<select id="ed-status" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;margin-top:4px">' +
          '<option value="open"' + (anno && anno.status === 'open' ? ' selected' : '') + '>open</option>' +
          '<option value="resolved"' + (anno && anno.status === 'resolved' ? ' selected' : '') + '>resolved</option>' +
          '<option value="wontfix"' + (anno && anno.status === 'wontfix' ? ' selected' : '') + '>wontfix</option>' +
          '</select></div>';
    }

    formHtml += '</div>';

    formHtml +=
      '<div style="text-align:right;margin-top:16px">' +
      '<button id="ed-cancel" style="padding:8px 20px;margin-right:8px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#fff;font-size:13px">取消</button>' +
      '<button id="ed-save" style="padding:8px 20px;cursor:pointer;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-size:13px">保存</button>' +
      '</div></div>';

    overlay.innerHTML = formHtml;
    document.body.appendChild(overlay);

    document.getElementById('ed-cancel').addEventListener('click', function () { overlay.remove(); });
    document.getElementById('ed-save').addEventListener('click', function () {
      var content = document.getElementById('ed-content').value.trim();
      if (!content) { alert('请输入批注内容'); return; }
      var tags = document.getElementById('ed-tags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
      var level = document.getElementById('ed-level').value;

      if (isAdd) {
        var line = parseInt(document.getElementById('ed-line').value, 10);
        if (isNaN(line) || line < 1) { alert('请输入有效行号'); return; }
        doAdd(line, content, tags, level);
      } else {
        var status = document.getElementById('ed-status').value;
        doEdit(anno.id, content, tags, level, status);
      }
      overlay.remove();
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  function doAdd(line, content, tags, level) {
    var lines = markdownContent.split(/\r?\n/);
    var para = findParagraph(line);
    if (!para) { alert('未找到第 ' + line + ' 行所属的段落'); return; }

    var anno = {
      id: generateUUID(),
      content: content,
      tags: tags,
      level: level,
      status: 'open',
      created_at: new Date().toISOString()
    };
    var annoLine = '[comment]: <> (@anno ' + JSON.stringify(anno) + ')';
    var insertIdx = para.startLine - 1; // 0-based, 段落首行上方
    lines.splice(insertIdx, 0, annoLine);

    writeBack(lines);
  }

  function doEdit(id, content, tags, level, status) {
    var lines = markdownContent.split(/\r?\n/);
    var anno = findAnno(id);
    if (!anno) { alert('未找到批注'); return; }

    var idx = (anno.line || 0) - 1;
    var updated = {
      id: anno.id,
      content: content,
      tags: tags,
      level: level,
      status: status,
      created_at: anno.created_at
    };
    var newLine = '[comment]: <> (@anno ' + JSON.stringify(updated) + ')';
    if (idx >= 0 && idx < lines.length && lines[idx].match(ANNO_REGEX)) {
      lines[idx] = newLine;
      writeBack(lines);
    } else {
      alert('批注行位置异常');
    }
  }

  function findParagraph(line) {
    for (var i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].startLine <= line && line <= paragraphs[i].endLine) return paragraphs[i];
    }
    return null;
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 启动
  init();
})();

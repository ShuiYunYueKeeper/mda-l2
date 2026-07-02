const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
// 复用编译后的 @mda/core（dist/core），消除 GUI 与核心库的重复实现。
// 需 sandbox: false 才能在 preload 中 require 第三方/本地模块。
const core = require('../core');
const hljs = require('highlight.js');

// markdown-it 实例直接复用 core 的配置（CommonMark + GFM + 图片 fallback），
// 仅在此叠加 GUI 专用的源码行号注入（data-line）与代码高亮，供点击定位段落
// 与语法高亮使用（均为 GUI 专属，不污染 core.renderer，保证渲染等价性测试）。
const md = core.createMarkdownIt();

// GUI 专属：代码块语法高亮（highlight.js）。core.renderMarkdown 用的是各自实例，
// 此处仅作用于 GUI 的 md，不影响 renderer.test.ts 的“去批注后渲染等价”断言。
md.set({
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      } catch (e) { /* 回退到默认转义 */ }
    }
    return '';
  },
});

function injectLineNumbers(tokens, idx, options, slf) {
  const token = tokens[idx];
  if (token.map && token.level === 0) {
    token.attrSet('data-line', String(token.map[0] + 1));
  }
  return slf.renderToken(tokens, idx, options);
}
['paragraph_open', 'heading_open', 'blockquote_open', 'bullet_list_open', 'ordered_list_open', 'table_open'].forEach(function (rule) {
  md.renderer.rules[rule] = function (tokens, idx, options, env, slf) {
    return injectLineNumbers(tokens, idx, options, slf);
  };
});

function ok(value) {
  return { success: true, value: value };
}
function fail(err) {
  return { success: false, error: (err && err.message) || String(err) };
}

// “疑似批注行”识别（宽松）：只要出现 `<> (@anno` 这一批注专属标记即视为批注意图，
// 允许 `[comment]` 的方括号缺失、JSON 残缺等编辑中/被改坏的情况。用于：
//   1) 预览渲染前把这些行清空 → 残缺/被改坏的批注不会泄漏到预览；
//   2) 保存前校验 → 疑似批注但不符合严格格式的行给出提示。
// 围栏代码块内的批注样例是字面文本，一律排除。
const ANNO_ISH = /^\s{0,3}\[?\s*comment\s*\]?\s*:\s*<>\s*\(\s*@anno\b/;

// GUI 预览容错隐藏：core 的严格正则要求批注行含完整 JSON 且以 `)` 结尾，
// 用户在源码栏编辑时一旦改坏格式，该行既无法被解析为批注、又会泄漏到预览。
// 这里在渲染前把“围栏外、疑似批注”的任意行清空（保留行数不变），使残缺/正在
// 编辑/被改坏的批注行都不会出现在预览中。围栏内的批注样例仍原样保留。
function hideLooseAnnotations(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const mask = core.buildCodeFenceMask(lines);
  return lines.map((l, i) => (!mask[i] && ANNO_ISH.test(l) ? '' : l)).join('\n');
}

// 检测“疑似批注但格式不正确”的行号（1-based）。规则：围栏外、命中 ANNO_ISH，
// 但不满足严格批注（正则不匹配 / JSON 解析失败）。用于保存前提示用户。
function findMalformedAnnotations(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const mask = core.buildCodeFenceMask(lines);
  const bad = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const line = lines[i];
    if (!ANNO_ISH.test(line)) continue;
    const m = line.match(core.ANNO_REGEX);
    let valid = false;
    if (m) {
      try { JSON.parse(m[1]); valid = true; } catch (e) { valid = false; }
    }
    if (!valid) bad.push(i + 1);
  }
  return bad;
}

contextBridge.exposeInMainWorld('mdaAPI', {
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-clipboard', text),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  // 将链接 href 相对当前文件所在目录解析为绝对路径（供相对 .md 链接跳转用）
  resolvePath: (baseFile, href) => {
    try {
      return path.resolve(path.dirname(baseFile), href);
    } catch (e) {
      return null;
    }
  },
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (_event, filePath) => callback(filePath));
  },
  onReload: (callback) => {
    ipcRenderer.on('reload', () => callback());
  },
  onMenuShowInFolder: (callback) => {
    ipcRenderer.on('menu-show-in-folder', () => callback());
  },
  onMenuToggleTheme: (callback) => {
    ipcRenderer.on('menu-toggle-theme', () => callback());
  },
  onMenuToggleEdit: (callback) => {
    ipcRenderer.on('menu-toggle-edit', () => callback());
  },
  onMenuTogglePanel: (callback) => {
    ipcRenderer.on('menu-toggle-panel', () => callback());
  },
  onMenuSave: (callback) => {
    ipcRenderer.on('menu-save', () => callback());
  },
  onAppCloseRequest: (callback) => {
    ipcRenderer.on('app-close-request', () => callback());
  },
  setDirty: (dirty) => ipcRenderer.send('set-dirty', !!dirty),
  confirmClose: () => ipcRenderer.send('confirm-close'),

  // 级别配色 / 严重度优先级（来源于 src/config/annotation-schema.json，经 core 暴露）
  levelColors: core.LEVEL_COLORS,
  levelSeverity: core.LEVEL_SEVERITY,

  // ---- 复用 @mda/core ----
  parseAnnotations: (text) => core.parseAnnotations(text),
  renderMarkdown: (text) => {
    try {
      return { success: true, html: core.renderMarkdown(md, hideLooseAnnotations(text)) };
    } catch (err) {
      return fail(err);
    }
  },
  addAnnotation: (filePath, line, input) =>
    core.addAnnotation(filePath, line, input).then(ok, fail),
  editAnnotation: (filePath, id, patch) =>
    core.editAnnotation(filePath, id, patch).then(ok, fail),
  removeAnnotation: (filePath, id) =>
    core.removeAnnotation(filePath, id).then(() => ok(null), fail),

  // 整篇源码保存（编辑模式用）：走 core 原子写入 + 保留原换行风格
  saveFile: (filePath, content) =>
    core.writeRawFile(filePath, content).then(() => ok(null), fail),

  // 保存前校验：返回疑似批注但格式不正确的行号数组（供渲染层提示用户）
  findMalformedAnnotations: (text) => findMalformedAnnotations(text),

  // 源码编辑器语法高亮：自定义 Markdown 行级着色（标题整行含 CJK 全覆盖，`#` 暗色），
  // 围栏内代码块仍用 hljs；失败时回退为转义纯文本。
  highlightSource: (code) => {
    try {
      return highlightMarkdownSource(code);
    } catch (e) {
      return escHtml(code);
    }
  },
});

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 编辑器专用 Markdown 高亮（不依赖 hljs markdown 语法，避免标题中英文混排只亮一半）
function highlightMarkdownSource(text) {
  // 不删 BOM：textarea 的 value 保留 BOM，高亮层必须与之严格 1:1（否则字符偏移错开一位→光标错位）。
  // BOM 零宽不影响可见宽度；仅在 highlightMdLine 里对行首 BOM 单独剥离用于正则识别、再原样拼回。
  const lines = text.split(/\r?\n/);
  const fenceMask = core.buildCodeFenceMask(lines);
  const out = [];
  let fenceLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!fenceMask[i]) {
      fenceLang = '';
      out.push(highlightMdLine(line));
      continue;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(\S*)/);
    if (open) {
      fenceLang = (open[2] || '').trim();
      out.push('<span class="mda-hl-mark">' + escHtml(line) + '</span>');
      continue;
    }
    if (/^ {0,3}(`{3,}|~{3,})\s*$/.test(line)) {
      out.push('<span class="mda-hl-mark">' + escHtml(line) + '</span>');
      fenceLang = '';
      continue;
    }
    if (fenceLang && hljs.getLanguage(fenceLang)) {
      try {
        out.push(hljs.highlight(line, { language: fenceLang, ignoreIllegals: true }).value);
      } catch (e) {
        out.push('<span class="mda-hl-code">' + escHtml(line) + '</span>');
      }
    } else {
      out.push('<span class="mda-hl-code">' + escHtml(line) + '</span>');
    }
  }
  return out.join('\n');
}

function highlightMdLine(line) {
  // 行首 BOM 单独剥离用于正则识别，最后原样拼回，保证输出字符数与源码行一致
  let bom = '';
  if (line.charCodeAt(0) === 0xFEFF) { bom = '\uFEFF'; line = line.slice(1); }
  return bom + highlightMdLineBody(line);
}

function highlightMdLineBody(line) {
  // ATX 标题：# 暗色，标题正文整行高亮（含中文/符号）
  const hm = line.match(/^( {0,3})(#{1,6})(\s+)(.*)$/);
  if (hm) {
    return escHtml(hm[1]) +
      '<span class="mda-hl-mark">' + escHtml(hm[2]) + '</span>' +
      escHtml(hm[3]) +
      '<span class="mda-hl-heading">' + highlightMdInline(hm[4]) + '</span>';
  }
  // 批注行（宽松识别）整体暗色
  if (/^\s{0,3}\[?\s*comment\s*\]?\s*:\s*<>\s*\(\s*@anno\b/.test(line)) {
    return '<span class="mda-hl-mark">' + escHtml(line) + '</span>';
  }
  // 引用 >
  const bq = line.match(/^( {0,3})(>+)( ?)(.*)$/);
  if (bq) {
    return escHtml(bq[1]) +
      '<span class="mda-hl-mark">' + escHtml(bq[2]) + '</span>' +
      escHtml(bq[3]) +
      '<span class="mda-hl-quote">' + highlightMdInline(bq[4]) + '</span>';
  }
  // 列表 - * 1.
  const lm = line.match(/^( {0,3})([-*+]|\d+\.)( +)(.*)$/);
  if (lm) {
    return escHtml(lm[1]) +
      '<span class="mda-hl-mark">' + escHtml(lm[2]) + '</span>' +
      escHtml(lm[3]) +
      highlightMdInline(lm[4]);
  }
  // 水平线
  if (/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
    return '<span class="mda-hl-mark">' + escHtml(line) + '</span>';
  }
  return highlightMdInline(line);
}

function highlightMdInline(line) {
  const escaped = escHtml(line);
  return escaped
    .replace(/(`[^`]*`)/g, '<span class="mda-hl-code">$1</span>')
    .replace(/(\*\*[^*]+\*\*)/g, '<span class="mda-hl-strong">$1</span>')
    .replace(/(\[[^\]]*\]\([^)]*\))/g, '<span class="mda-hl-link">$1</span>');
}

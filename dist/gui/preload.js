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

  // ---- 复用 @mda/core ----
  parseAnnotations: (text) => core.parseAnnotations(text),
  renderMarkdown: (text) => {
    try {
      return { success: true, html: core.renderMarkdown(md, text) };
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
});

const { contextBridge, ipcRenderer } = require('electron');
// 复用编译后的 @mda/core（dist/core），消除 GUI 与核心库的重复实现。
// 需 sandbox: false 才能在 preload 中 require 第三方/本地模块。
const core = require('../core');

// markdown-it 实例直接复用 core 的配置（CommonMark + GFM + 图片 fallback），
// 仅在此叠加 GUI 专用的源码行号注入（data-line），供点击定位段落使用。
const md = core.createMarkdownIt();

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
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (_event, filePath) => callback(filePath));
  },
  onReload: (callback) => {
    ipcRenderer.on('reload', () => callback());
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

const { contextBridge, ipcRenderer } = require('electron');
const MarkdownIt = require('markdown-it');

// 创建 markdown-it 实例 (CommonMark preset + GFM 表格)
const md = new MarkdownIt('commonmark', { html: false, linkify: false, typographer: false });
md.enable('table');

// 在块级元素上注入源码行号 (data-line, 1-based)，供 GUI 点击定位段落
function injectLineNumbers(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  if (token.map && token.level === 0) {
    token.attrSet('data-line', String(token.map[0] + 1));
  }
  return slf.renderToken(tokens, idx, options);
}
md.renderer.rules.paragraph_open = injectLineNumbers;
md.renderer.rules.heading_open = injectLineNumbers;
md.renderer.rules.blockquote_open = injectLineNumbers;
md.renderer.rules.bullet_list_open = injectLineNumbers;
md.renderer.rules.ordered_list_open = injectLineNumbers;
md.renderer.rules.table_open = injectLineNumbers;

// 自定义图片 renderer — alt fallback
const defaultImageRender = md.renderer.rules.image;
md.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const src = token.attrGet('src') || '';
  const alt = token.content || '图片';
  const esc = function (s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  return '<span class="md-image-wrapper">'
    + '<img src="' + esc(src) + '" alt="' + esc(alt) + '"'
    + ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'" loading="lazy" />'
    + '<span class="md-image-alt" style="display:none">[图片: ' + esc(alt) + ']</span>'
    + '</span>';
};

contextBridge.exposeInMainWorld('mdaAPI', {
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', { filePath, content }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (_event, filePath) => callback(filePath));
  },
  onReload: (callback) => {
    ipcRenderer.on('reload', () => callback());
  },
  renderMarkdown: (text) => {
    try {
      return { success: true, html: md.render(text) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
});

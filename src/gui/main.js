const { app, BrowserWindow, dialog, Menu, ipcMain, shell, clipboard, screen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const { getLicenseStatus, activateLicense, clearLicense } = require('../pro/license');
const { checkAiAccess } = require('../pro/feature-gate');
const { createAiSettingsStore } = require('../pro/ai/settings');
const { streamChat, completeChat, sanitizeAiError } = require('../pro/ai/provider');
const {
  buildContinueMessages,
  buildCompleteMessages,
  buildBeautifyMessages,
} = require('../pro/ai/prompts');

const { getRecents, addRecent, clearRecents } = require('./main/recent-files');
const {
  getWorkspaceRoot,
  setWorkspaceRoot,
  getRememberSession,
  setRememberSession,
  getRememberLayout,
  setRememberLayout,
  getWindowBounds,
  setWindowBounds,
} = require('./main/workspace-prefs');
const { copyFileToDir, moveFileToDir, fileExists, renameFileConflict } = require('./main/file-ops');
const { listMarkdownTree } = require('./main/markdown-tree');
const { setupAutoUpdater } = require('./main/updater');
const { initI18n, t, getLang, getLangPref, setLangPref } = require('./main/i18n');

// Electron 31.x / Chromium 在 Windows 上偶发 PartitionAlloc dangling raw_ptr 致命崩溃（框架层问题）。
// 须在 app.ready 之前关闭该检查，否则进程会直接 FATAL 退出。
app.commandLine.appendSwitch('disable-features', 'PartitionAllocBackupRefPtr,PartitionAllocDanglingPtr');

// Chromium UI / 拼写检查语言：跟随系统（可被 MDA_LANG 覆盖）
(function applyChromiumLangHint() {
  const forced = (process.env.MDA_LANG || '').trim().toLowerCase();
  let pack = '';
  if (forced === 'en' || forced === 'en-us' || forced === 'en_us') pack = 'en-US';
  else if (forced === 'zh' || forced === 'zh-cn' || forced === 'zh_cn' || forced === 'cn') pack = 'zh-CN';
  else {
    try {
      const loc = String(Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase();
      pack = loc.startsWith('zh') ? 'zh-CN' : 'en-US';
    } catch (_) {
      pack = 'zh-CN';
    }
  }
  if (pack) app.commandLine.appendSwitch('lang', pack);
})();

const schema = require(path.join(__dirname, '..', 'config', 'annotation-schema.json'));
const MD_EXTENSIONS = schema.fileExtensions || ['md', 'markdown', 'txt', 'mdc'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];


function isMarkdownPath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MD_EXTENSIONS.includes(ext);
}

let mainWindow = null;
let rendererDirty = false;
/** @type {'off'|'blur'|'interval:30'|'interval:60'} */
let autosavePref = 'off';

const AUTOSAVE_MODES = ['off', 'blur', 'interval:30', 'interval:60'];

function normalizeAutosavePref(mode) {
  const m = String(mode || 'off');
  return AUTOSAVE_MODES.indexOf(m) >= 0 ? m : 'off';
}

function setAutosavePref(mode) {
  autosavePref = normalizeAutosavePref(mode);
  // 自动保存已迁入设置弹窗；此处仅同步主进程内存，不再改菜单 radio / 回推 renderer
  return autosavePref;
}
let allowClose = false;
let ipcHandlersRegistered = false;
let autoUpdaterApi = null;
/** 设置弹窗打开时：菜单不可点（保留顶栏标签），并拦截窗口关闭 */
let settingsModalOpen = false;
/** @type {ReturnType<typeof createAiSettingsStore>|null} */
let aiSettingsStore = null;
/** @type {AbortController|null} */
let aiAbortController = null;

function getAiStore() {
  if (!aiSettingsStore) {
    aiSettingsStore = createAiSettingsStore({
      userDataPath: app.getPath('userData'),
      safeStorage,
    });
  }
  return aiSettingsStore;
}

function userData() {
  return app.getPath('userData');
}

function cancelAiRequest() {
  if (aiAbortController) {
    try { aiAbortController.abort(); } catch (_) { /* ignore */ }
    aiAbortController = null;
  }
}

function sendToRenderer(channel, ...args) {
  if (settingsModalOpen && typeof channel === 'string' && channel.indexOf('menu-') === 0) {
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

/** 设置打开：顶栏保留「文件/视图/帮助」标签但不可点；编辑菜单保留（输入框复制粘贴依赖 role） */
function applyApplicationMenu() {
  if (!app.isReady()) return;
  const recents = getRecents(app.getPath('userData'));
  if (settingsModalOpen) {
    const locked = buildMenuTemplate(recents).map((item) => {
      if (item && item.id === 'mda-edit-menu') return item;
      return {
        label: item.label || ' ',
        enabled: false,
      };
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(locked));
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(recents)));
}

function setSettingsModalOpen(open) {
  settingsModalOpen = !!open;
  applyApplicationMenu();
}

function buildRecentSubmenu(recents) {
  if (!recents.length) {
    return [{ label: t('menuRecentEmpty'), enabled: false }];
  }
  const items = recents.map((item) => {
    const full = item.path;
    const base = path.basename(full);
    // toolTip 仅 macOS；Windows/Linux 菜单无 hover tooltip，用「文件名 — 全路径」展示
    const label = process.platform === 'darwin' ? base : `${base} — ${full}`;
    return {
      label,
      toolTip: full,
      click: () => sendToRenderer('file-opened', full),
    };
  });
  items.push({ type: 'separator' });
  items.push({
    label: t('menuClearRecent'),
    click: () => {
      clearRecents(app.getPath('userData'));
      try { if (typeof app.clearRecentDocuments === 'function') app.clearRecentDocuments(); } catch (_) { /* ignore */ }
      rebuildApplicationMenu();
      sendToRenderer('recent-files-cleared');
    },
  });
  return items;
}

function buildMenuTemplate(recents) {
  return [
    {
      label: t('menuFile'),
      submenu: [
        {
          label: t('menuNew'),
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToRenderer('menu-new-document'),
        },
        {
          label: t('menuOpen'),
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              title: t('openMdTitle'),
              filters: [{ name: t('filterMarkdown'), extensions: MD_EXTENSIONS }],
              properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              sendToRenderer('file-opened', result.filePaths[0]);
            }
          },
        },
        {
          label: t('menuOpenFolder'),
          accelerator: 'CmdOrCtrl+Alt+O',
          click: () => sendToRenderer('menu-open-folder'),
        },
        { type: 'separator' },
        {
          label: t('menuRecent'),
          submenu: buildRecentSubmenu(recents),
        },
        { type: 'separator' },
        {
          label: t('menuSave'),
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToRenderer('menu-save'),
        },
        {
          label: t('menuSaveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendToRenderer('menu-save-as'),
        },
        {
          label: t('menuShowInFolder'),
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendToRenderer('menu-show-in-folder'),
        },
        {
          label: t('menuReload'),
          accelerator: 'CmdOrCtrl+R',
          click: () => sendToRenderer('reload'),
        },
        { type: 'separator' },
        {
          label: t('menuCopyArticle'),
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => sendToRenderer('menu-copy-article'),
        },
        { type: 'separator' },
        {
          label: t('menuExportHtml'),
          click: () => sendToRenderer('menu-export-html'),
        },
        {
          label: t('menuExportPdf'),
          click: () => sendToRenderer('menu-export-pdf'),
        },
        {
          label: t('menuExportDocx'),
          click: () => sendToRenderer('menu-export-docx'),
        },
        { type: 'separator' },
        { role: 'quit', label: t('menuQuit') },
      ],
    },
    {
      // Electron 依赖 Edit roles 绑定输入框的撤销/复制/粘贴；设置打开时此菜单仍保持可用
      id: 'mda-edit-menu',
      label: t('menuEdit'),
      submenu: [
        {
          label: t('menuUndo'),
          accelerator: 'CmdOrCtrl+Z',
          click: () => sendToRenderer('menu-undo'),
        },
        {
          label: t('menuRedo'),
          accelerator: process.platform === 'darwin' ? 'Shift+CmdOrCtrl+Z' : 'CmdOrCtrl+Y',
          click: () => sendToRenderer('menu-redo'),
        },
        { type: 'separator' },
        { role: 'cut', label: t('menuCut') },
        { role: 'copy', label: t('menuCopy') },
        { role: 'paste', label: t('menuPaste') },
        { role: 'selectAll', label: t('menuSelectAll') },
      ],
    },
    {
      label: t('menuView'),
      submenu: [
        {
          label: t('menuEditPane'),
          accelerator: 'CmdOrCtrl+E',
          click: () => sendToRenderer('menu-toggle-edit'),
        },
        {
          label: t('menuAnnoPane'),
          accelerator: 'CmdOrCtrl+B',
          click: () => sendToRenderer('menu-toggle-panel'),
        },
        {
          label: t('menuDarkMode'),
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => sendToRenderer('menu-toggle-theme'),
        },
        {
          label: t('menuSettings'),
          accelerator: 'CmdOrCtrl+,',
          click: () => sendToRenderer('menu-settings'),
        },
        { type: 'separator' },
        {
          label: t('menuAiContinue'),
          accelerator: 'CmdOrCtrl+Shift+Enter',
          click: () => sendToRenderer('menu-ai-continue'),
        },
        {
          label: t('menuAiComplete'),
          accelerator: 'CmdOrCtrl+Space',
          click: () => sendToRenderer('menu-ai-complete'),
        },
        {
          label: t('menuAiBeautify'),
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => sendToRenderer('menu-ai-beautify'),
        },
        {
          label: t('menuLanguage'),
          submenu: [
            {
              label: t('menuLangSystem'),
              type: 'radio',
              checked: getLangPref() === 'system',
              click: () => applyLangPref('system'),
            },
            {
              label: t('menuLangZh'),
              type: 'radio',
              checked: getLangPref() === 'zh',
              click: () => applyLangPref('zh'),
            },
            {
              label: t('menuLangEn'),
              type: 'radio',
              checked: getLangPref() === 'en',
              click: () => applyLangPref('en'),
            },
          ],
        },
        { type: 'separator' },
        {
          label: t('menuDevTools'),
          accelerator: 'F12',
          click: () => {
            if (mainWindow) mainWindow.webContents.toggleDevTools();
          },
        },
      ],
    },
    {
      label: t('menuHelp'),
      submenu: [
        {
          label: t('menuHelpShortcuts'),
          accelerator: 'F1',
          click: () => sendToRenderer('menu-show-help'),
        },
        {
          label: t('menuProActivation'),
          click: () => {
            shell.openExternal(
              'https://github.com/ShuiYunYueKeeper/mda-l2/blob/main/docs/pro-activation.md',
            );
          },
        },
        {
          label: t('menuCheckUpdate'),
          click: () => {
            if (autoUpdaterApi) autoUpdaterApi.checkForUpdates();
            else if (mainWindow) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: t('updateCheckTitle'),
                message: t('updateDevOnly'),
              });
            }
          },
        },
      ],
    },
  ];
}

function rebuildApplicationMenu() {
  applyApplicationMenu();
}

function applyLangPref(pref) {
  const r = setLangPref(pref);
  rebuildApplicationMenu();
  sendToRenderer('lang-changed', r.lang, r.pref);
}

function registerIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  ipcMain.handle('read-file', async (_event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-external', async (_event, url) => {
    if (typeof url !== 'string' || !/^(https?:|mailto:|file:)/i.test(url)) {
      throw new Error(t('errUnsupportedProtocol'));
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
    if (filePath) shell.showItemInFolder(path.resolve(filePath));
  });

  ipcMain.handle('rename-file', async (_event, arg1, arg2) => {
    try {
      let oldPath;
      let newPath;
      let workspaceRoot;
      let conflict;
      if (arg1 && typeof arg1 === 'object') {
        oldPath = arg1.oldPath;
        newPath = arg1.newPath;
        workspaceRoot = arg1.workspaceRoot;
        conflict = arg1.conflict;
      } else {
        oldPath = arg1;
        newPath = arg2;
      }
      if (workspaceRoot != null) {
        return renameFileConflict(oldPath, newPath, workspaceRoot, conflict);
      }
      if (!oldPath || !newPath) return { success: false, error: '路径无效' };
      const absOld = path.resolve(oldPath);
      const absNew = path.resolve(newPath);
      if (!fs.existsSync(absOld)) return { success: false, error: '源文件不存在' };
      if (fs.existsSync(absNew)) return { success: false, error: '目标文件已存在' };
      fs.renameSync(absOld, absNew);
      return { success: true, filePath: absNew };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-file', async (_event, filePath) => {
    try {
      if (!filePath) return { success: false, error: '路径为空' };
      const abs = path.resolve(filePath);
      if (!fs.existsSync(abs)) return { success: false, error: '文件不存在' };
      const stat = fs.statSync(abs);
      if (!stat.isFile()) return { success: false, error: '不是文件' };
      fs.unlinkSync(abs);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copy-file-to-dir', async (_event, payload) => {
    try {
      const srcPath = payload && payload.srcPath;
      const destDir = payload && payload.destDir;
      const workspaceRoot = payload && payload.workspaceRoot;
      const conflict = payload && payload.conflict;
      return copyFileToDir(srcPath, destDir, workspaceRoot, conflict);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('move-file-to-dir', async (_event, payload) => {
    try {
      const srcPath = payload && payload.srcPath;
      const destDir = payload && payload.destDir;
      const workspaceRoot = payload && payload.workspaceRoot;
      const conflict = payload && payload.conflict;
      return moveFileToDir(srcPath, destDir, workspaceRoot, conflict);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file-exists', async (_event, payload) => {
    try {
      const filePath = payload && payload.filePath;
      const workspaceRoot = payload && payload.workspaceRoot;
      return fileExists(filePath, workspaceRoot);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copy-clipboard', async (_event, text) => {
    clipboard.writeText(text == null ? '' : String(text));
  });

  ipcMain.handle('copy-clipboard-image', async (_event, payload) => {
    try {
      const { nativeImage } = require('electron');
      const { copyClipboardImage } = require('./main/clipboard-image');
      return await copyClipboardImage(payload || {}, t, nativeImage);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-clipboard-image-asset', async (_event, payload) => {
    try {
      const { nativeImage } = require('electron');
      const { saveClipboardImageAsset } = require('./main/clipboard-image');
      return await saveClipboardImageAsset(payload && payload.baseFile, t, nativeImage);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copy-clipboard-html', async (_event, payload) => {
    const html = payload && payload.html != null ? String(payload.html) : '';
    const text = payload && payload.text != null ? String(payload.text) : '';
    clipboard.write({ text, html });
    return { success: true };
  });

  ipcMain.handle('read-file-data-url', async (_event, filePath) => {
    try {
      if (!filePath) return { success: false, error: '路径为空' };
      const abs = path.resolve(filePath);
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
      }[ext] || 'application/octet-stream';
      return { success: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('capture-page-rect', async (event, rect) => {
    try {
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return { success: false, error: '截图区域无效' };
      }
      const image = await event.sender.capturePage({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      return { success: true, dataUrl: image.toDataURL() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('set-title', async (_event, title) => {
    if (mainWindow) mainWindow.setTitle(title);
  });

  ipcMain.handle('show-open-file-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || mainWindow, {
      title: t('openMdTitle'),
      filters: [{ name: t('filterMarkdown'), extensions: MD_EXTENSIONS }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }
    return { success: true, filePath: result.filePaths[0] };
  });

  ipcMain.handle('show-pick-image-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || mainWindow, {
      title: t('pickImageTitle'),
      filters: [{ name: t('filterImages'), extensions: IMAGE_EXTENSIONS }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }
    return { success: true, filePath: result.filePaths[0] };
  });

  ipcMain.handle('show-save-dialog', async (event, opts) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const defaultName = (opts && opts.suggestedName) || (getLang() === 'en' ? 'Untitled.md' : '未命名.md');
    let defaultPath = defaultName;
    if (opts && opts.defaultPath) {
      defaultPath = path.join(opts.defaultPath, defaultName);
    }
    const filters = (opts && opts.filters) || [{ name: t('filterMarkdown'), extensions: MD_EXTENSIONS }];
    const result = await dialog.showSaveDialog(win || mainWindow, {
      title: (opts && opts.title) || t('menuSaveAs'),
      defaultPath,
      filters,
    });
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    let fp = result.filePath;
    if (!path.extname(fp) && filters[0] && filters[0].extensions && filters[0].extensions[0]) {
      fp += '.' + filters[0].extensions[0];
    }
    return { success: true, filePath: fp };
  });

  ipcMain.handle('write-text-file', async (_event, filePath, content) => {
    try {
      if (!filePath) return { success: false, error: '路径为空' };
      const abs = path.resolve(filePath);
      fs.writeFileSync(abs, content == null ? '' : String(content), 'utf-8');
      return { success: true, filePath: abs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-pdf', async (_event, payload) => {
    const fsPromises = fs.promises;
    const os = require('os');
    let pdfWin = null;
    let tmpHtml = null;
    try {
      const filePath = payload && payload.filePath;
      const html = payload && payload.html;
      if (!filePath || !html) return { success: false, error: '参数无效' };
      const absOut = path.resolve(filePath);
      tmpHtml = path.join(os.tmpdir(), 'mda-export-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.html');
      fs.writeFileSync(tmpHtml, String(html), 'utf-8');

      pdfWin = new BrowserWindow({
        show: false,
        width: 900,
        height: 1200,
        webPreferences: { sandbox: true, javascript: true },
      });
      await pdfWin.loadFile(tmpHtml);
      await new Promise((r) => setTimeout(r, 300));

      const PDF_TIMEOUT_MS = 55000;
      const pdf = await Promise.race([
        pdfWin.webContents.printToPDF({
          printBackground: true,
          margins: { marginType: 'default' },
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('生成 PDF 超时（超过 55 秒）')), PDF_TIMEOUT_MS);
        }),
      ]);
      await fsPromises.writeFile(absOut, pdf);
      return { success: true, filePath: absOut };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      if (pdfWin && !pdfWin.isDestroyed()) pdfWin.destroy();
      if (tmpHtml) {
        try { fs.unlinkSync(tmpHtml); } catch (e) { /* ignore */ }
      }
    }
  });

  ipcMain.handle('export-docx', async (_event, payload) => {
    try {
      const HTMLtoDOCX = require('html-to-docx');
      const filePath = payload && payload.filePath;
      const html = payload && payload.html;
      if (!filePath || !html) return { success: false, error: '参数无效' };
      const absOut = path.resolve(filePath);
      const buf = await HTMLtoDOCX(String(html), null, {
        title: path.basename(absOut, path.extname(absOut)),
        margins: { top: 720, right: 720, bottom: 720, left: 720 },
      });
      await fs.promises.writeFile(absOut, Buffer.from(buf));
      return { success: true, filePath: absOut };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-autosave-pref', async () => autosavePref);

  ipcMain.handle('set-autosave-pref', async (_event, mode) => {
    autosavePref = normalizeAutosavePref(mode);
    return autosavePref;
  });

  ipcMain.handle('set-settings-modal', async (_event, open) => {
    setSettingsModalOpen(!!open);
    return { success: true, open: settingsModalOpen };
  });

  // ---- Pro License / AI (Phase B M7) ----
  ipcMain.handle('get-license-status', async () => {
    try {
      return { success: true, value: getLicenseStatus(userData()) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('activate-license', async (_event, key) => {
    try {
      return activateLicense(userData(), key);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clear-license', async () => {
    try {
      return clearLicense(userData());
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-ai-settings', async () => {
    try {
      return { success: true, value: getAiStore().getPublicSettings() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-ai-settings', async (_event, patch) => {
    try {
      return getAiStore().saveSettings(patch || {});
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('check-ai-access', async () => {
    try {
      const status = getLicenseStatus(userData());
      const pub = getAiStore().getPublicSettings();
      return { success: true, value: checkAiAccess(status, pub) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ai-cancel', async () => {
    cancelAiRequest();
    return { success: true };
  });

  ipcMain.handle('ai-continue', async (event, payload) => {
    try {
      const status = getLicenseStatus(userData());
      const store = getAiStore();
      const pub = store.getPublicSettings();
      const access = checkAiAccess(status, pub);
      if (!access.allowed) {
        return { success: false, error: access.reason === 'upgrade' ? '需要 Pro 激活' : '请先配置 API Key' };
      }
      const apiKey = store.getApiKeyPlain();
      if (!apiKey) return { success: false, error: '请先配置 API Key' };

      cancelAiRequest();
      aiAbortController = new AbortController();
      const messages = buildContinueMessages(payload || {});
      const wc = event.sender;
      // 异步流式；先返回已启动，chunk 经事件回传
      streamChat({
        baseUrl: pub.baseUrl,
        apiKey,
        model: pub.model,
        messages,
        signal: aiAbortController.signal,
        onChunk: (text) => {
          if (!wc.isDestroyed()) wc.send('ai-chunk', text);
        },
        onDone: (full) => {
          aiAbortController = null;
          if (!wc.isDestroyed()) wc.send('ai-done', full || '');
        },
        onError: (message) => {
          aiAbortController = null;
          if (!wc.isDestroyed()) wc.send('ai-error', sanitizeAiError({ message }));
        },
      }).catch(() => { /* onError 已处理 */ });
      return { success: true, started: true };
    } catch (err) {
      return { success: false, error: sanitizeAiError(err) };
    }
  });

  ipcMain.handle('ai-complete', async (_event, payload) => {
    try {
      const status = getLicenseStatus(userData());
      const store = getAiStore();
      const pub = store.getPublicSettings();
      const access = checkAiAccess(status, pub);
      if (!access.allowed) {
        return { success: false, error: access.reason === 'upgrade' ? '需要 Pro 激活' : '请先配置 API Key' };
      }
      const apiKey = store.getApiKeyPlain();
      if (!apiKey) return { success: false, error: '请先配置 API Key' };

      cancelAiRequest();
      aiAbortController = new AbortController();
      const text = await completeChat({
        baseUrl: pub.baseUrl,
        apiKey,
        model: pub.model,
        messages: buildCompleteMessages(payload || {}),
        signal: aiAbortController.signal,
        temperature: 0.2,
      });
      aiAbortController = null;
      return { success: true, value: { text: String(text || '').trim() } };
    } catch (err) {
      aiAbortController = null;
      if (err && err.canceled) return { success: false, error: '已取消' };
      return { success: false, error: sanitizeAiError(err) };
    }
  });

  ipcMain.handle('ai-beautify', async (_event, payload) => {
    try {
      const status = getLicenseStatus(userData());
      const store = getAiStore();
      const pub = store.getPublicSettings();
      const access = checkAiAccess(status, pub);
      if (!access.allowed) {
        return { success: false, error: access.reason === 'upgrade' ? '需要 Pro 激活' : '请先配置 API Key' };
      }
      const apiKey = store.getApiKeyPlain();
      if (!apiKey) return { success: false, error: '请先配置 API Key' };

      cancelAiRequest();
      aiAbortController = new AbortController();
      const text = await completeChat({
        baseUrl: pub.baseUrl,
        apiKey,
        model: pub.model,
        messages: buildBeautifyMessages(payload || {}),
        signal: aiAbortController.signal,
        temperature: 0.3,
      });
      aiAbortController = null;
      return { success: true, value: { text: String(text || '').trim() } };
    } catch (err) {
      aiAbortController = null;
      if (err && err.canceled) return { success: false, error: '已取消' };
      return { success: false, error: sanitizeAiError(err) };
    }
  });

  ipcMain.handle('show-open-folder-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || mainWindow, {
      title: t('openFolderTitle'),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }
    return { success: true, folderPath: result.filePaths[0] };
  });

  ipcMain.handle('list-markdown-tree', async (_event, folderPath) => {
    try {
      if (!folderPath) return { success: false, error: '路径为空' };
      const tree = listMarkdownTree(folderPath, MD_EXTENSIONS);
      return { success: true, tree };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-workspace-root', async () => {
    try {
      const folderPath = getWorkspaceRoot(app.getPath('userData'));
      return { success: true, folderPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('set-workspace-root', async (_event, folderPath) => {
    try {
      const ud = app.getPath('userData');
      // 未开启「记住上次会话」时不落盘，避免下次仍恢复文件列表
      if (!getRememberSession(ud)) {
        if (!folderPath) setWorkspaceRoot(ud, null);
        return { success: true, skipped: true };
      }
      setWorkspaceRoot(ud, folderPath || null);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-remember-session', async () => {
    try {
      return { success: true, value: getRememberSession(app.getPath('userData')) };
    } catch (err) {
      return { success: false, error: err.message, value: true };
    }
  });

  ipcMain.handle('set-remember-session', async (_event, on) => {
    try {
      const ud = app.getPath('userData');
      const value = setRememberSession(ud, !!on);
      if (!value) {
        clearRecents(ud);
        try {
          if (typeof app.clearRecentDocuments === 'function') app.clearRecentDocuments();
        } catch (_) { /* ignore */ }
        rebuildApplicationMenu();
        sendToRenderer('recent-files-cleared');
      }
      return { success: true, value };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-remember-layout', async () => {
    try {
      return { success: true, value: getRememberLayout(app.getPath('userData')) };
    } catch (err) {
      return { success: false, error: err.message, value: true };
    }
  });

  ipcMain.handle('set-remember-layout', async (_event, on) => {
    try {
      const ud = app.getPath('userData');
      const value = setRememberLayout(ud, !!on);
      if (value && mainWindow && !mainWindow.isDestroyed()) {
        persistMainWindowBounds();
      }
      return { success: true, value };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-recent-files', async () => {
    try {
      return { success: true, files: getRecents(app.getPath('userData')) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('add-recent-file', async (_event, filePath) => {
    try {
      if (!filePath) return { success: false, error: '路径为空' };
      const ud = app.getPath('userData');
      if (!getRememberSession(ud)) {
        return { success: true, files: getRecents(ud), skipped: true };
      }
      const files = addRecent(ud, filePath);
      rebuildApplicationMenu();
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clear-recent-files', async () => {
    clearRecents(app.getPath('userData'));
    try { if (typeof app.clearRecentDocuments === 'function') app.clearRecentDocuments(); } catch (_) { /* ignore */ }
    rebuildApplicationMenu();
    sendToRenderer('recent-files-cleared');
    return { success: true };
  });

  ipcMain.handle('get-lang', async () => ({
    success: true,
    lang: getLang(),
    pref: getLangPref(),
  }));

  ipcMain.handle('set-lang-pref', async (_event, pref) => {
    const r = setLangPref(pref);
    rebuildApplicationMenu();
    sendToRenderer('lang-changed', r.lang, r.pref);
    return { success: true, lang: r.lang, pref: r.pref };
  });

  ipcMain.on('set-dirty', (_event, dirty) => {
    rendererDirty = !!dirty;
  });
  ipcMain.on('confirm-close', () => {
    allowClose = true;
    if (mainWindow) mainWindow.close();
  });
}

function isWindowBoundsOnScreen(bounds) {
  if (!bounds) return false;
  try {
    const displays = screen.getAllDisplays();
    if (!displays.length) return true;
    const x = typeof bounds.x === 'number' ? bounds.x : 0;
    const y = typeof bounds.y === 'number' ? bounds.y : 0;
    const w = bounds.width;
    const h = bounds.height;
    const cx = x + w / 2;
    const cy = y + h / 2;
    return displays.some((d) => {
      const a = d.workArea || d.bounds;
      return cx >= a.x && cy >= a.y && cx < a.x + a.width && cy < a.y + a.height;
    });
  } catch {
    return false;
  }
}

let boundsSaveTimer = null;

function persistMainWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const ud = app.getPath('userData');
  if (!getRememberLayout(ud)) return;
  try {
    const isMaximized = mainWindow.isMaximized();
    const b = typeof mainWindow.getNormalBounds === 'function'
      ? mainWindow.getNormalBounds()
      : mainWindow.getBounds();
    setWindowBounds(ud, {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      isMaximized,
    });
  } catch (_) { /* ignore */ }
}

function schedulePersistMainWindowBounds() {
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    boundsSaveTimer = null;
    persistMainWindowBounds();
  }, 300);
}

function createWindow(initialFile) {
  allowClose = false;
  rendererDirty = false;
  const ud = app.getPath('userData');
  const winOpts = {
    width: 1200,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: 'MDA',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };
  let restoreMaximized = false;
  if (getRememberLayout(ud)) {
    const saved = getWindowBounds(ud);
    if (saved && isWindowBoundsOnScreen(saved)) {
      winOpts.width = saved.width;
      winOpts.height = saved.height;
      if (typeof saved.x === 'number') winOpts.x = saved.x;
      if (typeof saved.y === 'number') winOpts.y = saved.y;
      restoreMaximized = !!saved.isMaximized;
    }
  }
  mainWindow = new BrowserWindow(winOpts);

  rebuildApplicationMenu();

  if (restoreMaximized) mainWindow.maximize();

  mainWindow.on('resize', schedulePersistMainWindowBounds);
  mainWindow.on('move', schedulePersistMainWindowBounds);
  mainWindow.on('maximize', schedulePersistMainWindowBounds);
  mainWindow.on('unmaximize', schedulePersistMainWindowBounds);

  mainWindow.on('close', (e) => {
    if (settingsModalOpen) {
      e.preventDefault();
      sendToRenderer('settings-modal-blocked-close');
      return;
    }
    persistMainWindowBounds();
    if (!allowClose && rendererDirty) {
      e.preventDefault();
      sendToRenderer('app-close-request');
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    allowClose = false;
    rendererDirty = false;
    settingsModalOpen = false;
  });

  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    if (initialFile) {
      sendToRenderer('file-opened', initialFile);
      return;
    }
    // 未记住会话 → 欢迎页（不恢复当前文件；工作区由渲染层按同开关决定）
    if (!getRememberSession(ud)) {
      sendToRenderer('session-welcome');
      return;
    }
    const recents = getRecents(ud);
    const last = recents[0];
    // 历史为空（或首条文件已不存在）→ 起始页，勿自动打开其它文档
    if (last && last.path && fs.existsSync(last.path)) {
      sendToRenderer('file-opened', last.path);
    } else {
      sendToRenderer('session-welcome');
    }
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const argFile = argv.find((a) => !a.startsWith('-') && isMarkdownPath(a));
    if (argFile) {
      sendToRenderer('file-opened', path.resolve(argFile));
    }
  });

  app.whenReady().then(() => {
    initI18n(app);
    registerIpcHandlers();
    autoUpdaterApi = setupAutoUpdater(app, () => mainWindow);
    const argFile = process.argv.find((a) => !a.startsWith('-') && isMarkdownPath(a));
    const initialFile = argFile ? path.resolve(argFile) : undefined;
    createWindow(initialFile);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
});

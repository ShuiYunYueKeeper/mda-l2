const { app, BrowserWindow, dialog, Menu, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const { getRecents, addRecent, clearRecents } = require('./main/recent-files');
const { listMarkdownTree } = require('./main/markdown-tree');

// Electron 31.x / Chromium 在 Windows 上偶发 PartitionAlloc dangling raw_ptr 致命崩溃（框架层问题）。
// 须在 app.ready 之前关闭该检查，否则进程会直接 FATAL 退出。
app.commandLine.appendSwitch('disable-features', 'PartitionAllocBackupRefPtr,PartitionAllocDanglingPtr');

const schema = require(path.join(__dirname, '..', 'config', 'annotation-schema.json'));
const MD_EXTENSIONS = schema.fileExtensions || ['md', 'markdown', 'txt', 'mdc'];

function isMarkdownPath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MD_EXTENSIONS.includes(ext);
}

let mainWindow = null;
let rendererDirty = false;
let allowClose = false;
let ipcHandlersRegistered = false;

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function buildRecentSubmenu(recents) {
  if (!recents.length) {
    return [{ label: '(无)', enabled: false }];
  }
  const items = recents.map((item) => ({
    label: path.basename(item.path),
    click: () => sendToRenderer('file-opened', item.path),
  }));
  items.push({ type: 'separator' });
  items.push({
    label: '清空列表',
    click: () => {
      clearRecents(app.getPath('userData'));
      rebuildApplicationMenu();
    },
  });
  return items;
}

function buildMenuTemplate(recents) {
  return [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToRenderer('menu-new-document'),
        },
        {
          label: '打开',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              title: '打开 Markdown 文件',
              filters: [{ name: 'Markdown', extensions: MD_EXTENSIONS }],
              properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              sendToRenderer('file-opened', result.filePaths[0]);
            }
          },
        },
        {
          label: '打开文件夹',
          accelerator: 'CmdOrCtrl+Alt+O',
          click: () => sendToRenderer('menu-open-folder'),
        },
        { type: 'separator' },
        {
          label: '最近文件',
          submenu: buildRecentSubmenu(recents),
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToRenderer('menu-save'),
        },
        {
          label: '另存为',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendToRenderer('menu-save-as'),
        },
        {
          label: '打开文件所在目录',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendToRenderer('menu-show-in-folder'),
        },
        {
          label: '重新加载',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendToRenderer('reload'),
        },
        { type: 'separator' },
        {
          label: '复制预览（微信公众号）',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => sendToRenderer('menu-copy-article'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '编辑栏',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendToRenderer('menu-toggle-edit'),
        },
        {
          label: '批注栏',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendToRenderer('menu-toggle-panel'),
        },
        {
          label: '切换深色模式',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => sendToRenderer('menu-toggle-theme'),
        },
        { type: 'separator' },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) mainWindow.webContents.toggleDevTools();
          },
        },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '功能与快捷键',
          accelerator: 'F1',
          click: () => sendToRenderer('menu-show-help'),
        },
      ],
    },
  ];
}

function rebuildApplicationMenu() {
  const recents = getRecents(app.getPath('userData'));
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(recents)));
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
    await shell.openExternal(url);
  });

  ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
    if (filePath) shell.showItemInFolder(path.resolve(filePath));
  });

  ipcMain.handle('copy-clipboard', async (_event, text) => {
    clipboard.writeText(text == null ? '' : String(text));
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
      title: '打开 Markdown 文件',
      filters: [{ name: 'Markdown', extensions: MD_EXTENSIONS }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }
    return { success: true, filePath: result.filePaths[0] };
  });

  ipcMain.handle('show-save-dialog', async (event, opts) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const suggested = (opts && opts.suggestedName) || '未命名.md';
    let defaultPath = suggested;
    if (opts && opts.defaultPath) {
      defaultPath = path.join(opts.defaultPath, suggested);
    }
    const result = await dialog.showSaveDialog(win || mainWindow, {
      title: '另存为',
      defaultPath,
      filters: [{ name: 'Markdown', extensions: MD_EXTENSIONS }],
    });
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    let fp = result.filePath;
    if (!path.extname(fp)) fp += '.md';
    return { success: true, filePath: fp };
  });

  ipcMain.handle('show-open-folder-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || mainWindow, {
      title: '打开文件夹',
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
      const files = addRecent(app.getPath('userData'), filePath);
      rebuildApplicationMenu();
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clear-recent-files', async () => {
    clearRecents(app.getPath('userData'));
    rebuildApplicationMenu();
    return { success: true };
  });

  ipcMain.on('set-dirty', (_event, dirty) => {
    rendererDirty = !!dirty;
  });
  ipcMain.on('confirm-close', () => {
    allowClose = true;
    if (mainWindow) mainWindow.close();
  });
}

function createWindow(initialFile) {
  allowClose = false;
  rendererDirty = false;
  mainWindow = new BrowserWindow({
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
  });

  rebuildApplicationMenu();

  mainWindow.on('close', (e) => {
    if (!allowClose && rendererDirty) {
      e.preventDefault();
      sendToRenderer('app-close-request');
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    allowClose = false;
    rendererDirty = false;
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
    const recents = getRecents(app.getPath('userData'));
    const last = recents[0];
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
    registerIpcHandlers();
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

const { app, BrowserWindow, dialog, Menu, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

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
let rendererDirty = false;  // 渲染进程同步的「未保存编辑」标记
let allowClose = false;     // 用户已确认放弃或保存成功后允许关闭

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
      // preload 需 require('../core')（及其依赖 markdown-it），沙箱下无法加载
      // 本地/第三方模块，故关闭 sandbox；contextIsolation 仍开启以隔离渲染进程。
      sandbox: false,
    },
  });

  // 菜单
  const menuTemplate = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: '打开 Markdown 文件',
              filters: [{ name: 'Markdown', extensions: MD_EXTENSIONS }],
              properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('file-opened', result.filePaths[0]);
            }
          },
        },
        {
          label: '打开文件所在目录',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            mainWindow.webContents.send('menu-show-in-folder');
          },
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu-save');
          },
        },
        {
          label: '重新加载',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.send('reload');
          },
        },
        { type: 'separator' },
        {
          label: '复制预览（微信公众号）',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            mainWindow.webContents.send('menu-copy-article');
          },
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
          click: () => {
            mainWindow.webContents.send('menu-toggle-edit');
          },
        },
        {
          label: '批注栏',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow.webContents.send('menu-toggle-panel');
          },
        },
        {
          label: '切换深色模式',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            mainWindow.webContents.send('menu-toggle-theme');
          },
        },
        { type: 'separator' },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
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
          click: () => {
            mainWindow.webContents.send('menu-show-help');
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  // IPC handlers
  ipcMain.handle('read-file', async (_event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 写操作（增/删/改批注）统一走 @mda/core 的 writer（原子写入 + 源文件保护
  // + 换行风格保留），由 preload 直接调用，不再需要独立的 write-file 通道。

  ipcMain.handle('open-external', async (_event, url) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
    // showItemInFolder 需要绝对路径；命令行相对路径要相对 cwd 解析
    if (filePath) shell.showItemInFolder(path.resolve(filePath));
  });

  ipcMain.handle('copy-clipboard', async (_event, text) => {
    clipboard.writeText(text == null ? '' : String(text));
  });

  // 富文本剪贴板（微信公众号粘贴用）：html + 纯文本
  ipcMain.handle('copy-clipboard-html', async (_event, payload) => {
    const html = payload && payload.html != null ? String(payload.html) : '';
    const text = payload && payload.text != null ? String(payload.text) : '';
    clipboard.write({ text, html });
    return { success: true };
  });

  // 将本地图片读为 data URL（复制预览时内嵌图片，避免 file:// 粘贴失效）
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

  // 将预览区内指定矩形截图为 PNG data URL（复制 Mermaid 时用）
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

  // 渲染进程同步 dirty 状态；关闭窗口时若有未保存编辑则拦截并交渲染层弹窗（不用原生 dialog）
  ipcMain.on('set-dirty', (_event, dirty) => {
    rendererDirty = !!dirty;
  });
  ipcMain.on('confirm-close', () => {
    allowClose = true;
    if (mainWindow) mainWindow.close();
  });

  mainWindow.on('close', (e) => {
    if (!allowClose && rendererDirty) {
      e.preventDefault();
      mainWindow.webContents.send('app-close-request');
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    allowClose = false;
    rendererDirty = false;
  });

  // 防御性兜底：禁止渲染进程因链接点击 / 文件拖拽而离开 index.html（否则白屏且无法恢复）。
  // 真正的“打开”动作由渲染层显式调用 openFile / openExternal 完成。
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 加载 renderer
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 启动参数：mda <file> 直接打开
  if (initialFile) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('file-opened', initialFile);
    });
  }
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
      mainWindow.webContents.send('file-opened', path.resolve(argFile));
    }
  });

  app.whenReady().then(() => {
    const argFile = process.argv.find((a) => !a.startsWith('-') && isMarkdownPath(a));
    // 命令行可能传相对路径（如 samples/demo.md），统一解析为绝对路径
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

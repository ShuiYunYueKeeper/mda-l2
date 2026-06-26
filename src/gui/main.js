const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow(initialFile) {
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
      // preload 需 require('markdown-it')，沙箱下无法加载第三方模块，
      // 故关闭 sandbox；contextIsolation 仍开启以隔离渲染进程。
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
              filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
              properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('file-opened', result.filePaths[0]);
            }
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
        { role: 'quit' },
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

  ipcMain.handle('write-file', async (_event, { filePath, content }) => {
    try {
      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      const tmpName = '.' + base + '.' + require('crypto').randomUUID() + '.tmp';
      const tmpPath = path.join(dir, tmpName);
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-external', async (_event, url) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('set-title', async (_event, title) => {
    if (mainWindow) mainWindow.setTitle(title);
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

app.whenReady().then(() => {
  const initialFile = process.argv.find(a => a.endsWith('.md') && !a.startsWith('-'));
  createWindow(initialFile);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
});

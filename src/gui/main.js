const { app, BrowserWindow, dialog, Menu, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

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
              filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
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

app.whenReady().then(() => {
  const argFile = process.argv.find(a => a.endsWith('.md') && !a.startsWith('-'));
  // 命令行可能传相对路径（如 samples/demo.md），统一解析为绝对路径，
  // 否则渲染层拿到的相对路径会让"打开文件所在目录"等依赖绝对路径的操作失效。
  const initialFile = argFile ? path.resolve(argFile) : undefined;
  createWindow(initialFile);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
});

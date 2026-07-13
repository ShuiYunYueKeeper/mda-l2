const { dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

/**
 * electron-updater 集成：仅打包后启用；手动「检查更新」+ 可选后台检查。
 * publish 配置见 package.json build.publish（GitHub Release 或 generic URL）。
 */
function setupAutoUpdater(app, getMainWindow) {
  if (!app.isPackaged) {
    return { checkForUpdates: () => {} };
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    const win = getMainWindow();
    if (win) {
      dialog.showMessageBox(win, {
        type: 'error',
        title: '更新检查失败',
        message: String(err && err.message ? err.message : err),
      });
    }
  });

  autoUpdater.on('update-available', (info) => {
    const win = getMainWindow();
    if (!win) return;
    dialog.showMessageBox(win, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否下载？`,
      buttons: ['下载', '稍后'],
      defaultId: 0,
      cancelId: 1,
    }).then((r) => {
      if (r.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', () => {
    const win = getMainWindow();
    if (win) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本。',
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    const win = getMainWindow();
    if (!win) return;
    dialog.showMessageBox(win, {
      type: 'info',
      title: '更新已下载',
      message: `版本 ${info.version} 已下载，是否立即重启安装？`,
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
    }).then((r) => {
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
  });

  return {
    checkForUpdates: () => {
      autoUpdater.checkForUpdates().catch(() => { /* error 事件已提示 */ });
    },
  };
}

module.exports = { setupAutoUpdater };

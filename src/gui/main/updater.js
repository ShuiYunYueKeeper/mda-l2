const { dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { t } = require('./i18n');

/**
 * electron-updater：仅打包后启用。
 * - 本项目默认无 Authenticode 证书，须关闭 Windows 签名校验，否则无签名包无法更新。
 * - alpha/beta 开启 allowPrerelease。
 * - 404 / 缺 latest.yml 时给出可读提示（勿把 HTTP 堆栈扔给用户）。
 */
function setupAutoUpdater(app, getMainWindow) {
  if (!app.isPackaged) {
    return { checkForUpdates: () => {} };
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  // 开源 / 未购买代码签名证书时产物无数字签名；保持与发布者声明一致即可更新。
  autoUpdater.verifyUpdateCodeSignature = false;

  const ver = app.getVersion() || '';
  if (/-(alpha|beta|rc)(\.|$)/i.test(ver) || /alpha|beta|rc/i.test(ver)) {
    autoUpdater.allowPrerelease = true;
  }

  function friendlyUpdateError(err) {
    const raw = String((err && (err.message || err)) || '');
    const lower = raw.toLowerCase();
    if (
      lower.includes('latest.yml') ||
      lower.includes('alpha.yml') ||
      lower.includes('beta.yml') ||
      (lower.includes('404') && lower.includes('github'))
    ) {
      return t('updateFailNoChannel');
    }
    if (
      lower.includes('enetunreach') ||
      lower.includes('enotfound') ||
      lower.includes('timed out') ||
      lower.includes('network') ||
      lower.includes('offline')
    ) {
      return t('updateFailNetwork');
    }
    // 截断过长堆栈，只留首行
    const firstLine = raw.split(/\r?\n/)[0].slice(0, 240);
    return t('updateFailGeneric', { detail: firstLine });
  }

  autoUpdater.on('error', (err) => {
    const win = getMainWindow();
    if (win) {
      dialog.showMessageBox(win, {
        type: 'error',
        title: t('updateFailTitle'),
        message: friendlyUpdateError(err),
      });
    }
  });

  autoUpdater.on('update-available', (info) => {
    const win = getMainWindow();
    if (!win) return;
    dialog.showMessageBox(win, {
      type: 'info',
      title: t('updateAvailableTitle'),
      message: t('updateAvailableMsg', { version: info.version }),
      buttons: [t('updateDownload'), t('updateLater')],
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
        title: t('updateLatestTitle'),
        message: t('updateLatestMsg'),
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    const win = getMainWindow();
    if (!win) return;
    dialog.showMessageBox(win, {
      type: 'info',
      title: t('updateDownloadedTitle'),
      message: t('updateDownloadedMsg', { version: info.version }),
      buttons: [t('updateRestartNow'), t('updateLater')],
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

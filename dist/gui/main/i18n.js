/**
 * 主进程轻量 i18n：中 / 英。
 * 优先级：用户偏好（settings）> 环境变量 MDA_LANG > 系统语言。
 * 偏好：system | zh | en，存于 userData/mda-settings.json。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const STRINGS = {
  zh: {
    menuFile: '文件',
    menuNew: '新建',
    menuOpen: '打开',
    menuOpenFolder: '打开文件夹',
    menuRecent: '最近文件',
    menuRecentEmpty: '(无)',
    menuClearRecent: '清空列表',
    menuSave: '保存',
    menuSaveAs: '另存为',
    menuShowInFolder: '打开文件所在目录',
    menuReload: '重新加载',
    menuCopyArticle: '复制预览（微信公众号）',
    menuExportHtml: '导出 HTML',
    menuExportPdf: '导出 PDF',
    menuExportDocx: '导出 Word',
    menuQuit: '退出',
    menuView: '视图',
    menuEditPane: '编辑栏',
    menuAnnoPane: '批注栏',
    menuDarkMode: '切换深色模式',
    menuSettings: '设置…',
    menuLanguage: '界面语言',
    menuLangSystem: '跟随系统',
    menuLangZh: '中文',
    menuLangEn: 'English',
    menuDevTools: '开发者工具',
    menuAutosaveOff: '关闭',
    menuAutosaveBlur: '失焦保存',
    menuAutosaveInterval30: '每 30 秒',
    menuAutosaveInterval60: '每 60 秒',
    menuHelp: '帮助',
    menuHelpShortcuts: '功能与快捷键',
    menuCheckUpdate: '检查更新',
    openMdTitle: '打开 Markdown 文件',
    openFolderTitle: '打开文件夹',
    filterMarkdown: 'Markdown',
    updateDevOnly: '开发模式下不可用；请使用已打包的安装版检查更新。',
    updateCheckTitle: '检查更新',
    updateFailTitle: '更新检查失败',
    updateFailNoChannel:
      '未找到更新清单（latest.yml）。请确认 GitHub Release 已通过 electron-builder 发布并上传安装包与清单；当前发行版若仅含源码 zip，检查更新将不可用。',
    updateFailNetwork: '无法连接更新服务器，请检查网络后重试。',
    errImageEmpty: '无法读取图片',
    updateFailGeneric: '检查更新失败：{detail}',
    updateAvailableTitle: '发现新版本',
    updateAvailableMsg: '发现新版本 {version}，是否下载？',
    updateDownload: '下载',
    updateLater: '稍后',
    updateLatestTitle: '检查更新',
    updateLatestMsg: '当前已是最新版本。',
    updateDownloadedTitle: '更新已下载',
    updateDownloadedMsg: '版本 {version} 已下载，是否立即重启安装？',
    updateRestartNow: '立即重启',
  },
  en: {
    menuFile: 'File',
    menuNew: 'New',
    menuOpen: 'Open',
    menuOpenFolder: 'Open Folder',
    menuRecent: 'Recent Files',
    menuRecentEmpty: '(Empty)',
    menuClearRecent: 'Clear List',
    menuSave: 'Save',
    menuSaveAs: 'Save As',
    menuShowInFolder: 'Show in Folder',
    menuReload: 'Reload',
    menuCopyArticle: 'Copy Preview (WeChat)',
    menuExportHtml: 'Export HTML',
    menuExportPdf: 'Export PDF',
    menuExportDocx: 'Export Word',
    menuQuit: 'Quit',
    menuView: 'View',
    menuEditPane: 'Editor Pane',
    menuAnnoPane: 'Annotation Pane',
    menuDarkMode: 'Toggle Dark Mode',
    menuSettings: 'Settings…',
    menuLanguage: 'Language',
    menuLangSystem: 'System Default',
    menuLangZh: '中文',
    menuLangEn: 'English',
    menuDevTools: 'Developer Tools',
    menuAutosaveOff: 'Off',
    menuAutosaveBlur: 'On blur',
    menuAutosaveInterval30: 'Every 30s',
    menuAutosaveInterval60: 'Every 60s',
    menuHelp: 'Help',
    menuHelpShortcuts: 'Features & Shortcuts',
    menuCheckUpdate: 'Check for Updates',
    openMdTitle: 'Open Markdown File',
    openFolderTitle: 'Open Folder',
    filterMarkdown: 'Markdown',
    updateDevOnly: 'Not available in development mode. Use a packaged build to check for updates.',
    updateCheckTitle: 'Check for Updates',
    updateFailTitle: 'Update Check Failed',
    updateFailNoChannel:
      'Update manifest (latest.yml) was not found. Publish a GitHub Release with electron-builder so the installer and latest.yml are uploaded. Source-only releases cannot be used for updates.',
    updateFailNetwork: 'Cannot reach the update server. Check your network and try again.',
    errImageEmpty: 'Could not read image',
    updateFailGeneric: 'Update check failed: {detail}',
    updateAvailableTitle: 'Update Available',
    updateAvailableMsg: 'Version {version} is available. Download now?',
    updateDownload: 'Download',
    updateLater: 'Later',
    updateLatestTitle: 'Check for Updates',
    updateLatestMsg: 'You are on the latest version.',
    updateDownloadedTitle: 'Update Downloaded',
    updateDownloadedMsg: 'Version {version} has been downloaded. Restart to install?',
    updateRestartNow: 'Restart Now',
  },
};

let appRef = null;
let currentLang = 'zh';
let langPref = 'system'; // system | zh | en

function settingsPath() {
  if (!appRef) return null;
  return path.join(appRef.getPath('userData'), 'mda-settings.json');
}

function readSettings() {
  const p = settingsPath();
  if (!p) return {};
  try {
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writeSettings(partial) {
  const p = settingsPath();
  if (!p) return;
  try {
    const cur = readSettings();
    const next = Object.assign({}, cur, partial);
    fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
  } catch (_) { /* ignore */ }
}

function systemLang(app) {
  let locale = '';
  try {
    if (app && typeof app.getLocale === 'function') locale = app.getLocale() || '';
  } catch (_) { /* ignore */ }
  if (!locale) {
    try {
      locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    } catch (_) {
      locale = '';
    }
  }
  locale = String(locale).toLowerCase().replace('_', '-');
  return locale.startsWith('zh') ? 'zh' : 'en';
}

function normalizePref(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'zh' || s === 'zh-cn' || s === 'zh_cn' || s === 'cn') return 'zh';
  if (s === 'en' || s === 'en-us' || s === 'en_us') return 'en';
  if (s === 'system' || s === 'auto' || s === '') return 'system';
  return null;
}

function resolveLang(app, pref) {
  const forced = normalizePref(process.env.MDA_LANG);
  // 显式 zh/en 环境变量优先生效（便于调试）；system 环境变量不拦截偏好
  if (forced === 'zh' || forced === 'en') return forced;

  const p = pref || langPref;
  if (p === 'zh' || p === 'en') return p;
  return systemLang(app);
}

function initI18n(app) {
  appRef = app;
  const settings = readSettings();
  const fromFile = normalizePref(settings.lang);
  langPref = fromFile || 'system';
  currentLang = resolveLang(app, langPref);
  return currentLang;
}

function getLang() {
  return currentLang;
}

function getLangPref() {
  return langPref;
}

/**
 * @param {'system'|'zh'|'en'} pref
 * @returns {{ lang: string, pref: string }}
 */
function setLangPref(pref) {
  const n = normalizePref(pref) || 'system';
  langPref = n === 'zh' || n === 'en' ? n : 'system';
  writeSettings({ lang: langPref });
  currentLang = resolveLang(appRef, langPref);
  return { lang: currentLang, pref: langPref };
}

function t(key, vars) {
  const table = STRINGS[currentLang] || STRINGS.zh;
  let s = table[key] != null ? table[key] : (STRINGS.zh[key] || key);
  if (vars) {
    Object.keys(vars).forEach(function (k) {
      s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
    });
  }
  return s;
}

module.exports = {
  initI18n,
  getLang,
  getLangPref,
  setLangPref,
  t,
  systemLang,
};

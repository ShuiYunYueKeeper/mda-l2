// 打包前释放 release/win-unpacked（避免 EBUSY: app.asar 被占用）。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* wait */ }
}

function killMdaOnWindows() {
  if (process.platform !== 'win32') return;
  try {
    execSync('taskkill /IM MDA.exe /F', { stdio: 'ignore' });
    console.log('  pre-dist: 已结束正在运行的 MDA.exe');
    sleep(500);
  } catch {
    /* 未运行 */
  }
}

function rmWithRetry(target, retries) {
  if (!fs.existsSync(target)) return;
  var lastErr;
  for (var i = 0; i < retries; i++) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (err) {
      lastErr = err;
      if (err && err.code === 'EBUSY' && i < retries - 1) {
        console.log('  pre-dist: ' + path.basename(target) + ' 仍被占用，' + (i + 2) + 's 后重试…');
        sleep(1500);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

var root = path.join(__dirname, '..');
var unpacked = path.join(root, 'release', 'win-unpacked');

killMdaOnWindows();

try {
  rmWithRetry(unpacked, 5);
  if (fs.existsSync(unpacked)) {
    console.error('  pre-dist: 无法删除 release/win-unpacked');
    process.exit(1);
  }
  console.log('  pre-dist: 已清理 release/win-unpacked');
} catch (err) {
  console.error('  pre-dist 失败: ' + (err && err.message ? err.message : String(err)));
  console.error('  请先：① 关闭所有 MDA 窗口  ② 关闭资源管理器中打开的 release 目录  ③ 稍等杀毒扫描结束后再试');
  process.exit(1);
}

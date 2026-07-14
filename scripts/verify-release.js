// 打包后校验 win-unpacked 是否包含 Electron 运行时全部必需文件（避免只拷贝 MDA.exe 或便携版缺 DLL）。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
const unpacked = path.join(root, 'release', 'win-unpacked');

/** 与 node_modules/electron/dist 根目录一致（exe 名在打包后为 MDA.exe） */
const REQUIRED_FILES = [
  'MDA.exe',
  'ffmpeg.dll',
  'd3dcompiler_47.dll',
  'libEGL.dll',
  'libGLESv2.dll',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json',
  'vulkan-1.dll',
  'chrome_100_percent.pak',
  'chrome_200_percent.pak',
  'icudtl.dat',
  'resources.pak',
  'snapshot_blob.bin',
  'v8_context_snapshot.bin',
];

const REQUIRED_DIRS = [
  ['locales', (dir) => fs.readdirSync(dir).some((f) => f.endsWith('.pak'))],
  ['resources', (dir) => fs.existsSync(path.join(dir, 'app.asar'))],
];

function fail(msg) {
  console.error('  verify-release: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(unpacked)) {
  fail('未找到 release/win-unpacked，请先执行 npm run dist:win');
}

const missing = [];
for (const name of REQUIRED_FILES) {
  const p = path.join(unpacked, name);
  if (!fs.existsSync(p)) missing.push(name);
  else if (fs.statSync(p).size === 0) missing.push(name + ' (空文件)');
}

for (const [subdir, check] of REQUIRED_DIRS) {
  const p = path.join(unpacked, subdir);
  if (!fs.existsSync(p)) missing.push(subdir + '/');
  else if (!check(p)) missing.push(subdir + '/ (内容不完整)');
}

if (missing.length) {
  console.error('  缺少以下运行时文件：');
  missing.forEach((m) => console.error('    - ' + m));
  fail('win-unpacked 不完整');
}

const portable = path.join(root, 'release', `MDA-${version}-portable-win-x64.exe`);
const zip = path.join(root, 'release', `MDA-${version}-win-x64.zip`);
const nsis = path.join(root, 'release', `MDA-${version}-win-x64.exe`);
const latestYml = path.join(root, 'release', 'latest.yml');

console.log('  verify-release: win-unpacked OK (' + REQUIRED_FILES.length + ' 个根文件 + locales + resources)');
if (fs.existsSync(portable)) {
  console.log('  portable: ' + path.basename(portable) + ' (' + Math.round(fs.statSync(portable).size / 1024 / 1024) + ' MB)');
}
if (fs.existsSync(zip)) {
  console.log('  zip: ' + path.basename(zip) + ' (' + Math.round(fs.statSync(zip).size / 1024 / 1024) + ' MB)');
}
if (fs.existsSync(nsis)) {
  console.log('  nsis: ' + path.basename(nsis) + ' (' + Math.round(fs.statSync(nsis).size / 1024 / 1024) + ' MB)');
}
if (fs.existsSync(latestYml)) {
  console.log('  updater meta: latest.yml');
} else {
  console.warn('  verify-release: 未找到 latest.yml（publish 元数据未写出，检查更新将不可用）');
}

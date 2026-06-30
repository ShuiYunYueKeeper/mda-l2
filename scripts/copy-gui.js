// Copy non-TS assets to dist/（GUI 资源 + 外置配置 JSON）。
// tsc 不会把被 import 的 .json 输出到 outDir，故需在此显式复制配置文件，
// 否则 dist/core/*.js 运行时 require('../config/annotation-schema.json') 会找不到。
const fs = require('fs');
const path = require('path');

fs.mkdirSync(path.join(__dirname, '..', 'dist', 'gui', 'renderer'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '..', 'dist', 'config'), { recursive: true });

const files = [
  ['src/gui/main.js', 'dist/gui/main.js'],
  ['src/gui/preload.js', 'dist/gui/preload.js'],
  ['src/gui/renderer/index.html', 'dist/gui/renderer/index.html'],
  ['src/gui/renderer/app.js', 'dist/gui/renderer/app.js'],
  ['src/config/annotation-schema.json', 'dist/config/annotation-schema.json'],
];

for (const [src, dst] of files) {
  const srcPath = path.join(__dirname, '..', src);
  const dstPath = path.join(__dirname, '..', dst);
  fs.copyFileSync(srcPath, dstPath);
  console.log('  copied: ' + dst);
}

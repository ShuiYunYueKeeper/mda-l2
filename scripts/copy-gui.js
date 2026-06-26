// Copy GUI files to dist/
const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, '..', 'dist', 'gui', 'renderer');
fs.mkdirSync(dest, { recursive: true });

const files = [
  ['src/gui/main.js', 'dist/gui/main.js'],
  ['src/gui/preload.js', 'dist/gui/preload.js'],
  ['src/gui/renderer/index.html', 'dist/gui/renderer/index.html'],
  ['src/gui/renderer/app.js', 'dist/gui/renderer/app.js'],
];

for (const [src, dst] of files) {
  const srcPath = path.join(__dirname, '..', src);
  const dstPath = path.join(__dirname, '..', dst);
  fs.copyFileSync(srcPath, dstPath);
  console.log('  copied: ' + dst);
}

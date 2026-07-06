// electron-builder / @electron/rebuild 用 JSON.parse 读 package.json，UTF-8 BOM 会导致打包失败。
// 在 dist:* 前自动剥离根目录 package.json（及 package-lock.json）的 BOM。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
for (const name of ['package.json', 'package-lock.json']) {
  const filePath = path.join(root, name);
  if (!fs.existsSync(filePath)) continue;
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    fs.writeFileSync(filePath, buf.subarray(3));
    console.log('  stripped UTF-8 BOM: ' + name);
  }
}

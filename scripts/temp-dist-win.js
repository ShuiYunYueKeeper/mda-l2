/**
 * 临时 Windows 打包：electron-builder 26 不允许 electron 在 dependencies，
 * 打包期间暂移到 devDependencies，结束后恢复 package.json。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const original = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(original);

function moveElectronToDev() {
  if (!pkg.dependencies || !pkg.dependencies.electron) return;
  const v = pkg.dependencies.electron;
  delete pkg.dependencies.electron;
  pkg.devDependencies = pkg.devDependencies || {};
  if (!pkg.devDependencies.electron) pkg.devDependencies.electron = v;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function restore() {
  fs.writeFileSync(pkgPath, original);
}

moveElectronToDev();
try {
  execSync(
    'npm run build && node scripts/ensure-no-bom.js && node scripts/pre-dist.js && npx electron-builder --win',
    { cwd: root, stdio: 'inherit', env: process.env }
  );
  try {
    execSync('node scripts/verify-release.js', { cwd: root, stdio: 'inherit' });
  } catch (e) {
    console.warn('  verify-release 未通过或跳过（临时包可忽略）');
  }
} finally {
  restore();
}

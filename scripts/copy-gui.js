// Copy non-TS assets to dist/（GUI 资源 + 外置配置 JSON）。
// tsc 不会把被 import 的 .json 输出到 outDir，故需在此显式复制配置文件，
// 否则 dist/core/*.js 运行时 require('../config/annotation-schema.json') 会找不到。
const fs = require('fs');
const path = require('path');

fs.mkdirSync(path.join(__dirname, '..', 'dist', 'gui', 'renderer'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '..', 'dist', 'gui', 'main'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '..', 'dist', 'config'), { recursive: true });

const files = [
  ['src/gui/launcher.js', 'dist/gui/launcher.js'],
  ['src/gui/main.js', 'dist/gui/main.js'],
  ['src/gui/preload.js', 'dist/gui/preload.js'],
  ['src/gui/main/recent-files.js', 'dist/gui/main/recent-files.js'],
  ['src/gui/main/workspace-prefs.js', 'dist/gui/main/workspace-prefs.js'],
  ['src/gui/main/file-ops.js', 'dist/gui/main/file-ops.js'],
  ['src/gui/main/markdown-tree.js', 'dist/gui/main/markdown-tree.js'],
  ['src/gui/main/updater.js', 'dist/gui/main/updater.js'],
  ['src/gui/main/i18n.js', 'dist/gui/main/i18n.js'],
  ['src/gui/main/clipboard-image.js', 'dist/gui/main/clipboard-image.js'],
  ['src/gui/main/paste-assets.js', 'dist/gui/main/paste-assets.js'],
  ['src/gui/main/paste-prefs.js', 'dist/gui/main/paste-prefs.js'],
  ['src/gui/main/image-path.js', 'dist/gui/main/image-path.js'],
  ['src/gui/renderer/i18n.js', 'dist/gui/renderer/i18n.js'],
  ['src/gui/renderer/index.html', 'dist/gui/renderer/index.html'],
  ['src/gui/renderer/app.js', 'dist/gui/renderer/app.js'],
  ['src/gui/renderer/welcome.js', 'dist/gui/renderer/welcome.js'],
  ['src/gui/renderer/file-sidebar.js', 'dist/gui/renderer/file-sidebar.js'],
  ['src/gui/renderer/sync-scroll.js', 'dist/gui/renderer/sync-scroll.js'],
  ['src/gui/renderer/find-replace.js', 'dist/gui/renderer/find-replace.js'],
  ['src/gui/renderer/editor-assist.js', 'dist/gui/renderer/editor-assist.js'],
  ['src/gui/renderer/outline-panel.js', 'dist/gui/renderer/outline-panel.js'],
  ['src/gui/renderer/selection-anchor.js', 'dist/gui/renderer/selection-anchor.js'],
  ['src/gui/renderer/anchor-highlights.js', 'dist/gui/renderer/anchor-highlights.js'],
  ['src/gui/renderer/katex-export.js', 'dist/gui/renderer/katex-export.js'],
  ['src/gui/renderer/settings-ai.js', 'dist/gui/renderer/settings-ai.js'],
  ['src/gui/renderer/ai-panel.js', 'dist/gui/renderer/ai-panel.js'],
  ['src/pro/license.js', 'dist/pro/license.js'],
  ['src/pro/feature-gate.js', 'dist/pro/feature-gate.js'],
  ['src/pro/ai/settings.js', 'dist/pro/ai/settings.js'],
  ['src/pro/ai/provider.js', 'dist/pro/ai/provider.js'],
  ['src/pro/ai/prompts.js', 'dist/pro/ai/prompts.js'],
  ['src/config/annotation-schema.json', 'dist/config/annotation-schema.json'],
];

fs.mkdirSync(path.join(__dirname, '..', 'dist', 'pro', 'ai'), { recursive: true });

for (const [src, dst] of files) {
  const srcPath = path.join(__dirname, '..', src);
  const dstPath = path.join(__dirname, '..', dst);
  fs.copyFileSync(srcPath, dstPath);
  console.log('  copied: ' + dst);
}

// mermaid 离线单文件 UMD（自包含，供 index.html 本地引入渲染流程图）。
// 直接从 node_modules 复制，避免把 3MB 产物放进 src。
try {
  const mermaidSrc = path.join(
    path.dirname(require.resolve('mermaid/package.json')),
    'dist',
    'mermaid.min.js',
  );
  const mermaidDst = path.join(__dirname, '..', 'dist', 'gui', 'renderer', 'mermaid.min.js');
  fs.copyFileSync(mermaidSrc, mermaidDst);
  console.log('  copied: dist/gui/renderer/mermaid.min.js');
} catch (e) {
  throw new Error('缺少必需的 Mermaid GUI 资源：' + e.message);
}

try {
  const katexDir = path.dirname(require.resolve('katex/package.json'));
  const katexCssSrc = path.join(katexDir, 'dist', 'katex.min.css');
  const katexCssDst = path.join(__dirname, '..', 'dist', 'gui', 'renderer', 'katex.min.css');
  fs.copyFileSync(katexCssSrc, katexCssDst);
  console.log('  copied: dist/gui/renderer/katex.min.css');
  const fontsSrc = path.join(katexDir, 'dist', 'fonts');
  const fontsDst = path.join(__dirname, '..', 'dist', 'gui', 'renderer', 'fonts');
  if (fs.existsSync(fontsSrc)) {
    fs.cpSync(fontsSrc, fontsDst, { recursive: true });
    console.log('  copied: dist/gui/renderer/fonts/');
  } else {
    throw new Error('缺少必需的 KaTeX 字体目录：' + fontsSrc);
  }
} catch (e) {
  throw new Error('缺少必需的 KaTeX GUI 资源：' + e.message);
}

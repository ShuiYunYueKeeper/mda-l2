/**
 * 将 src/gui/renderer/editor 与 CodeMirror 6 打成单文件 IIFE，
 * 供 index.html 以 <script> 引入（渲染进程 nodeIntegration:false，不能 require）。
 */
'use strict';

const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'src', 'gui', 'renderer', 'editor', 'index.js');
const outfile = path.join(root, 'dist', 'gui', 'renderer', 'editor.bundle.js');

const watch = process.argv.includes('--watch');

const opts = {
  entryPoints: [entry],
  bundle: true,
  outfile,
  format: 'iife',
  globalName: 'MDAEditorBundle',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: true,
  logLevel: 'info',
  define: {
    __MDA_EDITOR_RELEASE__: JSON.stringify(process.env.MDA_EDITOR_RELEASE === '1'),
  },
  // 渲染层最终挂到 window.MDAEditor（见 entry 末尾赋值）
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
    console.log('  watch:editor → ' + path.relative(root, outfile));
    return;
  }
  await esbuild.build(opts);
  console.log('  bundled: dist/gui/renderer/editor.bundle.js');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

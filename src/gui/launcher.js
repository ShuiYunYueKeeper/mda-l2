#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const child = spawn(
  electron,
  [path.join(__dirname, 'main.js'), ...process.argv.slice(2)],
  { stdio: 'inherit', windowsHide: false },
);

child.on('error', (error) => {
  process.stderr.write(`MDA GUI 启动失败: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = typeof code === 'number' ? code : (signal ? 1 : 0);
});

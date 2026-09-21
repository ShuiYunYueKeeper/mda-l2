#!/usr/bin/env node
/**
 * Sync l2-project-template/ and skill metadata into skills/l2-project-template/.
 * Run after editing the standalone template folder or skill scripts.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const templateSrc = path.join(repoRoot, 'l2-project-template');
const skillRoot = path.join(repoRoot, 'skills', 'l2-project-template');
const skillTemplateDest = path.join(skillRoot, 'template');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source not found: ${src}`);
  }
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  function walk(s, d) {
    fs.mkdirSync(d, { recursive: true });
    for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
      const sp = path.join(s, entry.name);
      const dp = path.join(d, entry.name);
      if (entry.isDirectory()) walk(sp, dp);
      else fs.copyFileSync(sp, dp);
    }
  }
  walk(src, dest);
}

function main() {
  console.log('Syncing l2-project-template → skills/l2-project-template/template');
  copyDirRecursive(templateSrc, skillTemplateDest);
  console.log(`✓ ${skillTemplateDest}`);
  console.log('\nRun npm run skill:install to push to ~/.cursor/skills/');
}

main();

#!/usr/bin/env node
/**
 * Install l2-project-template skill to Cursor agent skills directory.
 *
 * Usage:
 *   node scripts/install-l2-skill.js           # global (~/.cursor/skills/)
 *   node scripts/install-l2-skill.js --project  # project (.cursor/skills/)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_NAME = 'l2-project-template';

function parseArgs(argv) {
  const project = argv.includes('--project') || argv.includes('-p');
  const global = argv.includes('--global') || argv.includes('-g') || !project;
  return { global, project };
}

function findRepoRoot(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'skills', SKILL_NAME, 'SKILL.md');
    if (fs.existsSync(candidate)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Cannot find skills/${SKILL_NAME}/SKILL.md. Run from mda-l2 repo or pass REPO_ROOT env.`
      );
    }
    dir = parent;
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getTargetDirs({ global, project }) {
  const home = os.homedir();
  const targets = [];

  if (global) {
    targets.push({
      label: 'global (Cursor user skills)',
      dir: path.join(home, '.cursor', 'skills', SKILL_NAME),
    });
    // Claude Code / agents ecosystem
    targets.push({
      label: 'global (Claude .agents skills)',
      dir: path.join(home, '.agents', 'skills', SKILL_NAME),
    });
  }

  if (project) {
    const cwd = process.cwd();
    targets.push({
      label: 'project (.cursor/skills)',
      dir: path.join(cwd, '.cursor', 'skills', SKILL_NAME),
    });
  }

  return targets;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = process.env.REPO_ROOT
    ? path.resolve(process.env.REPO_ROOT)
    : findRepoRoot(__dirname);
  const srcDir = path.join(repoRoot, 'skills', SKILL_NAME);

  if (!fs.existsSync(path.join(srcDir, 'SKILL.md'))) {
    console.error(`Skill source not found: ${srcDir}`);
    process.exit(1);
  }

  const targets = getTargetDirs(opts);
  console.log(`Installing ${SKILL_NAME} from:\n  ${srcDir}\n`);

  for (const { label, dir } of targets) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    copyDirRecursive(srcDir, dir);
    console.log(`✓ ${label}\n  → ${dir}`);
  }

  console.log('\nDone. Trigger in Cursor: "用 L2 模板创建项目"');
  console.log('Init scaffold:');
  if (process.platform === 'win32') {
    console.log(
      `  & "$env:USERPROFILE\\.cursor\\skills\\${SKILL_NAME}\\scripts\\init-project.ps1" -TargetPath "D:\\projects\\my-app" -ProjectName "my-app"`
    );
  } else {
    console.log(
      `  bash ~/.cursor/skills/${SKILL_NAME}/scripts/init-project.sh ~/projects/my-app my-app`
    );
  }
}

main();

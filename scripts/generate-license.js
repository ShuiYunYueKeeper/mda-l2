#!/usr/bin/env node
/**
 * 签发 MDA Pro 离线激活码（开发 / 运营侧）。
 * 用法：
 *   node scripts/generate-license.js
 *   node scripts/generate-license.js --exp 1893456000
 *   node scripts/generate-license.js --days 365
 */
'use strict';

const path = require('path');
const { mintLicense } = require(path.join(__dirname, '..', 'src', 'pro', 'license.js'));

function parseArgs(argv) {
  const out = { exp: null, days: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exp' && argv[i + 1]) {
      out.exp = Number(argv[++i]);
    } else if (a === '--days' && argv[i + 1]) {
      out.days = Number(argv[++i]);
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
if (args.help) {
  process.stderr.write(
    'Usage: node scripts/generate-license.js [--days N | --exp unixSeconds]\n',
  );
  process.exit(0);
}

let exp = null;
if (args.days != null && Number.isFinite(args.days)) {
  exp = Math.floor(Date.now() / 1000) + Math.floor(args.days * 86400);
} else if (args.exp != null && Number.isFinite(args.exp)) {
  exp = args.exp;
}

let key;
try {
  key = mintLicense({ exp });
} catch (err) {
  process.stderr.write((err && err.message ? err.message : '签发失败') + '\n');
  process.exit(1);
}
process.stdout.write(key + '\n');

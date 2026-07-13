import * as fs from 'fs';
import {
  ANNOTATION_LEVELS,
  ANNOTATION_STATUSES,
  isAnnotationLevel,
  isAnnotationStatus,
} from '../../core/model';
import { collectScanRows } from '../scan-service';

interface ScanOptions {
  recursive?: boolean;
  format?: string;
  status?: string;
  level?: string;
}

// ---------- 显示宽度工具（CJK 全角字符按 2 列计算） ----------

function isWide(cp: number): boolean {
  return (
    cp >= 0x1100 &&
    (cp <= 0x115f || // Hangul Jamo
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || // CJK 部首..注音
      (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul 音节
      (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意
      (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK 兼容形式
      (cp >= 0xff00 && cp <= 0xff60) || // 全角形式
      (cp >= 0xffe0 && cp <= 0xffe6))
  );
}

function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += isWide(ch.codePointAt(0)!) ? 2 : 1;
  }
  return w;
}

function truncateToWidth(s: string, maxWidth: number): string {
  let w = 0;
  let out = '';
  for (const ch of s) {
    const cw = isWide(ch.codePointAt(0)!) ? 2 : 1;
    if (w + cw > maxWidth - 1) {
      return out + '…';
    }
    out += ch;
    w += cw;
  }
  return out;
}

function padToWidth(s: string, width: number): string {
  const pad = width - displayWidth(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
}

function summarizeText(text: string, maxWidth: number): string {
  const cleaned = text.replace(/[#*_>`\[\]()!~|]/g, '').replace(/\s+/g, ' ').trim();
  return truncateToWidth(cleaned, maxWidth);
}

export function scanCommand(target: string, opts: ScanOptions): void {
  // 过滤值校验
  if (opts.status && !isAnnotationStatus(opts.status)) {
    process.stderr.write(`错误: 无效状态 "${opts.status}"，可选: ${ANNOTATION_STATUSES.join(', ')}\n`);
    process.exit(1);
  }
  if (opts.level && !isAnnotationLevel(opts.level)) {
    process.stderr.write(`错误: 无效级别 "${opts.level}"，可选: ${ANNOTATION_LEVELS.join(', ')}\n`);
    process.exit(1);
  }

  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) {
    process.stderr.write(`错误: 文件或目录不存在: ${target}\n`);
    process.exit(1);
  }

  if (stat.isDirectory() && !opts.recursive && opts.format !== 'json') {
    process.stderr.write('提示: 使用 -r 递归扫描目录\n');
  }

  const rows = collectScanRows(target, {
    recursive: opts.recursive,
    status: opts.status,
    level: opts.level,
  });

  if (opts.format === 'json') {
    process.stdout.write(JSON.stringify(rows.map(r => r.anno), null, 2) + '\n');
    return;
  }

  if (rows.length === 0) {
    process.stdout.write('(无批注)\n');
    return;
  }

  const cols = {
    id: 8,
    file: 20,
    line: 6,
    para: 32,
    content: 32,
    level: 10,
    status: 10,
  };

  const hdr =
    padToWidth('ID', cols.id) +
    padToWidth('文件', cols.file) +
    padToWidth('行号', cols.line) +
    padToWidth('段落摘要', cols.para) +
    padToWidth('批注摘要', cols.content) +
    padToWidth('级别', cols.level) +
    padToWidth('状态', cols.status);
  process.stdout.write(hdr + '\n');
  process.stdout.write('─'.repeat(displayWidth(hdr)) + '\n');

  for (const { anno, paragraphText } of rows) {
    const id = (anno.id ?? '').slice(0, 8);
    const file = truncateToWidth(anno.file ?? target, cols.file - 1);
    const line = String(anno.line ?? '?');
    const para = summarizeText(paragraphText, cols.para - 1);
    const cont = summarizeText(anno.content, cols.content - 1);

    process.stdout.write(
      padToWidth(id, cols.id) +
        padToWidth(file, cols.file) +
        padToWidth(line, cols.line) +
        padToWidth(para, cols.para) +
        padToWidth(cont, cols.content) +
        padToWidth(anno.level, cols.level) +
        padToWidth(anno.status, cols.status) +
        '\n',
    );
  }
}

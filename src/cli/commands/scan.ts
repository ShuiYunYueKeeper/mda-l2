import * as fs from 'fs';
import * as path from 'path';
import { parseAnnotations } from '../../core/parser';
import {
  Annotation,
  ANNOTATION_LEVELS,
  ANNOTATION_STATUSES,
  isAnnotationLevel,
  isAnnotationStatus,
} from '../../core/model';

interface ScanOptions {
  recursive?: boolean;
  format?: string;
  status?: string;
  level?: string;
}

interface AnnoRow {
  anno: Annotation;
  paragraphText: string;
}

function scanFile(filePath: string): AnnoRow[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const { annotations, paragraphs } = parseAnnotations(text);

  // 建立 批注 id → 所属段落文本 的映射
  const paraById = new Map<string, string>();
  for (const p of paragraphs) {
    for (const a of p.annotations) {
      paraById.set(a.id, p.text);
    }
  }

  return annotations.map(a => {
    a.file = filePath;
    return { anno: a, paragraphText: paraById.get(a.id) ?? '' };
  });
}

function scanDir(dirPath: string, recursive: boolean): AnnoRow[] {
  const results: AnnoRow[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...scanDir(fullPath, recursive));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(...scanFile(fullPath));
    }
  }

  return results;
}

function filterRows(rows: AnnoRow[], opts: ScanOptions): AnnoRow[] {
  return rows.filter(({ anno }) => {
    if (opts.status && anno.status !== opts.status) return false;
    if (opts.level && anno.level !== opts.level) return false;
    return true;
  });
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

  let rows: AnnoRow[];
  if (stat.isDirectory()) {
    if (!opts.recursive && opts.format !== 'json') {
      process.stderr.write('提示: 使用 -r 递归扫描目录\n');
    }
    rows = scanDir(target, opts.recursive ?? false);
  } else {
    rows = scanFile(target);
  }

  rows = filterRows(rows, opts);

  if (opts.format === 'json') {
    process.stdout.write(JSON.stringify(rows.map(r => r.anno), null, 2) + '\n');
    return;
  }

  // 表格格式
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

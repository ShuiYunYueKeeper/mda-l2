import * as fs from 'fs';
import * as path from 'path';
import { parseAnnotations } from '../../core/parser';
import { Annotation, Paragraph } from '../../core/model';

interface ScanOptions {
  recursive?: boolean;
  format?: string;
  status?: string;
  level?: string;
}

function scanFile(filePath: string): Annotation[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const { annotations } = parseAnnotations(text);
  return annotations;
}

function scanDir(dirPath: string, recursive: boolean): Annotation[] {
  const results: Annotation[] = [];
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

function filterAnnotations(annotations: Annotation[], opts: ScanOptions): Annotation[] {
  return annotations.filter(a => {
    if (opts.status && a.status !== opts.status) return false;
    if (opts.level && a.level !== opts.level) return false;
    return true;
  });
}

function summarizeText(text: string, maxLen: number): string {
  const cleaned = text.replace(/[#*_>`\[\]()!~|]/g, '').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + '…';
}

export function scanCommand(target: string, opts: ScanOptions): void {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) {
    process.stderr.write(`错误: 文件或目录不存在: ${target}\n`);
    process.exit(1);
  }

  let results: Annotation[];
  if (stat.isDirectory()) {
    // target 是目录
    if (!opts.recursive && opts.format !== 'json') {
      process.stderr.write('提示: 使用 -r 递归扫描目录\n');
    }
    results = scanDir(target, opts.recursive ?? false);
    // 目录模式下不设置 file 字段
  } else {
    // target 是文件
    results = scanFile(target);
    // 设置 file 字段为传入的路径
    for (const a of results) {
      a.file = target;
    }
  }

  results = filterAnnotations(results, opts);

  if (opts.format === 'json') {
    // stdout 仅 JSON
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    return;
  }

  // 表格格式
  if (results.length === 0) {
    process.stdout.write('(无批注)\n');
    return;
  }

  // 表头
  const idW = 8;
  const fileW = 20;
  const lineW = 6;
  const paraW = 32;
  const contentW = 32;
  const levelW = 10;
  const statusW = 10;

  const hdr =
    'ID'.padEnd(idW) +
    '文件'.padEnd(fileW) +
    '行号'.padEnd(lineW) +
    '段落摘要'.padEnd(paraW) +
    '批注摘要'.padEnd(contentW) +
    '级别'.padEnd(levelW) +
    '状态'.padEnd(statusW);
  process.stdout.write(hdr + '\n');
  process.stdout.write('─'.repeat(hdr.length) + '\n');

  for (const a of results) {
    const id = (a.id ?? '').slice(0, 8);
    const file = (a.file ?? target).slice(-fileW);
    const line = String(a.line ?? '?');
    const para = summarizeText('', 30); // 段落摘要需要从 paragraph 获取，此处简化为文件级扫描
    const cont = summarizeText(a.content, 30);
    const level = a.level;
    const status = a.status;

    process.stdout.write(
      id.padEnd(idW) +
      file.padEnd(fileW) +
      line.padEnd(lineW) +
      para.padEnd(paraW) +
      cont.padEnd(contentW) +
      level.padEnd(levelW) +
      status.padEnd(statusW) +
      '\n',
    );
  }
}

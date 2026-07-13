import * as fs from 'fs';
import * as path from 'path';
import { parseAnnotations } from '../core/parser';
import { Annotation, isMarkdownPath } from '../core/model';

export interface ScanCollectOptions {
  recursive?: boolean;
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

  const paraById = new Map<string, string>();
  for (const p of paragraphs) {
    for (const a of p.annotations) {
      paraById.set(a.id, p.text);
    }
  }

  return annotations.map(a => {
    const copy = { ...a, file: filePath };
    return { anno: copy, paragraphText: paraById.get(a.id) ?? '' };
  });
}

function scanDir(dirPath: string, recursive: boolean): AnnoRow[] {
  const results: AnnoRow[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...scanDir(fullPath, recursive));
    } else if (entry.isFile() && isMarkdownPath(entry.name)) {
      results.push(...scanFile(fullPath));
    }
  }

  return results;
}

function filterRows(rows: AnnoRow[], opts: ScanCollectOptions): AnnoRow[] {
  return rows.filter(({ anno }) => {
    if (opts.status && anno.status !== opts.status) return false;
    if (opts.level && anno.level !== opts.level) return false;
    return true;
  });
}

function collectRows(target: string, opts: ScanCollectOptions): AnnoRow[] {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) {
    throw new Error(`文件或目录不存在: ${target}`);
  }

  let rows: AnnoRow[];
  if (stat.isDirectory()) {
    rows = scanDir(target, opts.recursive ?? false);
  } else {
    rows = scanFile(target);
  }

  return filterRows(rows, opts);
}

/** 收集批注列表（与 `mda-cli scan --format json` 输出一致） */
export function collectAnnotations(target: string, opts: ScanCollectOptions = {}): Annotation[] {
  return collectRows(target, opts).map(r => r.anno);
}

/** 含段落摘要的扫描结果（CLI 表格模式用） */
export function collectScanRows(target: string, opts: ScanCollectOptions = {}): AnnoRow[] {
  return collectRows(target, opts);
}

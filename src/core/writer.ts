import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  Annotation,
  AnnotationInput,
  AnnotationPatch,
  AnnotationLevel,
  findAnnotationByLine,
  findParagraphByLine,
  parseAnnotations,
  Paragraph,
} from './index';

// ---------- 原子写入 ----------

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpName = `.${base}.${randomUUID()}.tmp`;
  const tmpPath = path.join(dir, tmpName);

  try {
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    // 清理临时文件
    try {
      await fs.unlink(tmpPath);
    } catch {
      // 忽略清理失败
    }
    throw new Error(`写入失败: ${(err as Error).message}`);
  }
}

// ---------- 空行压缩 ----------

function compressEmptyLinesAfterRemove(lines: string[], removedIndex: number): string[] {
  if (removedIndex <= 0 || removedIndex >= lines.length) return lines;
  const above = lines[removedIndex - 1];
  const below = lines[removedIndex];
  if (above !== undefined && below !== undefined && above.trim() === '' && below.trim() === '') {
    lines.splice(removedIndex, 1);
  }
  return lines;
}

// ---------- 源文件保护验证 ----------

function verifySourceProtection(
  original: string,
  modified: string,
): boolean {
  const annoLinePattern = /^\[comment\]:\s*<>\s*\(@anno\s+\{.+?\}\)\s*$/;

  const origLines = original.replace(/\r\n/g, '\n').split('\n');
  const modLines = modified.replace(/\r\n/g, '\n').split('\n');

  // 提取两边的非批注行
  const origNonAnno = origLines.filter(l => !annoLinePattern.test(l));
  const modNonAnno = modLines.filter(l => !annoLinePattern.test(l));

  // 压缩多余空行：将连续空行合并为单个空行后比较
  // 这样空行压缩（删除多余空行）不会触发保护失败
  function collapseBlanks(lines: string[]): string[] {
    const result: string[] = [];
    for (const line of lines) {
      if (line.trim() === '' && result.length > 0 && result[result.length - 1].trim() === '') {
        continue;
      }
      result.push(line);
    }
    return result;
  }

  const origCollapsed = collapseBlanks(origNonAnno);
  const modCollapsed = collapseBlanks(modNonAnno);

  if (origCollapsed.length !== modCollapsed.length) return false;

  for (let i = 0; i < origCollapsed.length; i++) {
    if (origCollapsed[i] !== modCollapsed[i]) return false;
  }

  return true;
}

// ---------- 公共 API ----------

export async function addAnnotation(
  filePath: string,
  paragraphLine: number,
  input: AnnotationInput,
): Promise<Annotation> {
  const rawText = await fs.readFile(filePath, 'utf-8');
  const lines = rawText.split(/\r?\n/);
  const { paragraphs, annotations } = parseAnnotations(rawText);

  // 检查段落存在
  const paragraph = findParagraphByLine(paragraphs, paragraphLine);
  if (!paragraph) {
    throw new Error(`未找到第 ${paragraphLine} 行所属的段落`);
  }

  // 构造批注对象
  const anno: Annotation = {
    id: randomUUID(),
    content: input.content,
    tags: input.tags ?? [],
    level: (input.level ?? 'info') as AnnotationLevel,
    status: 'open',
    created_at: new Date().toISOString(),
  };

  const annoLine = `[comment]: <> (@anno ${JSON.stringify(anno)})`;

  // 插入位置：段落首行上方（0-based index）
  // 若段落上方已有批注，插入到最后一个批注行下方
  const insertAt = paragraph.startLine - 1;
  const insertIdx = insertAt; // 0-based index to splice
  lines.splice(insertIdx, 0, annoLine);

  const newText = lines.join('\n');

  // 验证：source protection
  // 注意：插入一行后所有后续行的索引偏移了 +1
  // 我们对比原始行和修改后的行（跳过 insertIdx 处的批注行）
  if (!verifySourceProtection(rawText, newText)) {
    throw new Error('源文件保护检查失败：非批注行被意外修改');
  }

  await atomicWrite(filePath, newText);

  anno.line = insertIdx + 1;
  return anno;
}

export async function editAnnotation(
  filePath: string,
  id: string,
  patch: AnnotationPatch,
): Promise<Annotation> {
  const rawText = await fs.readFile(filePath, 'utf-8');
  const { annotations } = parseAnnotations(rawText);
  const lines = rawText.split(/\r?\n/);

  // 查找目标批注行
  const targetAnno = annotations.find(a => a.id === id);
  if (!targetAnno) {
    throw new Error(`未找到批注 ${id}`);
  }

  const annoLineIdx = (targetAnno.line ?? 0) - 1;
  if (annoLineIdx < 0 || annoLineIdx >= lines.length) {
    throw new Error(`批注 ${id} 行号异常`);
  }

  // 合并 patch 到原对象
  const updated: Annotation = { ...targetAnno };
  if (patch.content !== undefined) updated.content = patch.content;
  if (patch.tags !== undefined) updated.tags = patch.tags;
  if (patch.level !== undefined) updated.level = patch.level;
  if (patch.status !== undefined) updated.status = patch.status;

  const newAnnoLine = `[comment]: <> (@anno ${JSON.stringify(updated)})`;
  lines[annoLineIdx] = newAnnoLine;

  const newText = lines.join('\n');
  const changedLines = new Set<number>([annoLineIdx + 1]);

  // 检查源文件保护：只修改了批注行本身
  if (!verifySourceProtection(rawText, newText)) {
    throw new Error('源文件保护检查失败：非批注行被意外修改');
  }

  await atomicWrite(filePath, newText);

  updated.line = annoLineIdx + 1;
  return updated;
}

export async function removeAnnotation(filePath: string, id: string): Promise<void> {
  const rawText = await fs.readFile(filePath, 'utf-8');
  const lines = rawText.split(/\r?\n/);
  const { annotations } = parseAnnotations(rawText);

  const targetAnno = annotations.find(a => a.id === id);
  if (!targetAnno) {
    throw new Error(`未找到批注 ${id}`);
  }

  const annoLineIdx = (targetAnno.line ?? 0) - 1;
  if (annoLineIdx < 0 || annoLineIdx >= lines.length) {
    throw new Error(`批注 ${id} 行号异常`);
  }

  // 删除批注行
  lines.splice(annoLineIdx, 1);
  compressEmptyLinesAfterRemove(lines, annoLineIdx);

  const newText = lines.join('\n');

  // 源文件保护验证
  if (!verifySourceProtection(rawText, newText)) {
    throw new Error('源文件保护检查失败：非批注行被意外修改');
  }

  await atomicWrite(filePath, newText);
}

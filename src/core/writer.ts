import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  Annotation,
  AnnotationInput,
  AnnotationPatch,
  AnnotationLevel,
  findParagraphByLine,
  isAnnotationLevel,
  isAnnotationStatus,
  parseAnnotations,
} from './index';
import { anchorToLine, charOffsetAtLineIndex, parseAnchor, shiftAnchorForInsert } from './anchor';
import { ANNO_REGEX, buildCodeFenceMask } from './parser';

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

// ---------- 换行风格 ----------

// 保留源文件原有换行风格：只要出现过 CRLF 就按 CRLF 回写，否则 LF。
function detectEol(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
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
  const origLines = original.replace(/\r\n/g, '\n').split('\n');
  const modLines = modified.replace(/\r\n/g, '\n').split('\n');
  const origFenceMask = buildCodeFenceMask(origLines);
  const modFenceMask = buildCodeFenceMask(modLines);

  // 围栏内的 @anno 是正文示例，必须参与逐字节保护。
  const origNonAnno = origLines.filter((line, i) => origFenceMask[i] || !ANNO_REGEX.test(line));
  const modNonAnno = modLines.filter((line, i) => modFenceMask[i] || !ANNO_REGEX.test(line));

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

function annotationForDisk(annotation: Annotation): Annotation {
  const { line: _line, file: _file, ...disk } = annotation;
  return disk;
}

function validateAnnotationInput(input: AnnotationInput): void {
  if (input.level !== undefined && !isAnnotationLevel(input.level)) {
    throw new Error(`无效批注级别: ${String(input.level)}`);
  }
}

function validateAnnotationPatch(patch: AnnotationPatch): void {
  if (patch.level !== undefined && !isAnnotationLevel(patch.level)) {
    throw new Error(`无效批注级别: ${String(patch.level)}`);
  }
  if (patch.status !== undefined && !isAnnotationStatus(patch.status)) {
    throw new Error(`无效批注状态: ${String(patch.status)}`);
  }
}

interface AnnotationLineRewrite {
  index: number;
  startOffset: number;
  original: Record<string, unknown>;
  desired: Record<string, unknown> | null;
}

/**
 * 批注行长度变化会改变后续 anchor 的 UTF-16 偏移。基于原文反复计算所有行级
 * delta，直到序列化长度稳定；围栏内字面样例始终不参与。
 */
function rewriteAnnotationLinesWithStableAnchors(
  rawText: string,
  desiredByIndex: Map<number, Record<string, unknown> | null>,
  extraDeletedIndexes: Set<number> = new Set(),
): string {
  const eol = detectEol(rawText);
  const lines = rawText.split(/\r?\n/);
  const fenceMask = buildCodeFenceMask(lines);
  const starts = lines.map((_, i) => charOffsetAtLineIndex(lines, i, eol));
  const rewrites: AnnotationLineRewrite[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (fenceMask[i]) continue;
    const match = lines[i].match(ANNO_REGEX);
    if (!match) continue;
    try {
      const original = JSON.parse(match[1]) as Record<string, unknown>;
      rewrites.push({
        index: i,
        startOffset: starts[i],
        original,
        desired: desiredByIndex.has(i) ? desiredByIndex.get(i)! : { ...original },
      });
    } catch {
      // 严格 parser 不会把坏 JSON 当批注；保持原行。
    }
  }

  let previous: Array<string | undefined> = lines.slice();
  for (let pass = 0; pass < 12; pass++) {
    const deltas = rewrites
      .map(r => {
        const current = previous[r.index];
        const oldSpan = lines[r.index].length + (r.index < lines.length - 1 ? eol.length : 0);
        const newSpan = current === undefined
          ? 0
          : current.length + (r.index < lines.length - 1 ? eol.length : 0);
        return { offset: r.startOffset, delta: newSpan - oldSpan };
      })
      .concat(Array.from(extraDeletedIndexes).map(index => ({
        offset: starts[index],
        delta: -(lines[index].length + (index < lines.length - 1 ? eol.length : 0)),
      })));

    const next: Array<string | undefined> = lines.slice();
    for (const index of extraDeletedIndexes) next[index] = undefined;

    for (const rewrite of rewrites) {
      if (rewrite.desired === null) {
        next[rewrite.index] = undefined;
        continue;
      }
      const desired = { ...rewrite.desired };
      const originalAnchor = parseAnchor(rewrite.original.anchor);
      if (originalAnchor) {
        const shift = deltas.reduce(
          (sum, edit) => sum + (edit.offset <= originalAnchor.start ? edit.delta : 0),
          0,
        );
        desired.anchor = {
          ...originalAnchor,
          start: originalAnchor.start + shift,
          end: originalAnchor.end + shift,
        };
      }
      delete desired.line;
      delete desired.file;
      next[rewrite.index] = `[comment]: <> (@anno ${JSON.stringify(desired)})`;
    }

    const stable = next.length === previous.length && next.every((line, i) => line === previous[i]);
    previous = next;
    if (stable) break;
  }

  return previous.filter((line): line is string => line !== undefined).join(eol);
}

// ---------- 公共 API ----------

export async function addAnnotation(
  filePath: string,
  paragraphLine: number,
  input: AnnotationInput,
): Promise<Annotation> {
  validateAnnotationInput(input);
  const rawText = await fs.readFile(filePath, 'utf-8');
  const eol = detectEol(rawText);
  const lines = rawText.split(/\r?\n/);
  const { paragraphs } = parseAnnotations(rawText);

  const targetLine = input.anchor
    ? anchorToLine(rawText, input.anchor.start)
    : paragraphLine;

  // 检查段落存在
  const paragraph = findParagraphByLine(paragraphs, targetLine);
  if (!paragraph) {
    throw new Error(`未找到第 ${targetLine} 行所属的段落`);
  }

  const anchorQuote =
    input.anchor && input.anchor.quote === undefined
      ? rawText.slice(input.anchor.start, input.anchor.end)
      : input.anchor?.quote;

  // 插入位置：段落首行上方（0-based index）
  const insertIdx = paragraph.startLine - 1;
  const insertCharOffset = charOffsetAtLineIndex(lines, insertIdx, eol);

  const baseAnchor = input.anchor
    ? { start: input.anchor.start, end: input.anchor.end, quote: anchorQuote }
    : undefined;

  // 构造批注对象
  const anno: Annotation = {
    id: randomUUID(),
    content: input.content,
    tags: input.tags ?? [],
    level: (input.level ?? 'info') as AnnotationLevel,
    status: 'open',
    created_at: new Date().toISOString(),
  };
  if (baseAnchor) {
    anno.anchor = { ...baseAnchor };
  }

  let annoLine = `[comment]: <> (@anno ${JSON.stringify(anno)})`;
  if (baseAnchor) {
    for (let pass = 0; pass < 4; pass++) {
      const delta = annoLine.length + eol.length;
      const shifted = shiftAnchorForInsert(baseAnchor, insertCharOffset, delta);
      const nextAnno = { ...anno, anchor: shifted };
      const nextLine = `[comment]: <> (@anno ${JSON.stringify(nextAnno)})`;
      if (nextLine === annoLine) break;
      anno.anchor = shifted;
      annoLine = nextLine;
    }
  }
  const insertDelta = annoLine.length + eol.length;

  // 已有批注行的 anchor 也需随插入点后移
  if (insertDelta > 0) {
    const fenceMask = buildCodeFenceMask(lines);
    for (let i = 0; i < lines.length; i++) {
      if (fenceMask[i]) continue;
      const match = lines[i].match(ANNO_REGEX);
      if (!match) continue;
      try {
        const parsed = JSON.parse(match[1]) as Record<string, unknown>;
        const existingAnchor = parseAnchor(parsed.anchor);
        if (!existingAnchor || existingAnchor.start < insertCharOffset) continue;
        const shifted = shiftAnchorForInsert(existingAnchor, insertCharOffset, insertDelta);
        parsed.anchor = shifted;
        lines[i] = `[comment]: <> (@anno ${JSON.stringify(parsed)})`;
      } catch {
        // 保留原行
      }
    }
  }

  lines.splice(insertIdx, 0, annoLine);

  const newText = lines.join(eol);

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
  validateAnnotationPatch(patch);
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

  const desired = annotationForDisk(updated) as unknown as Record<string, unknown>;
  const newText = rewriteAnnotationLinesWithStableAnchors(
    rawText,
    new Map([[annoLineIdx, desired]]),
  );

  // 检查源文件保护：只修改了批注行本身
  if (!verifySourceProtection(rawText, newText)) {
    throw new Error('源文件保护检查失败：非批注行被意外修改');
  }

  await atomicWrite(filePath, newText);
  const persisted = parseAnnotations(newText).annotations.find(a => a.id === id);
  if (!persisted) throw new Error(`批注 ${id} 更新后解析失败`);
  return persisted;
}

// 整篇写回（GUI 源码编辑保存用）。区别于批注增删改：这是用户对文档正文的
// 全量编辑，不做源文件保护校验，但保留源文件原有换行风格（避免编辑器统一为
// LF 而污染 CRLF 文件）；文件不存在时默认 LF。仍走原子写入。
export async function writeRawFile(filePath: string, content: string): Promise<void> {
  let eol: '\r\n' | '\n' = '\n';
  try {
    const existing = await fs.readFile(filePath, 'utf-8');
    eol = detectEol(existing);
  } catch {
    // 新文件：默认 LF
  }
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n/g, eol);
  await atomicWrite(filePath, normalized);
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

  const extraDeleted = new Set<number>();
  if (
    annoLineIdx > 0 &&
    annoLineIdx + 1 < lines.length &&
    lines[annoLineIdx - 1].trim() === '' &&
    lines[annoLineIdx + 1].trim() === ''
  ) {
    extraDeleted.add(annoLineIdx + 1);
  }
  const newText = rewriteAnnotationLinesWithStableAnchors(
    rawText,
    new Map([[annoLineIdx, null]]),
    extraDeleted,
  );

  // 源文件保护验证
  if (!verifySourceProtection(rawText, newText)) {
    throw new Error('源文件保护检查失败：非批注行被意外修改');
  }

  await atomicWrite(filePath, newText);
}

/** 清空文件中全部批注行（围栏外）；返回删除条数。正文经源文件保护校验不变。 */
export async function clearAllAnnotations(filePath: string): Promise<number> {
  const rawText = await fs.readFile(filePath, 'utf-8');
  const eol = detectEol(rawText);
  const lines = rawText.split(/\r?\n/);
  const { annotations } = parseAnnotations(rawText);
  if (annotations.length === 0) return 0;

  const idxs = annotations
    .map(a => (a.line ?? 0) - 1)
    .filter(i => i >= 0 && i < lines.length)
    .sort((a, b) => b - a);

  for (const idx of idxs) {
    lines.splice(idx, 1);
    compressEmptyLinesAfterRemove(lines, idx);
  }

  const newText = lines.join(eol);
  if (!verifySourceProtection(rawText, newText)) {
    throw new Error('源文件保护检查失败：非批注行被意外修改');
  }

  await atomicWrite(filePath, newText);
  return idxs.length;
}

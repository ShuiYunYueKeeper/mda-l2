import { Annotation, AnnotationLevel, AnnotationStatus, Paragraph, ScanResult } from './model';

const ANNO_REGEX = /^\[comment\]:\s*<>\s*\(@anno\s+(\{.+?\})\)\s*$/;

function isAnnotation(obj: unknown): obj is Annotation {
  if (typeof obj !== 'object' || obj === null) return false;
  const a = obj as Record<string, unknown>;
  if (typeof a.id !== 'string') return false;
  if (typeof a.content !== 'string') return false;
  if (!Array.isArray(a.tags) || a.tags.some(t => typeof t !== 'string')) return false;
  const validLevels: AnnotationLevel[] = ['critical', 'major', 'minor', 'info'];
  if (!validLevels.includes(a.level as AnnotationLevel)) return false;
  const validStatuses: AnnotationStatus[] = ['open', 'resolved', 'wontfix'];
  if (!validStatuses.includes(a.status as AnnotationStatus)) return false;
  if (typeof a.created_at !== 'string') return false;
  return true;
}

export function parseAnnotations(text: string): ScanResult {
  const lines = text.split(/\r?\n/);
  const annotations: Annotation[] = [];
  const paragraphs: Paragraph[] = [];
  const buffer: Array<{ lineNumber: number; raw: string; annotation: Annotation }> = [];
  let state: 'blank' | 'paragraph' = 'blank';
  let currentParagraph: Paragraph | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const annoMatch = line.match(ANNO_REGEX);
    const isEmpty = line.trim() === '';

    if (annoMatch) {
      const jsonStr = annoMatch[1];
      try {
        const parsed = JSON.parse(jsonStr);
        if (isAnnotation(parsed)) {
          const anno: Annotation = { ...parsed, line: i + 1 };
          annotations.push(anno);
          buffer.push({ lineNumber: i + 1, raw: line, annotation: anno });
        } else {
          console.error(`警告: 第 ${i + 1} 行批注 JSON 字段不完整或类型错误`);
        }
      } catch {
        console.error(`警告: 第 ${i + 1} 行批注 JSON 解析失败`);
      }
    } else if (isEmpty) {
      if (state === 'paragraph' && currentParagraph) {
        currentParagraph.endLine = i;
        paragraphs.push(currentParagraph);
        currentParagraph = null;
      }
      state = 'blank';
    } else {
      // 正文行
      if (state === 'blank') {
        currentParagraph = {
          startLine: i + 1,
          endLine: i + 1,
          text: line,
          annotations: [],
        };
        state = 'paragraph';
      } else if (currentParagraph) {
        currentParagraph.endLine = i + 1;
        currentParagraph.text += '\n' + line;
      }

      // buffer 中所有待归属批注归属于当前段落
      if (currentParagraph) {
        for (const item of buffer) {
          currentParagraph.annotations.push(item.annotation);
        }
        buffer.length = 0;
      }
    }
  }

  // 文件末尾处理
  if (currentParagraph) {
    paragraphs.push(currentParagraph);
  }
  // buffer 残留（无归属段落）的批注已在 annotations 中，但不关联段落

  return { annotations, paragraphs };
}

export function findAnnotationByLine(annotations: Annotation[], line: number): Annotation | null {
  for (const a of annotations) {
    if (a.line === line) return a;
  }
  return null;
}

export function findParagraphByLine(paragraphs: Paragraph[], line: number): Paragraph | null {
  for (const p of paragraphs) {
    if (p.startLine <= line && line <= p.endLine) return p;
  }
  return null;
}

export { ANNO_REGEX };

import {
  Annotation,
  Paragraph,
  ScanResult,
  isAnnotationLevel,
  isAnnotationStatus,
} from './model';
import schema from '../config/annotation-schema.json';

// 批注识别正则来源于外置配置（src/config/annotation-schema.json）的 annotationPattern
const ANNO_REGEX = new RegExp(schema.annotationPattern);

/**
 * 计算围栏代码块遮罩：mask[i] === true 表示第 i 行处于 ```/~~~ 围栏代码块内
 * （含围栏定界行本身）。围栏内的内容是字面文本，不得被识别为批注，也不得在
 * 渲染时被清空。CLI/GUI/渲染共用此判定，保证三处行为一致。
 */
export function buildCodeFenceMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let fenceChar: string | null = null;
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceChar === null) {
      if (open) {
        fenceChar = open[1][0];
        fenceLen = open[1].length;
        mask[i] = true;
      }
    } else {
      mask[i] = true;
      const close = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        fenceChar = null;
        fenceLen = 0;
      }
    }
  }
  return mask;
}

function isAnnotation(obj: unknown): obj is Annotation {
  if (typeof obj !== 'object' || obj === null) return false;
  const a = obj as Record<string, unknown>;
  if (typeof a.id !== 'string') return false;
  if (typeof a.content !== 'string') return false;
  if (!Array.isArray(a.tags) || a.tags.some(t => typeof t !== 'string')) return false;
  if (!isAnnotationLevel(a.level)) return false;
  if (!isAnnotationStatus(a.status)) return false;
  if (typeof a.created_at !== 'string') return false;
  return true;
}

export function parseAnnotations(text: string): ScanResult {
  // 去掉文件起始 BOM，避免首行文本携带 \uFEFF（不影响行号，BOM 仍在第 1 行）
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const fenceMask = buildCodeFenceMask(lines);
  const annotations: Annotation[] = [];
  const paragraphs: Paragraph[] = [];
  const buffer: Array<{ lineNumber: number; raw: string; annotation: Annotation }> = [];
  let state: 'blank' | 'paragraph' = 'blank';
  let currentParagraph: Paragraph | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 围栏代码块内的“批注样例”是字面文本，不识别为真实批注
    const annoMatch = fenceMask[i] ? null : line.match(ANNO_REGEX);
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

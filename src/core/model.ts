import schema from '../config/annotation-schema.json';

export type AnnotationLevel = 'critical' | 'major' | 'minor' | 'info';
export type AnnotationStatus = 'open' | 'resolved' | 'wontfix';

// 运行时枚举值来源于外置配置（src/config/annotation-schema.json），
// TS 字面联合类型仍保留以获得静态检查；二者通过下方断言保持一致。
export const ANNOTATION_LEVELS: AnnotationLevel[] = schema.levels as AnnotationLevel[];
export const ANNOTATION_STATUSES: AnnotationStatus[] = schema.statuses as AnnotationStatus[];

export function isAnnotationLevel(v: unknown): v is AnnotationLevel {
  return typeof v === 'string' && (ANNOTATION_LEVELS as string[]).includes(v);
}

export function isAnnotationStatus(v: unknown): v is AnnotationStatus {
  return typeof v === 'string' && (ANNOTATION_STATUSES as string[]).includes(v);
}

/** GUI/CLI 可打开的 Markdown 类文件扩展名（不含点，来源于 annotation-schema.json） */
export const MARKDOWN_FILE_EXTENSIONS: readonly string[] = schema.fileExtensions;

export function isMarkdownPath(filePath: string): boolean {
  const m = filePath.match(/\.([^.\\/]+)$/i);
  if (!m) return false;
  return MARKDOWN_FILE_EXTENSIONS.includes(m[1].toLowerCase());
}

export interface AnnotationAnchor {
  start: number;
  end: number;
  quote?: string;
}

export interface Annotation {
  id: string;
  content: string;
  tags: string[];
  level: AnnotationLevel;
  status: AnnotationStatus;
  created_at: string;
  line?: number;
  file?: string;
  anchor?: AnnotationAnchor;
}

export interface AnnotationInput {
  content: string;
  tags?: string[];
  level?: AnnotationLevel;
  anchor?: AnnotationAnchor;
}

export interface AnnotationPatch {
  content?: string;
  tags?: string[];
  level?: AnnotationLevel;
  status?: AnnotationStatus;
}

export interface Paragraph {
  startLine: number;
  endLine: number;
  text: string;
  annotations: Annotation[];
}

export interface ScanResult {
  annotations: Annotation[];
  paragraphs: Paragraph[];
}

export interface HeadingNode {
  level: number;
  title: string;
  line: number;
  children: HeadingNode[];
}

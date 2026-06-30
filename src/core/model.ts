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

export interface Annotation {
  id: string;
  content: string;
  tags: string[];
  level: AnnotationLevel;
  status: AnnotationStatus;
  created_at: string;
  line?: number;
  file?: string;
}

export interface AnnotationInput {
  content: string;
  tags?: string[];
  level?: AnnotationLevel;
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

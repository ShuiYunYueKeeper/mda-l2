export type AnnotationLevel = 'critical' | 'major' | 'minor' | 'info';
export type AnnotationStatus = 'open' | 'resolved' | 'wontfix';

export const ANNOTATION_LEVELS: AnnotationLevel[] = ['critical', 'major', 'minor', 'info'];
export const ANNOTATION_STATUSES: AnnotationStatus[] = ['open', 'resolved', 'wontfix'];

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

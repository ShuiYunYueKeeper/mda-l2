export type AnnotationLevel = 'critical' | 'major' | 'minor' | 'info';
export type AnnotationStatus = 'open' | 'resolved' | 'wontfix';

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

export type AnnotationLevel = 'critical' | 'major' | 'minor' | 'info';
export type AnnotationStatus = 'open' | 'resolved' | 'wontfix';
export declare const ANNOTATION_LEVELS: AnnotationLevel[];
export declare const ANNOTATION_STATUSES: AnnotationStatus[];
export declare function isAnnotationLevel(v: unknown): v is AnnotationLevel;
export declare function isAnnotationStatus(v: unknown): v is AnnotationStatus;
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
//# sourceMappingURL=model.d.ts.map
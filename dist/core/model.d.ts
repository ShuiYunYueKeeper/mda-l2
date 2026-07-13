export type AnnotationLevel = 'critical' | 'major' | 'minor' | 'info';
export type AnnotationStatus = 'open' | 'resolved' | 'wontfix';
export declare const ANNOTATION_LEVELS: AnnotationLevel[];
export declare const ANNOTATION_STATUSES: AnnotationStatus[];
export declare function isAnnotationLevel(v: unknown): v is AnnotationLevel;
export declare function isAnnotationStatus(v: unknown): v is AnnotationStatus;
/** GUI/CLI 可打开的 Markdown 类文件扩展名（不含点，来源于 annotation-schema.json） */
export declare const MARKDOWN_FILE_EXTENSIONS: readonly string[];
export declare function isMarkdownPath(filePath: string): boolean;
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
//# sourceMappingURL=model.d.ts.map
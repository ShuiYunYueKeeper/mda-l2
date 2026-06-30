import MarkdownIt from 'markdown-it';
import { AnnotationLevel } from './model';
declare const LEVEL_COLORS: Record<AnnotationLevel, string>;
declare const LEVEL_SEVERITY: Record<AnnotationLevel, number>;
export declare function createMarkdownIt(): MarkdownIt;
export declare function renderMarkdown(md: MarkdownIt, text: string): string;
export { LEVEL_COLORS, LEVEL_SEVERITY };
//# sourceMappingURL=renderer.d.ts.map
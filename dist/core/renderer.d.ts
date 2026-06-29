import MarkdownIt from 'markdown-it';
import { AnnotationLevel } from './model';
declare const LEVEL_COLORS: Record<AnnotationLevel, string>;
export declare function createMarkdownIt(): MarkdownIt;
export declare function renderMarkdown(md: MarkdownIt, text: string): string;
export { LEVEL_COLORS };
//# sourceMappingURL=renderer.d.ts.map
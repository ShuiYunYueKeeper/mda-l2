import { Annotation, AnnotationAnchor } from './model';
/** 从 JSON 对象解析 anchor；非法则 undefined（不丢弃整条批注） */
export declare function parseAnchor(raw: unknown): AnnotationAnchor | undefined;
export declare function validateAnchor(text: string, anchor: AnnotationAnchor): boolean;
export declare function sliceUtf16(text: string, start: number, end: number): string;
/** anchor.start 所在段落的 1-based 行号（用于批注行插入） */
export declare function anchorToLine(text: string, start: number): number;
/** 0-based 行号在拼接文本中的起始字符偏移 */
export declare function charOffsetAtLineIndex(lines: string[], lineIndex0: number, eol?: '\r\n' | '\n'): number;
/** 在 insertOffset 处插入 delta 长度文本后，调整 anchor 偏移 */
export declare function shiftAnchorForInsert(anchor: AnnotationAnchor, insertOffset: number, delta: number): AnnotationAnchor;
/** quote 存在且与当前偏移处文本不一致 → 视为 stale */
export declare function isAnchorStale(text: string, ann: Annotation): boolean;
//# sourceMappingURL=anchor.d.ts.map
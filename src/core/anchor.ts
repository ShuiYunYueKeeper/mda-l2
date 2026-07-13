import { Annotation, AnnotationAnchor } from './model';

/** 从 JSON 对象解析 anchor；非法则 undefined（不丢弃整条批注） */
export function parseAnchor(raw: unknown): AnnotationAnchor | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.start !== 'number' || typeof o.end !== 'number') return undefined;
  if (!Number.isFinite(o.start) || !Number.isFinite(o.end)) return undefined;
  if (o.start < 0 || o.end <= o.start) return undefined;
  const anchor: AnnotationAnchor = { start: o.start, end: o.end };
  if (typeof o.quote === 'string') anchor.quote = o.quote;
  return anchor;
}

export function validateAnchor(text: string, anchor: AnnotationAnchor): boolean {
  return (
    anchor.start >= 0 &&
    anchor.end <= text.length &&
    anchor.start < anchor.end
  );
}

export function sliceUtf16(text: string, start: number, end: number): string {
  return text.slice(start, end);
}

/** anchor.start 所在段落的 1-based 行号（用于批注行插入） */
export function anchorToLine(text: string, start: number): number {
  if (start <= 0) return 1;
  const before = text.slice(0, start);
  return before.split(/\r?\n/).length;
}

/** 0-based 行号在拼接文本中的起始字符偏移 */
export function charOffsetAtLineIndex(
  lines: string[],
  lineIndex0: number,
  eol: '\r\n' | '\n' = '\n',
): number {
  if (lineIndex0 <= 0) return 0;
  if (lineIndex0 >= lines.length) {
    return lines.join(eol).length + (lines.length > 0 ? eol.length : 0);
  }
  return lines.slice(0, lineIndex0).join(eol).length + eol.length;
}

/** 在 insertOffset 处插入 delta 长度文本后，调整 anchor 偏移 */
export function shiftAnchorForInsert(
  anchor: AnnotationAnchor,
  insertOffset: number,
  delta: number,
): AnnotationAnchor {
  if (delta <= 0 || anchor.start < insertOffset) return anchor;
  return { ...anchor, start: anchor.start + delta, end: anchor.end + delta };
}

/** quote 存在且与当前偏移处文本不一致 → 视为 stale */
export function isAnchorStale(text: string, ann: Annotation): boolean {
  const anchor = ann.anchor;
  if (!anchor?.quote) return false;
  if (!validateAnchor(text, anchor)) return true;
  return sliceUtf16(text, anchor.start, anchor.end) !== anchor.quote;
}

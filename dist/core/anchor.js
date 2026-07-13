"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAnchor = parseAnchor;
exports.validateAnchor = validateAnchor;
exports.sliceUtf16 = sliceUtf16;
exports.anchorToLine = anchorToLine;
exports.charOffsetAtLineIndex = charOffsetAtLineIndex;
exports.shiftAnchorForInsert = shiftAnchorForInsert;
exports.isAnchorStale = isAnchorStale;
/** 从 JSON 对象解析 anchor；非法则 undefined（不丢弃整条批注） */
function parseAnchor(raw) {
    if (typeof raw !== 'object' || raw === null)
        return undefined;
    const o = raw;
    if (typeof o.start !== 'number' || typeof o.end !== 'number')
        return undefined;
    if (!Number.isFinite(o.start) || !Number.isFinite(o.end))
        return undefined;
    if (o.start < 0 || o.end <= o.start)
        return undefined;
    const anchor = { start: o.start, end: o.end };
    if (typeof o.quote === 'string')
        anchor.quote = o.quote;
    return anchor;
}
function validateAnchor(text, anchor) {
    return (anchor.start >= 0 &&
        anchor.end <= text.length &&
        anchor.start < anchor.end);
}
function sliceUtf16(text, start, end) {
    return text.slice(start, end);
}
/** anchor.start 所在段落的 1-based 行号（用于批注行插入） */
function anchorToLine(text, start) {
    if (start <= 0)
        return 1;
    const before = text.slice(0, start);
    return before.split(/\r?\n/).length;
}
/** 0-based 行号在拼接文本中的起始字符偏移 */
function charOffsetAtLineIndex(lines, lineIndex0, eol = '\n') {
    if (lineIndex0 <= 0)
        return 0;
    if (lineIndex0 >= lines.length) {
        return lines.join(eol).length + (lines.length > 0 ? eol.length : 0);
    }
    return lines.slice(0, lineIndex0).join(eol).length + eol.length;
}
/** 在 insertOffset 处插入 delta 长度文本后，调整 anchor 偏移 */
function shiftAnchorForInsert(anchor, insertOffset, delta) {
    if (delta <= 0 || anchor.start < insertOffset)
        return anchor;
    return { ...anchor, start: anchor.start + delta, end: anchor.end + delta };
}
/** quote 存在且与当前偏移处文本不一致 → 视为 stale */
function isAnchorStale(text, ann) {
    const anchor = ann.anchor;
    if (!anchor?.quote)
        return false;
    if (!validateAnchor(text, anchor))
        return true;
    return sliceUtf16(text, anchor.start, anchor.end) !== anchor.quote;
}
//# sourceMappingURL=anchor.js.map
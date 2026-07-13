"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractHeadings = extractHeadings;
const parser_1 = require("./parser");
/**
 * 从 Markdown 源码提取 ATX 标题树（围栏内 # 行忽略）。
 */
function extractHeadings(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const fenceMask = (0, parser_1.buildCodeFenceMask)(lines);
    const flat = [];
    for (let i = 0; i < lines.length; i++) {
        if (fenceMask[i])
            continue;
        const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
        if (!m)
            continue;
        flat.push({ level: m[1].length, title: m[2].trim(), line: i + 1 });
    }
    const roots = [];
    const stack = [];
    for (const h of flat) {
        const node = {
            level: h.level,
            title: h.title,
            line: h.line,
            children: [],
        };
        while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
            stack.pop();
        }
        if (stack.length === 0) {
            roots.push(node);
        }
        else {
            stack[stack.length - 1].children.push(node);
        }
        stack.push(node);
    }
    return roots;
}
//# sourceMappingURL=outline.js.map
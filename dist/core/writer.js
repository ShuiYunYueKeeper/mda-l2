"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.addAnnotation = addAnnotation;
exports.editAnnotation = editAnnotation;
exports.writeRawFile = writeRawFile;
exports.removeAnnotation = removeAnnotation;
exports.clearAllAnnotations = clearAllAnnotations;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const index_1 = require("./index");
const anchor_1 = require("./anchor");
const parser_1 = require("./parser");
// ---------- 原子写入 ----------
async function atomicWrite(filePath, content) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const tmpName = `.${base}.${(0, crypto_1.randomUUID)()}.tmp`;
    const tmpPath = path.join(dir, tmpName);
    try {
        await fs.writeFile(tmpPath, content, 'utf-8');
        await fs.rename(tmpPath, filePath);
    }
    catch (err) {
        // 清理临时文件
        try {
            await fs.unlink(tmpPath);
        }
        catch {
            // 忽略清理失败
        }
        throw new Error(`写入失败: ${err.message}`);
    }
}
// ---------- 换行风格 ----------
// 保留源文件原有换行风格：只要出现过 CRLF 就按 CRLF 回写，否则 LF。
function detectEol(text) {
    return text.includes('\r\n') ? '\r\n' : '\n';
}
// ---------- 空行压缩 ----------
function compressEmptyLinesAfterRemove(lines, removedIndex) {
    if (removedIndex <= 0 || removedIndex >= lines.length)
        return lines;
    const above = lines[removedIndex - 1];
    const below = lines[removedIndex];
    if (above !== undefined && below !== undefined && above.trim() === '' && below.trim() === '') {
        lines.splice(removedIndex, 1);
    }
    return lines;
}
// ---------- 源文件保护验证 ----------
function verifySourceProtection(original, modified) {
    const annoLinePattern = /^\[comment\]:\s*<>\s*\(@anno\s+\{.+?\}\)\s*$/;
    const origLines = original.replace(/\r\n/g, '\n').split('\n');
    const modLines = modified.replace(/\r\n/g, '\n').split('\n');
    // 提取两边的非批注行
    const origNonAnno = origLines.filter(l => !annoLinePattern.test(l));
    const modNonAnno = modLines.filter(l => !annoLinePattern.test(l));
    // 压缩多余空行：将连续空行合并为单个空行后比较
    // 这样空行压缩（删除多余空行）不会触发保护失败
    function collapseBlanks(lines) {
        const result = [];
        for (const line of lines) {
            if (line.trim() === '' && result.length > 0 && result[result.length - 1].trim() === '') {
                continue;
            }
            result.push(line);
        }
        return result;
    }
    const origCollapsed = collapseBlanks(origNonAnno);
    const modCollapsed = collapseBlanks(modNonAnno);
    if (origCollapsed.length !== modCollapsed.length)
        return false;
    for (let i = 0; i < origCollapsed.length; i++) {
        if (origCollapsed[i] !== modCollapsed[i])
            return false;
    }
    return true;
}
// ---------- 公共 API ----------
async function addAnnotation(filePath, paragraphLine, input) {
    const rawText = await fs.readFile(filePath, 'utf-8');
    const eol = detectEol(rawText);
    const lines = rawText.split(/\r?\n/);
    const { paragraphs } = (0, index_1.parseAnnotations)(rawText);
    const targetLine = input.anchor
        ? (0, anchor_1.anchorToLine)(rawText, input.anchor.start)
        : paragraphLine;
    // 检查段落存在
    const paragraph = (0, index_1.findParagraphByLine)(paragraphs, targetLine);
    if (!paragraph) {
        throw new Error(`未找到第 ${targetLine} 行所属的段落`);
    }
    const anchorQuote = input.anchor && input.anchor.quote === undefined
        ? rawText.slice(input.anchor.start, input.anchor.end)
        : input.anchor?.quote;
    // 插入位置：段落首行上方（0-based index）
    const insertIdx = paragraph.startLine - 1;
    const insertCharOffset = (0, anchor_1.charOffsetAtLineIndex)(lines, insertIdx, eol);
    const baseAnchor = input.anchor
        ? { start: input.anchor.start, end: input.anchor.end, quote: anchorQuote }
        : undefined;
    // 构造批注对象
    const anno = {
        id: (0, crypto_1.randomUUID)(),
        content: input.content,
        tags: input.tags ?? [],
        level: (input.level ?? 'info'),
        status: 'open',
        created_at: new Date().toISOString(),
    };
    if (baseAnchor) {
        anno.anchor = { ...baseAnchor };
    }
    let annoLine = `[comment]: <> (@anno ${JSON.stringify(anno)})`;
    if (baseAnchor) {
        for (let pass = 0; pass < 4; pass++) {
            const delta = annoLine.length + eol.length;
            const shifted = (0, anchor_1.shiftAnchorForInsert)(baseAnchor, insertCharOffset, delta);
            const nextAnno = { ...anno, anchor: shifted };
            const nextLine = `[comment]: <> (@anno ${JSON.stringify(nextAnno)})`;
            if (nextLine === annoLine)
                break;
            anno.anchor = shifted;
            annoLine = nextLine;
        }
    }
    const insertDelta = annoLine.length + eol.length;
    // 已有批注行的 anchor 也需随插入点后移
    if (insertDelta > 0) {
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(parser_1.ANNO_REGEX);
            if (!match)
                continue;
            try {
                const parsed = JSON.parse(match[1]);
                const existingAnchor = (0, anchor_1.parseAnchor)(parsed.anchor);
                if (!existingAnchor || existingAnchor.start < insertCharOffset)
                    continue;
                const shifted = (0, anchor_1.shiftAnchorForInsert)(existingAnchor, insertCharOffset, insertDelta);
                parsed.anchor = shifted;
                lines[i] = `[comment]: <> (@anno ${JSON.stringify(parsed)})`;
            }
            catch {
                // 保留原行
            }
        }
    }
    lines.splice(insertIdx, 0, annoLine);
    const newText = lines.join(eol);
    // 验证：source protection
    // 注意：插入一行后所有后续行的索引偏移了 +1
    // 我们对比原始行和修改后的行（跳过 insertIdx 处的批注行）
    if (!verifySourceProtection(rawText, newText)) {
        throw new Error('源文件保护检查失败：非批注行被意外修改');
    }
    await atomicWrite(filePath, newText);
    anno.line = insertIdx + 1;
    return anno;
}
async function editAnnotation(filePath, id, patch) {
    const rawText = await fs.readFile(filePath, 'utf-8');
    const eol = detectEol(rawText);
    const { annotations } = (0, index_1.parseAnnotations)(rawText);
    const lines = rawText.split(/\r?\n/);
    // 查找目标批注行
    const targetAnno = annotations.find(a => a.id === id);
    if (!targetAnno) {
        throw new Error(`未找到批注 ${id}`);
    }
    const annoLineIdx = (targetAnno.line ?? 0) - 1;
    if (annoLineIdx < 0 || annoLineIdx >= lines.length) {
        throw new Error(`批注 ${id} 行号异常`);
    }
    // 合并 patch 到原对象
    const updated = { ...targetAnno };
    if (patch.content !== undefined)
        updated.content = patch.content;
    if (patch.tags !== undefined)
        updated.tags = patch.tags;
    if (patch.level !== undefined)
        updated.level = patch.level;
    if (patch.status !== undefined)
        updated.status = patch.status;
    const newAnnoLine = `[comment]: <> (@anno ${JSON.stringify(updated)})`;
    lines[annoLineIdx] = newAnnoLine;
    const newText = lines.join(eol);
    // 检查源文件保护：只修改了批注行本身
    if (!verifySourceProtection(rawText, newText)) {
        throw new Error('源文件保护检查失败：非批注行被意外修改');
    }
    await atomicWrite(filePath, newText);
    updated.line = annoLineIdx + 1;
    return updated;
}
// 整篇写回（GUI 源码编辑保存用）。区别于批注增删改：这是用户对文档正文的
// 全量编辑，不做源文件保护校验，但保留源文件原有换行风格（避免编辑器统一为
// LF 而污染 CRLF 文件）；文件不存在时默认 LF。仍走原子写入。
async function writeRawFile(filePath, content) {
    let eol = '\n';
    try {
        const existing = await fs.readFile(filePath, 'utf-8');
        eol = detectEol(existing);
    }
    catch {
        // 新文件：默认 LF
    }
    const normalized = content.replace(/\r\n/g, '\n').replace(/\n/g, eol);
    await atomicWrite(filePath, normalized);
}
async function removeAnnotation(filePath, id) {
    const rawText = await fs.readFile(filePath, 'utf-8');
    const eol = detectEol(rawText);
    const lines = rawText.split(/\r?\n/);
    const { annotations } = (0, index_1.parseAnnotations)(rawText);
    const targetAnno = annotations.find(a => a.id === id);
    if (!targetAnno) {
        throw new Error(`未找到批注 ${id}`);
    }
    const annoLineIdx = (targetAnno.line ?? 0) - 1;
    if (annoLineIdx < 0 || annoLineIdx >= lines.length) {
        throw new Error(`批注 ${id} 行号异常`);
    }
    // 删除批注行
    lines.splice(annoLineIdx, 1);
    compressEmptyLinesAfterRemove(lines, annoLineIdx);
    const newText = lines.join(eol);
    // 源文件保护验证
    if (!verifySourceProtection(rawText, newText)) {
        throw new Error('源文件保护检查失败：非批注行被意外修改');
    }
    await atomicWrite(filePath, newText);
}
/** 清空文件中全部批注行（围栏外）；返回删除条数。正文经源文件保护校验不变。 */
async function clearAllAnnotations(filePath) {
    const rawText = await fs.readFile(filePath, 'utf-8');
    const eol = detectEol(rawText);
    const lines = rawText.split(/\r?\n/);
    const { annotations } = (0, index_1.parseAnnotations)(rawText);
    if (annotations.length === 0)
        return 0;
    const idxs = annotations
        .map(a => (a.line ?? 0) - 1)
        .filter(i => i >= 0 && i < lines.length)
        .sort((a, b) => b - a);
    for (const idx of idxs) {
        lines.splice(idx, 1);
        compressEmptyLinesAfterRemove(lines, idx);
    }
    const newText = lines.join(eol);
    if (!verifySourceProtection(rawText, newText)) {
        throw new Error('源文件保护检查失败：非批注行被意外修改');
    }
    await atomicWrite(filePath, newText);
    return idxs.length;
}
//# sourceMappingURL=writer.js.map
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
exports.scanCommand = scanCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("../../core/parser");
const model_1 = require("../../core/model");
function scanFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf-8');
    const { annotations, paragraphs } = (0, parser_1.parseAnnotations)(text);
    // 建立 批注 id → 所属段落文本 的映射
    const paraById = new Map();
    for (const p of paragraphs) {
        for (const a of p.annotations) {
            paraById.set(a.id, p.text);
        }
    }
    return annotations.map(a => {
        a.file = filePath;
        return { anno: a, paragraphText: paraById.get(a.id) ?? '' };
    });
}
function scanDir(dirPath, recursive) {
    const results = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory() && recursive) {
            results.push(...scanDir(fullPath, recursive));
        }
        else if (entry.isFile() && (0, model_1.isMarkdownPath)(entry.name)) {
            results.push(...scanFile(fullPath));
        }
    }
    return results;
}
function filterRows(rows, opts) {
    return rows.filter(({ anno }) => {
        if (opts.status && anno.status !== opts.status)
            return false;
        if (opts.level && anno.level !== opts.level)
            return false;
        return true;
    });
}
// ---------- 显示宽度工具（CJK 全角字符按 2 列计算） ----------
function isWide(cp) {
    return (cp >= 0x1100 &&
        (cp <= 0x115f || // Hangul Jamo
            cp === 0x2329 ||
            cp === 0x232a ||
            (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || // CJK 部首..注音
            (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul 音节
            (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意
            (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK 兼容形式
            (cp >= 0xff00 && cp <= 0xff60) || // 全角形式
            (cp >= 0xffe0 && cp <= 0xffe6)));
}
function displayWidth(s) {
    let w = 0;
    for (const ch of s) {
        w += isWide(ch.codePointAt(0)) ? 2 : 1;
    }
    return w;
}
function truncateToWidth(s, maxWidth) {
    let w = 0;
    let out = '';
    for (const ch of s) {
        const cw = isWide(ch.codePointAt(0)) ? 2 : 1;
        if (w + cw > maxWidth - 1) {
            return out + '…';
        }
        out += ch;
        w += cw;
    }
    return out;
}
function padToWidth(s, width) {
    const pad = width - displayWidth(s);
    return pad > 0 ? s + ' '.repeat(pad) : s;
}
function summarizeText(text, maxWidth) {
    const cleaned = text.replace(/[#*_>`\[\]()!~|]/g, '').replace(/\s+/g, ' ').trim();
    return truncateToWidth(cleaned, maxWidth);
}
function scanCommand(target, opts) {
    // 过滤值校验
    if (opts.status && !(0, model_1.isAnnotationStatus)(opts.status)) {
        process.stderr.write(`错误: 无效状态 "${opts.status}"，可选: ${model_1.ANNOTATION_STATUSES.join(', ')}\n`);
        process.exit(1);
    }
    if (opts.level && !(0, model_1.isAnnotationLevel)(opts.level)) {
        process.stderr.write(`错误: 无效级别 "${opts.level}"，可选: ${model_1.ANNOTATION_LEVELS.join(', ')}\n`);
        process.exit(1);
    }
    const stat = fs.statSync(target, { throwIfNoEntry: false });
    if (!stat) {
        process.stderr.write(`错误: 文件或目录不存在: ${target}\n`);
        process.exit(1);
    }
    let rows;
    if (stat.isDirectory()) {
        if (!opts.recursive && opts.format !== 'json') {
            process.stderr.write('提示: 使用 -r 递归扫描目录\n');
        }
        rows = scanDir(target, opts.recursive ?? false);
    }
    else {
        rows = scanFile(target);
    }
    rows = filterRows(rows, opts);
    if (opts.format === 'json') {
        process.stdout.write(JSON.stringify(rows.map(r => r.anno), null, 2) + '\n');
        return;
    }
    // 表格格式
    if (rows.length === 0) {
        process.stdout.write('(无批注)\n');
        return;
    }
    const cols = {
        id: 8,
        file: 20,
        line: 6,
        para: 32,
        content: 32,
        level: 10,
        status: 10,
    };
    const hdr = padToWidth('ID', cols.id) +
        padToWidth('文件', cols.file) +
        padToWidth('行号', cols.line) +
        padToWidth('段落摘要', cols.para) +
        padToWidth('批注摘要', cols.content) +
        padToWidth('级别', cols.level) +
        padToWidth('状态', cols.status);
    process.stdout.write(hdr + '\n');
    process.stdout.write('─'.repeat(displayWidth(hdr)) + '\n');
    for (const { anno, paragraphText } of rows) {
        const id = (anno.id ?? '').slice(0, 8);
        const file = truncateToWidth(anno.file ?? target, cols.file - 1);
        const line = String(anno.line ?? '?');
        const para = summarizeText(paragraphText, cols.para - 1);
        const cont = summarizeText(anno.content, cols.content - 1);
        process.stdout.write(padToWidth(id, cols.id) +
            padToWidth(file, cols.file) +
            padToWidth(line, cols.line) +
            padToWidth(para, cols.para) +
            padToWidth(cont, cols.content) +
            padToWidth(anno.level, cols.level) +
            padToWidth(anno.status, cols.status) +
            '\n');
    }
}
//# sourceMappingURL=scan.js.map
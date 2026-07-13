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
exports.collectAnnotations = collectAnnotations;
exports.collectScanRows = collectScanRows;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("../core/parser");
const model_1 = require("../core/model");
function scanFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf-8');
    const { annotations, paragraphs } = (0, parser_1.parseAnnotations)(text);
    const paraById = new Map();
    for (const p of paragraphs) {
        for (const a of p.annotations) {
            paraById.set(a.id, p.text);
        }
    }
    return annotations.map(a => {
        const copy = { ...a, file: filePath };
        return { anno: copy, paragraphText: paraById.get(a.id) ?? '' };
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
function collectRows(target, opts) {
    const stat = fs.statSync(target, { throwIfNoEntry: false });
    if (!stat) {
        throw new Error(`文件或目录不存在: ${target}`);
    }
    let rows;
    if (stat.isDirectory()) {
        rows = scanDir(target, opts.recursive ?? false);
    }
    else {
        rows = scanFile(target);
    }
    return filterRows(rows, opts);
}
/** 收集批注列表（与 `mda-cli scan --format json` 输出一致） */
function collectAnnotations(target, opts = {}) {
    return collectRows(target, opts).map(r => r.anno);
}
/** 含段落摘要的扫描结果（CLI 表格模式用） */
function collectScanRows(target, opts = {}) {
    return collectRows(target, opts);
}
//# sourceMappingURL=scan-service.js.map
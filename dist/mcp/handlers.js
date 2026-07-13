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
exports.handleMdaScan = handleMdaScan;
exports.handleMdaAdd = handleMdaAdd;
exports.handleMdaEdit = handleMdaEdit;
exports.handleMdaRemove = handleMdaRemove;
exports.handleMdaReadFile = handleMdaReadFile;
exports.handleMdaExportReviewPrompt = handleMdaExportReviewPrompt;
exports.scanAnnotationsForTest = scanAnnotationsForTest;
const fs = __importStar(require("fs"));
const scan_service_1 = require("../cli/scan-service");
const writer_1 = require("../core/writer");
const parser_1 = require("../core/parser");
const model_1 = require("../core/model");
const anchor_1 = require("../core/anchor");
const review_prompt_1 = require("./review-prompt");
const workspace_1 = require("./workspace");
function jsonText(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function parseTags(tags) {
    if (!tags)
        return undefined;
    if (Array.isArray(tags))
        return tags.map(t => String(t).trim()).filter(Boolean);
    return String(tags).split(',').map(t => t.trim()).filter(Boolean);
}
function parseAnchorArg(anchor) {
    if (anchor == null)
        return undefined;
    const obj = typeof anchor === 'string' ? JSON.parse(anchor) : anchor;
    const parsed = (0, anchor_1.parseAnchor)(obj);
    if (!parsed)
        throw new Error('anchor 字段无效（需要 start/end 且 start < end）');
    return parsed;
}
async function handleMdaScan(ctx, args) {
    if (args.status && !(0, model_1.isAnnotationStatus)(args.status)) {
        throw new Error(`无效状态 "${args.status}"，可选: ${model_1.ANNOTATION_STATUSES.join(', ')}`);
    }
    if (args.level && !(0, model_1.isAnnotationLevel)(args.level)) {
        throw new Error(`无效级别 "${args.level}"，可选: ${model_1.ANNOTATION_LEVELS.join(', ')}`);
    }
    const target = (0, workspace_1.resolveWorkspacePath)(ctx.workspace, args.path);
    (0, workspace_1.assertPathExists)(target);
    const annotations = (0, scan_service_1.collectAnnotations)(target, {
        recursive: args.recursive,
        status: args.status,
        level: args.level,
    });
    return jsonText(annotations);
}
async function handleMdaAdd(ctx, args) {
    const lineNum = Number(args.line);
    if (!Number.isInteger(lineNum) || lineNum <= 0) {
        throw new Error(`行号必须为正整数，收到: ${args.line}`);
    }
    const level = args.level ?? 'info';
    if (!(0, model_1.isAnnotationLevel)(level)) {
        throw new Error(`无效级别 "${level}"，可选: ${model_1.ANNOTATION_LEVELS.join(', ')}`);
    }
    const filePath = (0, workspace_1.resolveWorkspacePath)(ctx.workspace, args.file);
    (0, workspace_1.assertPathExists)(filePath);
    const input = {
        content: args.content,
        tags: parseTags(args.tags),
        level,
    };
    const anchor = parseAnchorArg(args.anchor);
    if (anchor)
        input.anchor = anchor;
    const annotation = await (0, writer_1.addAnnotation)(filePath, lineNum, input);
    return jsonText({ annotation });
}
async function handleMdaEdit(ctx, args) {
    if (!args.content && !args.tags && !args.level && !args.status) {
        throw new Error('至少需要提供一个修改字段: content, tags, level, status');
    }
    if (args.level !== undefined && !(0, model_1.isAnnotationLevel)(args.level)) {
        throw new Error(`无效级别 "${args.level}"，可选: ${model_1.ANNOTATION_LEVELS.join(', ')}`);
    }
    if (args.status !== undefined && !(0, model_1.isAnnotationStatus)(args.status)) {
        throw new Error(`无效状态 "${args.status}"，可选: ${model_1.ANNOTATION_STATUSES.join(', ')}`);
    }
    const filePath = (0, workspace_1.resolveWorkspacePath)(ctx.workspace, args.file);
    (0, workspace_1.assertPathExists)(filePath);
    const patch = {};
    if (args.content !== undefined)
        patch.content = args.content;
    if (args.tags !== undefined)
        patch.tags = parseTags(args.tags);
    if ((0, model_1.isAnnotationLevel)(args.level))
        patch.level = args.level;
    if ((0, model_1.isAnnotationStatus)(args.status))
        patch.status = args.status;
    const annotation = await (0, writer_1.editAnnotation)(filePath, args.id, patch);
    return jsonText({ annotation });
}
async function handleMdaRemove(ctx, args) {
    const filePath = (0, workspace_1.resolveWorkspacePath)(ctx.workspace, args.file);
    (0, workspace_1.assertPathExists)(filePath);
    await (0, writer_1.removeAnnotation)(filePath, args.id);
    return jsonText({ ok: true });
}
function handleMdaReadFile(ctx, args) {
    const filePath = (0, workspace_1.resolveWorkspacePath)(ctx.workspace, args.file);
    (0, workspace_1.assertPathExists)(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const scanResult = (0, parser_1.parseAnnotations)(content);
    return jsonText({ content, scanResult });
}
function handleMdaExportReviewPrompt(ctx, args) {
    if (!args.files?.length) {
        throw new Error('files 不能为空');
    }
    for (const f of args.files) {
        const abs = (0, workspace_1.resolveWorkspacePath)(ctx.workspace, f);
        (0, workspace_1.assertPathExists)(abs);
    }
    const prompt = (0, review_prompt_1.buildReviewPrompt)(ctx.workspace, args.files);
    return jsonText({ prompt });
}
/** 供测试：对齐 CLI JSON 输出 */
function scanAnnotationsForTest(workspace, targetPath, opts) {
    const abs = (0, workspace_1.resolveWorkspacePath)(workspace, targetPath);
    return (0, scan_service_1.collectAnnotations)(abs, opts);
}
//# sourceMappingURL=handlers.js.map
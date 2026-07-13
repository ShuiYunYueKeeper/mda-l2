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
exports.buildReviewPrompt = buildReviewPrompt;
const fs = __importStar(require("fs"));
const parser_1 = require("../core/parser");
const workspace_1 = require("./workspace");
function buildReviewPrompt(workspace, files) {
    const lines = [
        '# MDA 文档审阅任务',
        '',
        '请根据以下 Markdown 文件中的内嵌批注，给出修改建议与优先级排序。',
        '批注以 `[comment]: <> (@anno {...})` 形式保存在源文件中，此处已提取摘要。',
        '',
    ];
    for (const file of files) {
        const abs = (0, workspace_1.resolveWorkspacePath)(workspace, file);
        const content = fs.readFileSync(abs, 'utf-8');
        const { annotations } = (0, parser_1.parseAnnotations)(content);
        const rel = file;
        lines.push(`## ${rel}`);
        lines.push('');
        if (annotations.length === 0) {
            lines.push('（无批注）');
            lines.push('');
            continue;
        }
        const sorted = [...annotations].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
        for (const a of sorted) {
            const tags = a.tags.length ? ` [${a.tags.join(', ')}]` : '';
            lines.push(`- **${a.level}** / ${a.status}${tags}（行 ${a.line ?? '?'}）`);
            lines.push(`  - ${a.content}`);
            if (a.anchor?.quote) {
                lines.push(`  - 选区: 「${a.anchor.quote}」`);
            }
            lines.push(`  - id: \`${a.id}\``);
        }
        lines.push('');
    }
    lines.push('---');
    lines.push('');
    lines.push('请按：1) 严重问题 2) 建议改进 3) 可选优化 分组回复。');
    return lines.join('\n');
}
//# sourceMappingURL=review-prompt.js.map
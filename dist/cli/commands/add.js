"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addCommand = addCommand;
const writer_1 = require("../../core/writer");
const model_1 = require("../../core/model");
const anchor_1 = require("../../core/anchor");
async function addCommand(file, line, content, opts) {
    const lineNum = parseInt(line, 10);
    if (isNaN(lineNum) || lineNum <= 0) {
        process.stderr.write(`错误: 行号必须为正整数，收到: ${line}\n`);
        process.exit(1);
    }
    const level = opts.level ?? 'info';
    if (!(0, model_1.isAnnotationLevel)(level)) {
        process.stderr.write(`错误: 无效级别 "${level}"，可选: ${model_1.ANNOTATION_LEVELS.join(', ')}\n`);
        process.exit(1);
    }
    const tags = opts.tags
        ? opts.tags.split(',').map(t => t.trim()).filter(Boolean)
        : undefined;
    let anchor;
    if (opts.anchor) {
        try {
            anchor = (0, anchor_1.parseAnchor)(JSON.parse(opts.anchor));
        }
        catch {
            process.stderr.write('错误: --anchor 必须是合法 JSON 对象\n');
            process.exit(1);
        }
        if (!anchor) {
            process.stderr.write('错误: --anchor 字段无效（需要 start/end 且 start < end）\n');
            process.exit(1);
        }
    }
    try {
        const anno = await (0, writer_1.addAnnotation)(file, lineNum, {
            content,
            tags,
            level,
            ...(anchor ? { anchor } : {}),
        });
        process.stdout.write(anno.id + '\n');
    }
    catch (err) {
        process.stderr.write(`错误: ${err.message}\n`);
        process.exit(1);
    }
}
//# sourceMappingURL=add.js.map
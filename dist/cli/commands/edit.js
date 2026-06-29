"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.editCommand = editCommand;
const writer_1 = require("../../core/writer");
const model_1 = require("../../core/model");
async function editCommand(file, id, opts) {
    if (!opts.content && !opts.tags && !opts.level && !opts.status) {
        process.stderr.write('错误: 至少需要提供一个修改选项 (--content, --tags, --level, --status)\n');
        process.exit(1);
    }
    if (opts.level !== undefined && !(0, model_1.isAnnotationLevel)(opts.level)) {
        process.stderr.write(`错误: 无效级别 "${opts.level}"，可选: ${model_1.ANNOTATION_LEVELS.join(', ')}\n`);
        process.exit(1);
    }
    if (opts.status !== undefined && !(0, model_1.isAnnotationStatus)(opts.status)) {
        process.stderr.write(`错误: 无效状态 "${opts.status}"，可选: ${model_1.ANNOTATION_STATUSES.join(', ')}\n`);
        process.exit(1);
    }
    const tags = opts.tags
        ? opts.tags.split(',').map(t => t.trim()).filter(Boolean)
        : undefined;
    try {
        const anno = await (0, writer_1.editAnnotation)(file, id, {
            content: opts.content,
            tags,
            level: (0, model_1.isAnnotationLevel)(opts.level) ? opts.level : undefined,
            status: (0, model_1.isAnnotationStatus)(opts.status) ? opts.status : undefined,
        });
        process.stdout.write(JSON.stringify(anno) + '\n');
    }
    catch (err) {
        process.stderr.write(`错误: ${err.message}\n`);
        process.exit(1);
    }
}
//# sourceMappingURL=edit.js.map
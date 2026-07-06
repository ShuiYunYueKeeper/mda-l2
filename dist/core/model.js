"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARKDOWN_FILE_EXTENSIONS = exports.ANNOTATION_STATUSES = exports.ANNOTATION_LEVELS = void 0;
exports.isAnnotationLevel = isAnnotationLevel;
exports.isAnnotationStatus = isAnnotationStatus;
exports.isMarkdownPath = isMarkdownPath;
const annotation_schema_json_1 = __importDefault(require("../config/annotation-schema.json"));
// 运行时枚举值来源于外置配置（src/config/annotation-schema.json），
// TS 字面联合类型仍保留以获得静态检查；二者通过下方断言保持一致。
exports.ANNOTATION_LEVELS = annotation_schema_json_1.default.levels;
exports.ANNOTATION_STATUSES = annotation_schema_json_1.default.statuses;
function isAnnotationLevel(v) {
    return typeof v === 'string' && exports.ANNOTATION_LEVELS.includes(v);
}
function isAnnotationStatus(v) {
    return typeof v === 'string' && exports.ANNOTATION_STATUSES.includes(v);
}
/** GUI/CLI 可打开的 Markdown 类文件扩展名（不含点，来源于 annotation-schema.json） */
exports.MARKDOWN_FILE_EXTENSIONS = annotation_schema_json_1.default.fileExtensions;
function isMarkdownPath(filePath) {
    const m = filePath.match(/\.([^.\\/]+)$/i);
    if (!m)
        return false;
    return exports.MARKDOWN_FILE_EXTENSIONS.includes(m[1].toLowerCase());
}
//# sourceMappingURL=model.js.map
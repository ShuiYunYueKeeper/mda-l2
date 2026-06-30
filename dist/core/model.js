"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANNOTATION_STATUSES = exports.ANNOTATION_LEVELS = void 0;
exports.isAnnotationLevel = isAnnotationLevel;
exports.isAnnotationStatus = isAnnotationStatus;
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
//# sourceMappingURL=model.js.map
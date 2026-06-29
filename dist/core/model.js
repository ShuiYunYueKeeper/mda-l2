"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANNOTATION_STATUSES = exports.ANNOTATION_LEVELS = void 0;
exports.isAnnotationLevel = isAnnotationLevel;
exports.isAnnotationStatus = isAnnotationStatus;
exports.ANNOTATION_LEVELS = ['critical', 'major', 'minor', 'info'];
exports.ANNOTATION_STATUSES = ['open', 'resolved', 'wontfix'];
function isAnnotationLevel(v) {
    return typeof v === 'string' && exports.ANNOTATION_LEVELS.includes(v);
}
function isAnnotationStatus(v) {
    return typeof v === 'string' && exports.ANNOTATION_STATUSES.includes(v);
}
//# sourceMappingURL=model.js.map
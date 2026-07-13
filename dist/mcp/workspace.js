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
exports.resolveWorkspaceRoot = resolveWorkspaceRoot;
exports.isPathInsideRoot = isPathInsideRoot;
exports.resolveWorkspacePath = resolveWorkspacePath;
exports.assertPathExists = assertPathExists;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 工作区根：环境变量 MDA_WORKSPACE、启动参数 --workspace，或 cwd */
function resolveWorkspaceRoot(explicit) {
    const raw = explicit || process.env.MDA_WORKSPACE || process.cwd();
    return path.resolve(raw);
}
function isPathInsideRoot(root, target) {
    const base = path.resolve(root);
    const abs = path.resolve(target);
    if (abs === base)
        return true;
    const rel = path.relative(base, abs);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
/** 将相对/绝对路径解析为绝对路径，并校验在工作区内 */
function resolveWorkspacePath(workspace, filePath) {
    const root = path.resolve(workspace);
    const abs = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
    if (!isPathInsideRoot(root, abs)) {
        throw new Error(`路径必须在工作区内: ${abs}`);
    }
    return abs;
}
function assertPathExists(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`文件或目录不存在: ${filePath}`);
    }
}
//# sourceMappingURL=workspace.js.map
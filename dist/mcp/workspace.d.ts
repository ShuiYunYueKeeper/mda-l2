/** 工作区根：环境变量 MDA_WORKSPACE、启动参数 --workspace，或 cwd */
export declare function resolveWorkspaceRoot(explicit?: string): string;
export declare function isPathInsideRoot(root: string, target: string): boolean;
/** 将相对/绝对路径解析为绝对路径，并校验在工作区内 */
export declare function resolveWorkspacePath(workspace: string, filePath: string): string;
export declare function assertPathExists(filePath: string): void;
//# sourceMappingURL=workspace.d.ts.map
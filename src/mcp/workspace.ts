import * as fs from 'fs';
import * as path from 'path';

/** 工作区根：环境变量 MDA_WORKSPACE、启动参数 --workspace，或 cwd */
export function resolveWorkspaceRoot(explicit?: string): string {
  const raw = explicit || process.env.MDA_WORKSPACE || process.cwd();
  return path.resolve(raw);
}

export function isPathInsideRoot(root: string, target: string): boolean {
  const base = path.resolve(root);
  const abs = path.resolve(target);
  if (abs === base) return true;
  const rel = path.relative(base, abs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 将相对/绝对路径解析为绝对路径，并校验在工作区内 */
export function resolveWorkspacePath(workspace: string, filePath: string): string {
  const root = path.resolve(workspace);
  const abs = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  if (!isPathInsideRoot(root, abs)) {
    throw new Error(`路径必须在工作区内: ${abs}`);
  }
  return abs;
}

export function assertPathExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件或目录不存在: ${filePath}`);
  }
}

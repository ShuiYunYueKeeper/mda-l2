const fs = require('fs');
const path = require('path');

function resolveInWorkspace(targetPath, workspaceRoot) {
  if (!workspaceRoot) return null;
  const absWs = path.resolve(workspaceRoot);
  const abs = path.resolve(targetPath);
  const rel = path.relative(absWs, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs;
}

function uniqueDestPath(destDir, baseName) {
  let candidate = path.join(destDir, baseName);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(destDir, `${stem} (${n})${ext}`);
    n += 1;
    if (n > 1000) throw new Error('无法生成唯一文件名');
  }
  return candidate;
}

function resolveDestPath(absDestDir, baseName, conflict) {
  const destPath = path.join(absDestDir, baseName);
  if (!fs.existsSync(destPath)) return destPath;
  if (conflict === 'overwrite') return destPath;
  if (conflict === 'rename') return uniqueDestPath(absDestDir, baseName);
  return null;
}

function copyFileToDir(srcPath, destDir, workspaceRoot, conflict) {
  const absSrc = resolveInWorkspace(srcPath, workspaceRoot);
  const absDestDir = resolveInWorkspace(destDir, workspaceRoot);
  if (!absSrc || !absDestDir) return { success: false, error: '路径须在工作区内' };
  if (!fs.existsSync(absSrc)) return { success: false, error: '源文件不存在' };
  const stat = fs.statSync(absSrc);
  if (!stat.isFile()) return { success: false, error: '不是文件' };
  if (!fs.existsSync(absDestDir) || !fs.statSync(absDestDir).isDirectory()) {
    return { success: false, error: '目标文件夹不存在' };
  }
  const baseName = path.basename(absSrc);
  const destPath = path.join(absDestDir, baseName);
  const exists = fs.existsSync(destPath);
  if (exists && path.resolve(absSrc) === path.resolve(destPath)) {
    if (!conflict) return { success: false, conflict: true, destPath, baseName, sameFile: true };
    const finalPath = conflict === 'rename'
      ? uniqueDestPath(absDestDir, baseName)
      : destPath;
    if (path.resolve(finalPath) === path.resolve(absSrc)) {
      return { success: false, error: '无法复制到相同路径' };
    }
    fs.copyFileSync(absSrc, finalPath);
    return { success: true, filePath: finalPath };
  }
  if (exists && !conflict) {
    return { success: false, conflict: true, destPath, baseName };
  }
  const finalPath = exists ? resolveDestPath(absDestDir, baseName, conflict) : destPath;
  if (!finalPath) return { success: false, conflict: true, destPath, baseName };
  fs.copyFileSync(absSrc, finalPath);
  return { success: true, filePath: finalPath };
}

function moveFileToDir(srcPath, destDir, workspaceRoot, conflict) {
  const absSrc = resolveInWorkspace(srcPath, workspaceRoot);
  const absDestDir = resolveInWorkspace(destDir, workspaceRoot);
  if (!absSrc || !absDestDir) return { success: false, error: '路径须在工作区内' };
  if (!fs.existsSync(absSrc)) return { success: false, error: '源文件不存在' };
  const stat = fs.statSync(absSrc);
  if (!stat.isFile()) return { success: false, error: '不是文件' };
  if (!fs.existsSync(absDestDir) || !fs.statSync(absDestDir).isDirectory()) {
    return { success: false, error: '目标文件夹不存在' };
  }
  const baseName = path.basename(absSrc);
  const destPath = path.join(absDestDir, baseName);
  if (path.resolve(absSrc) === path.resolve(destPath)) {
    return { success: false, noop: true };
  }
  const exists = fs.existsSync(destPath);
  if (exists && !conflict) {
    return { success: false, conflict: true, destPath, baseName };
  }
  let finalPath = destPath;
  if (exists) {
    if (conflict === 'overwrite') {
      fs.unlinkSync(destPath);
    } else if (conflict === 'rename') {
      finalPath = uniqueDestPath(absDestDir, baseName);
    } else {
      return { success: false, conflict: true, destPath, baseName };
    }
  }
  fs.renameSync(absSrc, finalPath);
  return { success: true, filePath: finalPath };
}

function fileExists(filePath, workspaceRoot) {
  const abs = resolveInWorkspace(filePath, workspaceRoot);
  if (!abs) return { success: false, error: '路径须在工作区内' };
  return { success: true, exists: fs.existsSync(abs) };
}

function renameFileConflict(oldPath, newPath, workspaceRoot, conflict) {
  const absOld = workspaceRoot ? resolveInWorkspace(oldPath, workspaceRoot) : path.resolve(oldPath);
  let absNew = workspaceRoot ? resolveInWorkspace(newPath, workspaceRoot) : path.resolve(newPath);
  if (!absOld || !absNew) return { success: false, error: '路径无效' };
  if (!fs.existsSync(absOld)) return { success: false, error: '源文件不存在' };
  const exists = fs.existsSync(absNew) && path.resolve(absOld) !== path.resolve(absNew);
  if (exists && !conflict) {
    return { success: false, conflict: true, destPath: absNew, baseName: path.basename(absNew) };
  }
  if (exists && conflict === 'overwrite') {
    fs.unlinkSync(absNew);
  } else if (exists && conflict === 'rename') {
    absNew = uniqueDestPath(path.dirname(absNew), path.basename(absNew));
  }
  fs.renameSync(absOld, absNew);
  return { success: true, filePath: absNew };
}

module.exports = { copyFileToDir, moveFileToDir, fileExists, uniqueDestPath, renameFileConflict };

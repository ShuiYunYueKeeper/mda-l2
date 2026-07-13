import * as fs from 'fs';
import { parseAnnotations } from '../core/parser';
import { resolveWorkspacePath } from './workspace';

export function buildReviewPrompt(workspace: string, files: string[]): string {
  const lines: string[] = [
    '# MDA 文档审阅任务',
    '',
    '请根据以下 Markdown 文件中的内嵌批注，给出修改建议与优先级排序。',
    '批注以 `[comment]: <> (@anno {...})` 形式保存在源文件中，此处已提取摘要。',
    '',
  ];

  for (const file of files) {
    const abs = resolveWorkspacePath(workspace, file);
    const content = fs.readFileSync(abs, 'utf-8');
    const { annotations } = parseAnnotations(content);
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

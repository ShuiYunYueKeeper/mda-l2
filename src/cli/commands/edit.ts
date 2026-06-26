import { editAnnotation } from '../../core/writer';

interface EditOptions {
  content?: string;
  tags?: string;
  level?: string;
  status?: string;
}

export async function editCommand(
  file: string,
  id: string,
  opts: EditOptions,
): Promise<void> {
  if (!opts.content && !opts.tags && !opts.level && !opts.status) {
    process.stderr.write('错误: 至少需要提供一个修改选项 (--content, --tags, --level, --status)\n');
    process.exit(1);
  }

  const tags = opts.tags
    ? opts.tags.split(',').map(t => t.trim()).filter(Boolean)
    : undefined;

  try {
    const anno = await editAnnotation(file, id, {
      content: opts.content,
      tags,
      level: opts.level as 'critical' | 'major' | 'minor' | 'info' | undefined,
      status: opts.status as 'open' | 'resolved' | 'wontfix' | undefined,
    });
    process.stdout.write(JSON.stringify(anno) + '\n');
  } catch (err) {
    process.stderr.write(`错误: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

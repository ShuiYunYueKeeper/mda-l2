import { editAnnotation } from '../../core/writer';
import {
  ANNOTATION_LEVELS,
  ANNOTATION_STATUSES,
  isAnnotationLevel,
  isAnnotationStatus,
} from '../../core/model';

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

  if (opts.level !== undefined && !isAnnotationLevel(opts.level)) {
    process.stderr.write(`错误: 无效级别 "${opts.level}"，可选: ${ANNOTATION_LEVELS.join(', ')}\n`);
    process.exit(1);
  }
  if (opts.status !== undefined && !isAnnotationStatus(opts.status)) {
    process.stderr.write(`错误: 无效状态 "${opts.status}"，可选: ${ANNOTATION_STATUSES.join(', ')}\n`);
    process.exit(1);
  }

  const tags = opts.tags
    ? opts.tags.split(',').map(t => t.trim()).filter(Boolean)
    : undefined;

  try {
    const anno = await editAnnotation(file, id, {
      content: opts.content,
      tags,
      level: isAnnotationLevel(opts.level) ? opts.level : undefined,
      status: isAnnotationStatus(opts.status) ? opts.status : undefined,
    });
    process.stdout.write(JSON.stringify(anno) + '\n');
  } catch (err) {
    process.stderr.write(`错误: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

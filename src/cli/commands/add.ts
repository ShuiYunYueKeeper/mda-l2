import { addAnnotation } from '../../core/writer';
import { ANNOTATION_LEVELS, isAnnotationLevel } from '../../core/model';

interface AddOptions {
  tags?: string;
  level?: string;
}

export async function addCommand(
  file: string,
  line: string,
  content: string,
  opts: AddOptions,
): Promise<void> {
  const lineNum = parseInt(line, 10);
  if (isNaN(lineNum) || lineNum <= 0) {
    process.stderr.write(`错误: 行号必须为正整数，收到: ${line}\n`);
    process.exit(1);
  }

  const level = opts.level ?? 'info';
  if (!isAnnotationLevel(level)) {
    process.stderr.write(`错误: 无效级别 "${level}"，可选: ${ANNOTATION_LEVELS.join(', ')}\n`);
    process.exit(1);
  }

  const tags = opts.tags
    ? opts.tags.split(',').map(t => t.trim()).filter(Boolean)
    : undefined;

  try {
    const anno = await addAnnotation(file, lineNum, {
      content,
      tags,
      level,
    });
    process.stdout.write(anno.id + '\n');
  } catch (err) {
    process.stderr.write(`错误: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

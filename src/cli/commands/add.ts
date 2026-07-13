import { addAnnotation } from '../../core/writer';
import { ANNOTATION_LEVELS, isAnnotationLevel } from '../../core/model';
import { parseAnchor } from '../../core/anchor';

interface AddOptions {
  tags?: string;
  level?: string;
  anchor?: string;
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

  let anchor;
  if (opts.anchor) {
    try {
      anchor = parseAnchor(JSON.parse(opts.anchor));
    } catch {
      process.stderr.write('错误: --anchor 必须是合法 JSON 对象\n');
      process.exit(1);
    }
    if (!anchor) {
      process.stderr.write('错误: --anchor 字段无效（需要 start/end 且 start < end）\n');
      process.exit(1);
    }
  }

  try {
    const anno = await addAnnotation(file, lineNum, {
      content,
      tags,
      level,
      ...(anchor ? { anchor } : {}),
    });
    process.stdout.write(anno.id + '\n');
  } catch (err) {
    process.stderr.write(`错误: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

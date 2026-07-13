import { HeadingNode } from './model';
import { buildCodeFenceMask } from './parser';

/**
 * 从 Markdown 源码提取 ATX 标题树（围栏内 # 行忽略）。
 */
export function extractHeadings(text: string): HeadingNode[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const fenceMask = buildCodeFenceMask(lines);
  const flat: Array<{ level: number; title: string; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    if (fenceMask[i]) continue;
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (!m) continue;
    flat.push({ level: m[1].length, title: m[2].trim(), line: i + 1 });
  }

  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  for (const h of flat) {
    const node: HeadingNode = {
      level: h.level,
      title: h.title,
      line: h.line,
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  return roots;
}

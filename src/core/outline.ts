import { HeadingNode } from './model';
import { buildCodeFenceMask } from './parser';

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
// 列表项内的 ATX 标题（`- ## 标题` / `1. ## 标题`）在 CommonMark 中仍是标题。
// 任务项 `- [ ] ...` 首块必须是段落，其中的 # 是字面文本，故不匹配。
const LIST_HEADING_RE = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(#{1,6})\s+(.+)$/;

/**
 * 从 Markdown 源码提取 ATX 标题树（围栏内 # 行忽略）。
 */
export function extractHeadings(text: string): HeadingNode[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const fenceMask = buildCodeFenceMask(lines);
  const flat: Array<{ level: number; title: string; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    if (fenceMask[i]) continue;
    const m = lines[i].match(HEADING_RE) || lines[i].match(LIST_HEADING_RE);
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

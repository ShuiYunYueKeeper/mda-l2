import MarkdownIt from 'markdown-it';
import { AnnotationLevel } from './model';
import { ANNO_REGEX, buildCodeFenceMask } from './parser';
import schema from '../config/annotation-schema.json';

// 级别配色 / 严重度优先级来源于外置配置（src/config/annotation-schema.json）
const LEVEL_COLORS = schema.levelColors as Record<AnnotationLevel, string>;
const LEVEL_SEVERITY = schema.levelSeverity as Record<AnnotationLevel, number>;

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt('commonmark', {
    html: false,
    linkify: false,
    typographer: false,
  }) as MarkdownIt & { renderer: { rules: Record<string, unknown> } };

  // GFM 表格: commonmark preset 不含表格，手动启用
  md.enable('table');

  // 自定义 image renderer — 双重 DOM（img + alt fallback）
  const imageRule = (md.renderer.rules as Record<string, MarkdownIt.Renderer.RenderRule>).image;
  (md.renderer.rules as Record<string, MarkdownIt.Renderer.RenderRule>).image = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const src = token.attrGet('src') || '';
      const alt = token.content || '图片';
      return `<span class="md-image-wrapper">`
        + `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"`
        + ` onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" loading="lazy" />`
        + `<span class="md-image-alt" style="display:none">[图片: ${escapeAttr(alt)}]</span>`
        + `</span>`;
    };

  return md;
}

// 形如 4b. / 4e、 / 4f) 的「伪子条目」：非合法有序列表标记，CommonMark 会与上一条目并成一段；
// 在上一行末补硬换行（两空格）以保留作者意图的换行，且不破坏后续 5. 等真实列表项。
const SUB_ITEM_LINE_RE = /^\d+[a-z]+[.、:：)）]/;

function preserveSubItemLineBreaks(lines: string[], fenceMask: boolean[]): void {
  for (let i = 1; i < lines.length; i++) {
    if (fenceMask[i] || !SUB_ITEM_LINE_RE.test(lines[i])) continue;
    if (fenceMask[i - 1]) continue;
    const prev = lines[i - 1];
    if (!prev.trim() || /\s{2}$/.test(prev)) continue;
    lines[i - 1] = prev + '  ';
  }
}

// 渲染前预处理：
// 1) 去掉文件起始的 UTF-8 BOM，否则首行 `# 标题` 会被当作普通段落（BOM 抢占行首）。
// 2) 将批注行整体清空为空行（保留行数 → GUI 的 data-line 行号映射不变），
//    从而保证“批注不可见”对任意内容都成立 —— 含括号等字符的批注若依赖
//    markdown-it 的链接引用定义来隐藏会失效（标题括号内不允许未转义括号）。
// 3) 为 4b. / 4e、 / 4f) 类伪子条目保留换行（见 preserveSubItemLineBreaks）。
function preprocessForRender(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const fenceMask = buildCodeFenceMask(lines);
  blankFrontMatterLines(lines, fenceMask);
  preserveSubItemLineBreaks(lines, fenceMask);
  // 仅清空“围栏外”的批注行；围栏内的批注样例属于代码内容，须原样保留显示
  return lines
    .map((line, i) => (!fenceMask[i] && ANNO_REGEX.test(line) ? '' : line))
    .join('\n');
}

/** 文件开头的 YAML front matter（--- … ---）在预览中隐藏，保留空行以维持 GUI data-line 行号。 */
function blankFrontMatterLines(lines: string[], fenceMask: boolean[]): void {
  if (!lines.length) return;
  if (fenceMask[0]) return;
  const first = lines[0].replace(/^\uFEFF/, '').trim();
  if (first !== '---') return;
  for (let i = 1; i < lines.length; i++) {
    if (fenceMask[i]) return;
    if (/^---\s*$/.test(lines[i])) {
      for (let j = 0; j <= i; j++) lines[j] = '';
      return;
    }
  }
}

export function renderMarkdown(md: MarkdownIt, text: string): string {
  return md.render(preprocessForRender(text));
}

export { LEVEL_COLORS, LEVEL_SEVERITY };

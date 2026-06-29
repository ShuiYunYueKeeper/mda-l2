import MarkdownIt from 'markdown-it';
import { AnnotationLevel } from './model';
import { ANNO_REGEX, buildCodeFenceMask } from './parser';

const LEVEL_COLORS: Record<AnnotationLevel, string> = {
  critical: '#e74c3c',
  major: '#e67e22',
  minor: '#f1c40f',
  info: '#95a5a6',
};

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

// 渲染前预处理：
// 1) 去掉文件起始的 UTF-8 BOM，否则首行 `# 标题` 会被当作普通段落（BOM 抢占行首）。
// 2) 将批注行整体清空为空行（保留行数 → GUI 的 data-line 行号映射不变），
//    从而保证“批注不可见”对任意内容都成立 —— 含括号等字符的批注若依赖
//    markdown-it 的链接引用定义来隐藏会失效（标题括号内不允许未转义括号）。
function preprocessForRender(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const fenceMask = buildCodeFenceMask(lines);
  // 仅清空“围栏外”的批注行；围栏内的批注样例属于代码内容，须原样保留显示
  return lines
    .map((line, i) => (!fenceMask[i] && ANNO_REGEX.test(line) ? '' : line))
    .join('\n');
}

export function renderMarkdown(md: MarkdownIt, text: string): string {
  return md.render(preprocessForRender(text));
}

export { LEVEL_COLORS };

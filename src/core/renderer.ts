import MarkdownIt from 'markdown-it';
import { AnnotationLevel } from './model';

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

export function renderMarkdown(md: MarkdownIt, text: string): string {
  return md.render(text);
}

export { LEVEL_COLORS };

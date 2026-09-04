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

  // 产品约定：单 `~text~` → <u>（不与 `~~删除线~~` 冲突；后者本仓库未开 strikethrough 规则）
  md.inline.ruler.after('emphasis', 'mda_underline', (state, silent) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x7e /* ~ */) return false;
    if (state.src.charCodeAt(start + 1) === 0x7e) return false;
    let pos = start + 1;
    let found = -1;
    while (pos < state.posMax) {
      const ch = state.src.charCodeAt(pos);
      if (ch === 0x0a /* \n */) break;
      if (ch === 0x7e) {
        if (state.src.charCodeAt(pos + 1) === 0x7e) {
          pos += 2;
          continue;
        }
        found = pos;
        break;
      }
      pos += 1;
    }
    if (found < 0 || found === start + 1) return false;
    if (!silent) {
      const token = state.push('mda_underline', 'u', 0);
      token.markup = '~';
      token.content = state.src.slice(start + 1, found);
    }
    state.pos = found + 1;
    return true;
  });
  md.renderer.rules.mda_underline = (tokens, idx) => {
    const content = md.utils.escapeHtml(tokens[idx].content);
    return `<u>${content}</u>`;
  };

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
const IMAGE_ONLY_LINE_RE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
const THEMATIC_BREAK_LINE_RE = /^\s*(-{3,}|={3,}|_{3,})\s*$/;
const SETEXT_H2_UNDERLINE_RE = /^\s*(-{3,}|_{3,})\s*$/;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * 非空段落后紧跟 ---/___ 时 CommonMark 当成 Setext h2 下划线，竞品则作 HR。
 * 图片后的 === 同样改写。同行替换为 ***，不增删行数以保持 data-line。
 * 须在 blankFrontMatterLines 之后，以免改写 YAML 闭合 ---。
 */
function fixSetextUnderlineAsThematicBreak(lines: string[], fenceMask: boolean[]): void {
  for (let i = 1; i < lines.length; i++) {
    if (fenceMask[i] || fenceMask[i - 1]) continue;
    if (!lines[i - 1].trim()) continue;
    if (IMAGE_ONLY_LINE_RE.test(lines[i - 1])) {
      if (!THEMATIC_BREAK_LINE_RE.test(lines[i])) continue;
    } else if (!SETEXT_H2_UNDERLINE_RE.test(lines[i])) {
      continue;
    }
    lines[i] = '***';
  }
}

function lineIndexAtOffset(offset: number, lineStarts: number[]): number {
  for (let i = lineStarts.length - 1; i >= 0; i--) {
    if (offset >= lineStarts[i]) return i;
  }
  return 0;
}

/** 围栏外 HTML 注释清空为同等换行数（保留行数 → data-line）；不开启 html:true。 */
function blankHtmlComments(lines: string[], fenceMask: boolean[]): void {
  const text = lines.join('\n');
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === '\n') lineStarts.push(i + 1);
  }
  HTML_COMMENT_RE.lastIndex = 0;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  let replaced = false;
  while ((m = HTML_COMMENT_RE.exec(text))) {
    const lineIdx = lineIndexAtOffset(m.index, lineStarts);
    if (fenceMask[lineIdx]) continue;
    replaced = true;
    out += text.slice(last, m.index);
    const nl = (m[0].match(/\n/g) || []).length;
    out += '\n'.repeat(nl);
    last = m.index + m[0].length;
  }
  if (!replaced) return;
  out += text.slice(last);
  const next = out.split('\n');
  if (next.length !== lines.length) return;
  for (let i = 0; i < lines.length; i++) lines[i] = next[i];
}

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
// 4) 非空段落后 ---/___ 改写为 ***，避免 Setext 下划线把分割线显示成源码。
// 5) 围栏外 <!-- --> 清空（保留换行），对齐竞品「HTML 注释不可见」。
function preprocessForRender(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const fenceMask = buildCodeFenceMask(lines);
  blankFrontMatterLines(lines, fenceMask);
  blankHtmlComments(lines, fenceMask);
  preserveSubItemLineBreaks(lines, fenceMask);
  fixSetextUnderlineAsThematicBreak(lines, fenceMask);
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

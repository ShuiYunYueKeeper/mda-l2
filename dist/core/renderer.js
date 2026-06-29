"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEVEL_COLORS = void 0;
exports.createMarkdownIt = createMarkdownIt;
exports.renderMarkdown = renderMarkdown;
const markdown_it_1 = __importDefault(require("markdown-it"));
const parser_1 = require("./parser");
const LEVEL_COLORS = {
    critical: '#e74c3c',
    major: '#e67e22',
    minor: '#f1c40f',
    info: '#95a5a6',
};
exports.LEVEL_COLORS = LEVEL_COLORS;
function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function createMarkdownIt() {
    const md = new markdown_it_1.default('commonmark', {
        html: false,
        linkify: false,
        typographer: false,
    });
    // GFM 表格: commonmark preset 不含表格，手动启用
    md.enable('table');
    // 自定义 image renderer — 双重 DOM（img + alt fallback）
    const imageRule = md.renderer.rules.image;
    md.renderer.rules.image = (tokens, idx, options, env, self) => {
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
function preprocessForRender(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const fenceMask = (0, parser_1.buildCodeFenceMask)(lines);
    // 仅清空“围栏外”的批注行；围栏内的批注样例属于代码内容，须原样保留显示
    return lines
        .map((line, i) => (!fenceMask[i] && parser_1.ANNO_REGEX.test(line) ? '' : line))
        .join('\n');
}
function renderMarkdown(md, text) {
    return md.render(preprocessForRender(text));
}
//# sourceMappingURL=renderer.js.map
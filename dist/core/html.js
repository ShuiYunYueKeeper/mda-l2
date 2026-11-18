"use strict";
/**
 * 原生 HTML 白名单清洗（core 纯函数，无三方依赖）。
 *
 * 为什么必须自己清洗：GUI 预览走 `innerHTML`，任何 `onerror=`/`javascript:` 都会在渲染进程执行；
 * 而 markdown-it 的 `html: true` 会把作者写的 HTML 原样吐出。故渲染前一律按「白名单重建」处理：
 * 只保留已知标签/属性，未知标签丢壳留文，脚本类标签连内容一起丢。
 *
 * 为什么不在清洗结果里补齐未闭合标签：README 常见 `<details>` + 空行 + Markdown 正文 + `</details>`，
 * CommonMark 会在空行处截断 HTML 块。浏览器把后续内容自动嵌进仍未闭合的 `<details>`，
 * 正是 GitHub 的观感；此处若强行闭合，跨块嵌套就会失效。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeHtml = sanitizeHtml;
const VOID_TAGS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);
/** 允许保留的标签（其余丢壳留文） */
const ALLOWED_TAGS = new Set([
    'a',
    'abbr',
    'b',
    'blockquote',
    'br',
    'caption',
    'center',
    'code',
    'dd',
    'del',
    'details',
    'div',
    'dl',
    'dt',
    'em',
    'figcaption',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'ins',
    'kbd',
    'li',
    'mark',
    'ol',
    'p',
    'picture',
    'pre',
    'q',
    's',
    'samp',
    'small',
    'source',
    'span',
    'strike',
    'strong',
    'sub',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
    'var',
    'wbr',
]);
/** 连内容一起丢的标签（脚本 / 表单 / 外部嵌入 / 可在 SVG 内执行脚本的容器） */
const DROP_WITH_CONTENT = new Set([
    'applet',
    'audio',
    'base',
    'button',
    'canvas',
    'embed',
    'form',
    'frame',
    'frameset',
    'iframe',
    'input',
    'link',
    'math',
    'meta',
    'noscript',
    'object',
    'option',
    'param',
    'script',
    'select',
    'style',
    'svg',
    'template',
    'textarea',
    'video',
]);
const GLOBAL_ATTRS = new Set(['align', 'dir', 'lang', 'title']);
/** 按标签追加的属性（除 GLOBAL_ATTRS） */
const TAG_ATTRS = {
    a: ['href', 'name', 'rel', 'target'],
    details: ['open'],
    img: ['alt', 'decoding', 'height', 'loading', 'referrerpolicy', 'src', 'width'],
    td: ['colspan', 'height', 'rowspan', 'valign', 'width'],
    th: ['colspan', 'height', 'rowspan', 'scope', 'valign', 'width'],
    table: ['border', 'cellpadding', 'cellspacing', 'width'],
    ol: ['start', 'type'],
};
const URL_ATTRS = {
    a: ['href'],
    img: ['src'],
    source: ['src'],
};
/** 协议白名单；相对路径 / 锚点放行 */
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const IMG_DATA_SCHEME_RE = /^data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml)[;,]?/i;
const TAG_TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function escapeAttr(value) {
    // 不重复转义已成形的实体（README 徽章 URL 里本来就是 `&amp;`，
    // 无条件转 `&` 会得到 `&amp;amp;`，图片地址参数全废）
    return value
        .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});)/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/**
 * URL 属性值是否安全；不安全返回 null（该属性整体丢弃）。
 * @param raw 原始属性值
 * @param allowDataImage 允许 data:image/*（仅 img/source）
 */
function safeUrlValue(raw, allowDataImage) {
    // 去掉控制字符，避免 `java\nscript:` 绕过
    const value = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!value)
        return null;
    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value);
    if (!schemeMatch)
        return value; // 相对路径、锚点、协议相对 //host
    const scheme = schemeMatch[1].toLowerCase();
    if (SAFE_SCHEMES.has(scheme))
        return value;
    if (scheme === 'data') {
        if (allowDataImage && IMG_DATA_SCHEME_RE.test(value))
            return value;
        return null;
    }
    // file: 不给：本地相对图片由 resolveImageUrl 在渲染后补，源码里出现 file: 只可能是注入
    return null;
}
/**
 * 解析一段属性串，按白名单重建。
 * @param tag 小写标签名
 * @param rawAttrs 标签名后、`>` 前的原始文本
 */
function sanitizeAttrs(tag, rawAttrs) {
    if (!rawAttrs || !rawAttrs.trim())
        return '';
    const extra = TAG_ATTRS[tag] || [];
    const urlAttrs = URL_ATTRS[tag] || [];
    let out = '';
    ATTR_RE.lastIndex = 0;
    let m;
    while ((m = ATTR_RE.exec(rawAttrs))) {
        const name = (m[1] || '').toLowerCase();
        if (!name)
            continue;
        if (!GLOBAL_ATTRS.has(name) && extra.indexOf(name) < 0)
            continue;
        const value = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '';
        if (urlAttrs.indexOf(name) >= 0) {
            const safe = safeUrlValue(value, tag === 'img' || tag === 'source');
            if (safe == null)
                continue;
            out += ' ' + name + '="' + escapeAttr(safe) + '"';
            continue;
        }
        if (name === 'width' || name === 'height' || name === 'border' || name === 'cellpadding' ||
            name === 'cellspacing' || name === 'colspan' || name === 'rowspan' || name === 'start') {
            if (!/^\d{1,5}%?$/.test(value.trim()))
                continue;
            out += ' ' + name + '="' + escapeAttr(value.trim()) + '"';
            continue;
        }
        if (name === 'target') {
            if (!/^_(?:blank|self|parent|top)$/i.test(value.trim()))
                continue;
            out += ' target="' + escapeAttr(value.trim()) + '"';
            continue;
        }
        if (name === 'rel') {
            if (!/^[a-zA-Z\s-]{0,60}$/.test(value))
                continue;
            out += ' rel="' + escapeAttr(value.trim()) + '"';
            continue;
        }
        out += ' ' + name + '="' + escapeAttr(value) + '"';
    }
    return out;
}
/**
 * 清洗一段 HTML 片段：标签/属性按白名单重建，脚本类标签连内容丢弃。
 * @param html 原始 HTML（可为空）
 * @returns 可安全 innerHTML 的 HTML
 */
function sanitizeHtml(html) {
    const src = String(html == null ? '' : html);
    if (!src)
        return '';
    let out = '';
    let last = 0;
    let stack = [];
    TAG_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TAG_TOKEN_RE.exec(src))) {
        out += src.slice(last, m.index);
        last = m.index + m[0].length;
        // 注释 / CDATA / doctype / 处理指令：整体丢弃
        if (m[1] == null)
            continue;
        const raw = m[0];
        const tag = m[1].toLowerCase();
        const closing = raw.charAt(1) === '/';
        const selfClosing = m[3] === '/' || VOID_TAGS.has(tag);
        if (closing) {
            // 结束标签必须放行：它常常单独成块（`<details>` … 空行 … `</details>`），
            // 与开标签不在同一个 token 里，无法靠栈配对；多余结束标签浏览器会忽略。
            if (!ALLOWED_TAGS.has(tag))
                continue;
            const idx = stack.lastIndexOf(tag);
            if (idx >= 0) {
                // 关闭中间未闭合的同级标签（如 <div><p></div>）
                for (let i = stack.length - 1; i >= idx; i--)
                    out += '</' + stack[i] + '>';
                stack = stack.slice(0, idx);
            }
            else {
                out += '</' + tag + '>';
            }
            continue;
        }
        if (DROP_WITH_CONTENT.has(tag)) {
            // 连内容一起丢：跳到对应闭合标签之后
            const closeRe = new RegExp('</' + tag + '\\s*>', 'i');
            const rest = src.slice(last);
            const found = closeRe.exec(rest);
            if (found)
                last += found.index + found[0].length;
            else
                last = src.length;
            TAG_TOKEN_RE.lastIndex = last;
            continue;
        }
        if (!ALLOWED_TAGS.has(tag))
            continue; // 丢壳留文
        out += '<' + tag + sanitizeAttrs(tag, m[2] || '') + (selfClosing ? ' />' : '>');
        if (!selfClosing)
            stack.push(tag);
    }
    out += src.slice(last);
    return out;
}
//# sourceMappingURL=html.js.map
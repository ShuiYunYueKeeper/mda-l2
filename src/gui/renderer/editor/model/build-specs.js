/**
 * P2 §4.1 装饰构建（纯函数）：文本 + 节点 → Spec[]，不碰 DOM。D15：始终隐藏语法标记。
 */
'use strict';

const { SYNTAX_RULES } = require('./syntax-rules');
const { findAnnotationHideRanges, findHtmlCommentHideRanges } = require('./anno-lines');
const { detectFrontMatter } = require('./readonly-blocks');
const { findMathRanges } = require('./parse-math');
const { findUnderlineRanges, findTripleTildeRanges, overlapsExclude } = require('./underline');
const { htmlBlockRegion } = require('./html-block');
const { parser: lezerMarkdownParser, GFM } = require('@lezer/markdown');

// HTML 块尾段再解析用的解析器（惰性创建：只有真的出现尾段才会 build）
let htmlTailParser = null;
function tailParser() {
  if (!htmlTailParser) htmlTailParser = lezerMarkdownParser.configure([GFM]);
  return htmlTailParser;
}

// 尾段再解析的体积上限：尾段本应只有几行（HTML 块到空行就结束），设上限只是防止
// 脏文档（整篇紧贴闭合标签）把整篇文档再解析一遍。
const HTML_TAIL_MAX_CHARS = 20000;

const PRIORITY = {
  'hide-line': 100,
  'readonly-block': 80,
  widget: 60,
  'hide-mark': 40,
  style: 30,
  'line-style': 25,
  raw: 10,
};

/**
 * @typedef {{
 *   kind: string,
 *   from: number,
 *   to: number,
 *   cls?: string,
 *   href?: string,
 *   widget?: string,
 *   checked?: boolean,
 *   source?: string,
 *   malformed?: boolean,
 *   priority?: number,
 * }} DecoSpec
 */

/**
 * CM6 的 Decoration.line 只有落在行首才会生效，否则被静默丢弃。
 * 列表项内的标题（`- ## 标题`）节点起点不在行首，须回退到行首再挂行样式。
 * @param {string} text
 * @param {number} pos
 * @returns {number}
 */
function lineStartOf(text, pos) {
  const nl = String(text).lastIndexOf('\n', pos - 1);
  return nl < 0 ? 0 : nl + 1;
}

/**
 * @param {{ from: number, to: number, type: string }} node
 * @param {string} text
 * @returns {{ level: number, anchorFrom: number }}
 */
function headingHandleMeta(node, text) {
  if (/^ATXHeading([1-6])$/.test(node.type)) {
    const level = parseInt(node.type.slice(-1), 10);
    let end = node.from + level;
    if (end < node.to && text.charAt(end) === ' ') end += 1;
    return { level: level, anchorFrom: end > node.from ? end : node.from };
  }
  if (node.type === 'SetextHeading1') return { level: 1, anchorFrom: node.from };
  if (node.type === 'SetextHeading2') return { level: 2, anchorFrom: node.from };
  return { level: 1, anchorFrom: node.from };
}

/**
 * @param {string} text
 * @param {{ from: number, to: number, type: string, listKind?: string }[]} nodes
 * @param {{ skipTypes?: Record<string, 1>, widgetEnabled?: (kind: string) => boolean }} [opts]
 * @returns {DecoSpec[]}
 */
function buildDecorationSpecs(text, nodes, opts) {
  opts = opts || {};
  // 缩进代码块仍跳过；围栏 / 表 / 图走 Widget（须过 widgetPhase 闸门）
  const skipTypes = opts.skipTypes || { CodeBlock: 1 };
  const specs = [];
  const widgetEnabled =
    typeof opts.widgetEnabled === 'function'
      ? opts.widgetEnabled
      : function () {
          return true;
        };

  // S18 front matter（文档开头）
  const fm = detectFrontMatter(text);
  if (fm) {
    specs.push({
      kind: 'readonly-block',
      from: fm.from,
      to: fm.to,
      label: fm.label,
      priority: PRIORITY['readonly-block'],
    });
  }

  // S24/S25 批注行（最高优先级，与语法树无关）
  const annoRanges = findAnnotationHideRanges(text);
  for (let a = 0; a < annoRanges.length; a++) {
    const ar = annoRanges[a];
    if (ar.from < ar.to) {
      specs.push({
        kind: 'hide-line',
        from: ar.from,
        to: ar.to,
        malformed: !!ar.malformed,
        priority: PRIORITY['hide-line'],
      });
    }
  }

  const htmlComments = findHtmlCommentHideRanges(text);
  for (let h = 0; h < htmlComments.length; h++) {
    const cr = htmlComments[h];
    if (!(cr.from < cr.to)) continue;
    specs.push({
      kind: cr.kind === 'mark' ? 'hide-mark' : 'hide-line',
      from: cr.from,
      to: cr.to,
      priority: PRIORITY['hide-line'],
    });
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || node.from >= node.to) continue;
    if (skipTypes[node.type]) continue;

    // 标题手柄（零宽 side widget）
    if (/^ATXHeading[1-6]$/.test(node.type) || /^SetextHeading[12]$/.test(node.type)) {
      if (widgetEnabled('heading-handle')) {
        const source = text.slice(node.from, node.to);
        const meta = headingHandleMeta(node, text);
        specs.push({
          kind: 'widget',
          widget: 'heading-handle',
          from: meta.anchorFrom,
          to: meta.anchorFrom,
          blockFrom: node.from,
          blockTo: node.to,
          headingLevel: meta.level,
          source: source,
          priority: PRIORITY.widget,
        });
      }
    }

    // 引用块手柄（零宽 side widget）
    if (node.type === 'Blockquote') {
      if (widgetEnabled('quote-handle')) {
        const source = text.slice(node.from, node.to);
        specs.push({
          kind: 'widget',
          widget: 'quote-handle',
          from: node.from,
          to: node.from,
          blockFrom: node.from,
          blockTo: node.to,
          quoteKind: 'quote',
          source: source,
          priority: PRIORITY.widget,
        });
      }
      continue;
    }

    const rule = SYNTAX_RULES[node.type];

    // 原生 HTML 块：整块交给 html-block widget（内部用 renderMarkdown 渲染），
    // 这样块内的 Markdown（如 <details> 里的正文）也能正常排版。
    if (node.type === 'HTMLBlock') {
      if (!widgetEnabled('html-block')) continue;
      specs.push({
        kind: 'widget',
        widget: 'html-block',
        from: node.from,
        to: node.to,
        source: text.slice(node.from, node.to),
        priority: PRIORITY.widget,
      });
      continue;
    }

    if (!rule) continue;

    // —— Widget 类 ——
    if (rule.class === 'W') {
      if (rule.widget === 'task') {
        const marker = text.slice(node.from, node.to);
        const checked = /^\[[xX]\]$/.test(marker);
        specs.push({
          kind: 'widget',
          widget: 'task',
          from: node.from,
          to: node.to,
          checked: checked,
          priority: PRIORITY.widget,
        });
        continue;
      }
      const alwaysWidget =
        rule.widget === 'hr' ||
        rule.widget === 'code' ||
        rule.widget === 'table' ||
        rule.widget === 'image';
      if (alwaysWidget) {
        const widgetKind =
          rule.widget === 'code' &&
          /^```\s*mermaid\b/i.test(text.slice(node.from, Math.min(node.to, node.from + 32)))
            ? 'mermaid'
            : rule.widget;
        if (!widgetEnabled(widgetKind)) continue;
        specs.push({
          kind: 'widget',
          widget: rule.widget,
          from: node.from,
          to: node.to,
          source: text.slice(node.from, node.to),
          priority: PRIORITY.widget,
        });
        // 块 replace 未就绪时仍隐藏语法（D15）；与 ViewPlugin hide 层配合
        const marks = rule.markRanges(node, text) || [];
        for (let m = 0; m < marks.length; m++) {
          const mark = marks[m];
          if (mark.from < mark.to) {
            specs.push({
              kind: 'hide-mark',
              from: mark.from,
              to: mark.to,
              priority: PRIORITY['hide-mark'],
            });
          }
        }
      }
      continue;
    }

    if (rule.class !== 'R') continue;

    if (node.type === 'ListMark' && node.listKind === 'ordered') {
      // 序号保持可编辑的字面文本，只套一层 span 供样式跟随标题级别
      let ordTo = node.to;
      if (ordTo < text.length && text.charAt(ordTo) === ' ') ordTo += 1;
      specs.push({
        kind: 'style',
        from: node.from,
        to: ordTo,
        cls: 'mda-cm-list-mark',
        priority: PRIORITY.style,
      });
      continue;
    }

    if (node.type === 'ListMark' && node.listKind === 'bullet') {
      let markTo = node.to;
      if (markTo < text.length && text.charAt(markTo) === ' ') markTo += 1;
      // 任务项自带复选框 widget，再画圆点会显示成「• ☐ 文字」
      if (/^ *\[[ xX]\]\s/.test(text.slice(markTo))) {
        specs.push({
          kind: 'hide-mark',
          from: node.from,
          to: markTo,
          priority: PRIORITY['hide-mark'],
        });
        continue;
      }
      specs.push({
        kind: 'widget',
        widget: 'bullet',
        from: node.from,
        to: markTo,
        priority: PRIORITY.widget,
      });
      continue;
    }

    if (node.type === 'QuoteMark') {
      specs.push({
        kind: 'hide-mark',
        from: node.from,
        to: node.to,
        priority: PRIORITY['hide-mark'],
      });
      // 行内仅 `> `（无正文）时保留空格，避免整行都被 atomic hide，无法落点输入
      if (node.to < text.length && text.charAt(node.to) === ' ') {
        let i = node.to + 1;
        let hasBody = false;
        while (i < text.length && text.charAt(i) !== '\n') {
          const ch = text.charAt(i);
          if (ch !== ' ' && ch !== '\t') {
            hasBody = true;
            break;
          }
          i += 1;
        }
        if (hasBody) {
          specs.push({
            kind: 'hide-mark',
            from: node.to,
            to: node.to + 1,
            priority: PRIORITY['hide-mark'],
          });
        }
      }
      specs.push({
        kind: 'line-style',
        from: lineStartOf(text, node.from),
        to: lineStartOf(text, node.from),
        cls: 'mda-cm-blockquote-line',
        priority: PRIORITY['line-style'],
      });
      continue;
    }

    const marks = rule.markRanges(node, text) || [];
    for (let m = 0; m < marks.length; m++) {
      const mark = marks[m];
      if (mark.from < mark.to) {
        specs.push({
          kind: 'hide-mark',
          from: mark.from,
          to: mark.to,
          priority: PRIORITY['hide-mark'],
        });
      }
    }
    const content =
      typeof rule.contentRange === 'function' ? rule.contentRange(node, text) : null;
    const href = typeof rule.hrefOf === 'function' ? rule.hrefOf(node, text) : '';
    if (content && rule.cls) {
      if (content.from < content.to) {
        specs.push({
          kind: 'style',
          from: content.from,
          to: content.to,
          cls: rule.cls,
          href: href || undefined,
          priority: PRIORITY.style,
        });
      }
      // 空标题行也需行高，否则手柄与占位与有正文标题不一致
      if (/^mda-cm-h[1-6]$/.test(rule.cls)) {
        specs.push({
          kind: 'line-style',
          from: lineStartOf(text, node.from),
          cls: rule.cls + '-line',
          priority: PRIORITY['line-style'],
        });
      }
    }
  }

  appendMathSpecs(text, specs, {
    widgetEnabled: widgetEnabled,
  });

  return dedupeByPriority(specs);
}

/**
 * S15/S16 公式（Lezer 无节点，独立扫描）
 * @param {string} text
 * @param {DecoSpec[]} specs
 * @param {{ widgetEnabled?: (kind: string) => boolean }} opts
 */
function appendMathSpecs(text, specs, opts) {
  opts = opts || {};
  const widgetEnabled =
    typeof opts.widgetEnabled === 'function'
      ? opts.widgetEnabled
      : function () {
          return true;
        };
  if (!widgetEnabled('math-inline') && !widgetEnabled('math-block')) return;

  const mathRanges = findMathRanges(text);
  for (let i = 0; i < mathRanges.length; i++) {
    const r = mathRanges[i];
    if (r.kind === 'math-inline' && !widgetEnabled('math-inline')) continue;
    if (r.kind === 'math-block' && !widgetEnabled('math-block')) continue;
    specs.push({
      kind: 'widget',
      widget: r.kind,
      from: r.from,
      to: r.to,
      source: text.slice(r.from, r.to),
      tex: r.tex,
      priority: PRIORITY.widget,
    });
    // 行内公式整段 Decoration.replace + widget 层 atomic，无需再 hide $ 定界符
  }
}

function dedupeByPriority(specs) {
  const sorted = specs.slice().sort(function (a, b) {
    if (a.from !== b.from) return a.from - b.from;
    if (a.to !== b.to) return a.to - b.to;
    return (b.priority || 0) - (a.priority || 0);
  });
  const out = [];
  const seen = Object.create(null);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const key =
      s.kind +
      ':' +
      s.from +
      ':' +
      s.to +
      ':' +
      (s.cls || '') +
      ':' +
      (s.widget || '');
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(s);
  }
  out.sort(function (a, b) {
    if (a.from !== b.from) return a.from - b.from;
    return a.to - b.to;
  });
  return out;
}

const IMAGE_ONLY_LINE_RE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;

/**
 * Setext 节点末行若是 ---/___（h2）或图片后的 ===，当作 HR 而非标题下划线。
 * @param {string} text
 * @param {string} nodeName
 * @param {number} from
 * @param {number} to
 */
function hrRangeFromSetext(text, nodeName, from, to) {
  if (to <= from) return null;
  let lineEnd = to;
  while (lineEnd > from && (text.charAt(lineEnd - 1) === '\n' || text.charAt(lineEnd - 1) === '\r')) {
    lineEnd -= 1;
  }
  let lineStart = lineEnd;
  while (lineStart > from && text.charAt(lineStart - 1) !== '\n' && text.charAt(lineStart - 1) !== '\r') {
    lineStart -= 1;
  }
  if (lineStart <= from) return null;
  const ul = text.slice(lineStart, lineEnd).trim();
  const isH2 = /^-{3,}$/.test(ul) || /^_{3,}$/.test(ul);
  const isH1 = /^={3,}$/.test(ul);
  if (!isH2 && !isH1) return null;
  if (nodeName === 'SetextHeading2' && isH2) {
    return { from: lineStart, to: to };
  }
  const nl = text.slice(from, to).search(/\r?\n/);
  if (nl < 0) return null;
  const head = text.slice(from, from + nl).trim();
  if (!IMAGE_ONLY_LINE_RE.test(head)) return null;
  return { from: lineStart, to: to };
}

/**
 * @param {import('@lezer/common').Tree} tree
 * @param {string} [text]
 * @returns {{ from: number, to: number, type: string, listKind?: string }[]}
 */
function collectSyntaxNodes(tree, text) {
  const doc = text == null ? '' : String(text);
  const nodes = [];
  const stack = [];
  let fenceDepth = 0;
  // 最近一个已入列的 HTML 块（不能只看 nodes 末尾：块内可能夹着标题/表格等节点）
  let lastHtmlNode = null;
  // HTML 块 region 收尾之后仍在同一语法节点里的尾行（见 html-block.js 的收尾条件）
  const htmlTails = [];
  tree.iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        // 围栏本身入列（供 S13 widget）；子节点不再解析其它行内规则
        if (node.name === 'FencedCode' && SYNTAX_RULES.FencedCode) {
          nodes.push({ from: node.from, to: node.to, type: 'FencedCode' });
        }
        fenceDepth += 1;
        stack.push(node.name);
        return;
      }
      stack.push(node.name);
      if (fenceDepth > 0) return;

      if (node.name === 'URL') {
        if (
          stack.indexOf('Link') >= 0 ||
          stack.indexOf('Autolink') >= 0 ||
          stack.indexOf('Image') >= 0
        ) {
          return;
        }
      }

      // 表格只取根 Table，跳过行列单元格
      if (
        node.name === 'TableRow' ||
        node.name === 'TableHeader' ||
        node.name === 'TableCell' ||
        node.name === 'TableDelimiter'
      ) {
        return;
      }

      // 引用块根节点（手柄挂点）；子 QuoteMark 仍入列
      if (node.name === 'Blockquote') {
        nodes.push({ from: node.from, to: node.to, type: 'Blockquote' });
        return;
      }

      if (node.name === 'SetextHeading1' || node.name === 'SetextHeading2') {
        const hr = doc ? hrRangeFromSetext(doc, node.name, node.from, node.to) : null;
        if (hr) {
          nodes.push({ from: hr.from, to: hr.to, type: 'HorizontalRule' });
          return;
        }
        nodes.push({ from: node.from, to: node.to, type: node.name });
        return;
      }

      // 原生 HTML 块（README 居中头部 / <details> 折叠块）：语法树里没有对应 SYNTAX_RULES，
      // 必须在此显式入列，否则会被下面的 `if (!SYNTAX_RULES[node.name]) return;` 丢掉。
      // 表格 / 引用 / 列表内的 HTML 不做整块替换：会拆掉那些块自身的排版与交互。
      if (node.name === 'HTMLBlock') {
        if (
          stack.indexOf('Table') >= 0 ||
          stack.indexOf('TableCell') >= 0 ||
          stack.indexOf('Blockquote') >= 0 ||
          stack.indexOf('BulletList') >= 0 ||
          stack.indexOf('OrderedList') >= 0
        ) {
          return;
        }
        const region = doc ? htmlBlockRegion(doc, node.from, node.to) : null;
        let from = region ? region.from : node.from;
        const to = region ? region.to : node.to;
        // 标签配平后、仍在同一 HTMLBlock 节点里的尾行（CommonMark 要遇空行才结束块）：
        // 这些行不属于卡片，稍后重新解析成正常块，否则会以裸源码露在卡片外面。
        if (region && to < node.to) htmlTails.push({ from: to, to: node.to });
        // 只隔空行的连续 HTML 块合并成一块：README 的居中头部是 <p>/<h1>/<p> 多个
        // HTMLBlock 拼的，逐块替换会变成一叠卡片，且 heading 与副标题不再同处居中。
        const prev = lastHtmlNode;
        if (prev) {
          // 闭合标签常被算进上一个块（如 </details> 既结束上一个 region、又是下一个
          // HTMLBlock 的首行）。若新块起点落在上一块的 region 内，裁剪到块尾，否则两
          // 个 widget 区间重叠 —— live-preview 会丢弃后者，那块源码就漏成纯文本。
          if (from < prev.to) from = prev.to;
          // 整块都落在上一块里（同一起止行被重复报出）就直接丢掉，别把区间缩成空
          if (to <= from) {
            if (to > prev.to) prev.to = to;
            return;
          }
          if (/^\s*$/.test(doc.slice(prev.to, from))) {
            // 合并只会变长：region 可能比语法节点短（尾行留给再解析），不能用它缩上一块
            if (to > prev.to) prev.to = to;
            return;
          }
        }
        const item = {
          from: from,
          to: to,
          type: 'HTMLBlock',
        };
        nodes.push(item);
        lastHtmlNode = item;
        return;
      }

      if (!SYNTAX_RULES[node.name]) return;

      const item = { from: node.from, to: node.to, type: node.name };
      if (node.name === 'ListMark') {
        for (let i = stack.length - 2; i >= 0; i--) {
          if (stack[i] === 'BulletList') {
            item.listKind = 'bullet';
            break;
          }
          if (stack[i] === 'OrderedList') {
            item.listKind = 'ordered';
            break;
          }
        }
      }
      nodes.push(item);
    },
    leave(node) {
      stack.pop();
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        fenceDepth = Math.max(0, fenceDepth - 1);
      }
    },
  });
  // HTML 块尾段重新解析：让「紧贴卡片闭合标签」键入/粘贴的文字、插入的代码围栏恢复成
  // 普通 Markdown 块（段落 / 代码块 / 表格…），而不是被卡片吞掉或漏成裸源码。
  for (let t = 0; t < htmlTails.length; t++) {
    const tail = htmlTails[t];
    const src = doc.slice(tail.from, tail.to);
    if (!src.trim() || src.length > HTML_TAIL_MAX_CHARS) continue;
    const parsed = collectSyntaxNodes(tailParser().parse(src), src);
    for (let k = 0; k < parsed.length; k++) {
      const tailNode = parsed[k];
      const item = Object.assign({}, tailNode, {
        from: tailNode.from + tail.from,
        to: tailNode.to + tail.from,
      });
      // 尾段节点不参与「只隔空行就合并」：此时 lastHtmlNode 可能已推进到更靠后的块，
      // 拿它裁剪会把区间裁成 from > to 的非法值。
      if (item.to <= item.from) continue;
      nodes.push(item);
      if (item.type === 'HTMLBlock') lastHtmlNode = item;
    }
  }
  // 尾段节点是按节点顺序补到末尾的，统一按位置稳定排序，保持「节点按文档顺序」不变式
  nodes.sort((a, b) => a.from - b.from);
  if (doc) {
    // `~~~text~~~` 会被 Lezer 误当成单行 FencedCode；拆成下划线+删除线。
    // 只清掉「落在叠套段内」或整段误认的围栏，外层加粗/斜体等包裹必须保留。
    const triples = findTripleTildeRanges(doc);
    if (triples.length) {
      const kept = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        let drop = false;
        for (let t = 0; t < triples.length; t++) {
          const tr = triples[t];
          const inside = n.from >= tr.from && n.to <= tr.to;
          const fauxFence = n.type === 'FencedCode' && n.from < tr.to && n.to > tr.from;
          if (inside || fauxFence) {
            drop = true;
            break;
          }
        }
        if (!drop) kept.push(n);
      }
      nodes.length = 0;
      for (let k = 0; k < kept.length; k++) nodes.push(kept[k]);
      for (let t = 0; t < triples.length; t++) {
        const tr = triples[t];
        nodes.push({ from: tr.from, to: tr.to, type: 'Underline' });
        nodes.push({ from: tr.from + 1, to: tr.to - 1, type: 'Strikethrough' });
      }
    }
    const exclude = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (
        n.type === 'FencedCode' ||
        n.type === 'CodeBlock' ||
        n.type === 'InlineCode' ||
        n.type === 'HorizontalRule'
      ) {
        exclude.push({ from: n.from, to: n.to });
      } else if (n.type === 'Strikethrough' && !overlapsExclude(n.from, n.to, triples)) {
        // 叠套注入的内层删除线不要进 exclude，否则 findUnderlineRanges 认不出 ~~~ 段
        exclude.push({ from: n.from, to: n.to });
      }
    }
    const unders = findUnderlineRanges(doc, exclude);
    for (let u = 0; u < unders.length; u++) {
      // 叠套段已注入 Underline，跳过 findUnderlineRanges 对同一段的重复推入
      if (!overlapsExclude(unders[u].from, unders[u].to, triples)) {
        nodes.push(unders[u]);
      }
    }
  }
  return nodes;
}

module.exports = {
  buildDecorationSpecs: buildDecorationSpecs,
  appendMathSpecs: appendMathSpecs,
  dedupeByPriority: dedupeByPriority,
  collectSyntaxNodes: collectSyntaxNodes,
  headingHandleMeta: headingHandleMeta,
  PRIORITY: PRIORITY,
};

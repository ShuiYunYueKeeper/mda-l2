/**
 * P2 §4.1 装饰构建（纯函数）：文本 + 节点 → Spec[]，不碰 DOM。D15：始终隐藏语法标记。
 */
'use strict';

const { SYNTAX_RULES } = require('./syntax-rules');
const { findAnnotationHideRanges, findHtmlCommentHideRanges } = require('./anno-lines');
const { detectFrontMatter } = require('./readonly-blocks');
const { findMathRanges } = require('./parse-math');
const { findUnderlineRanges, findTripleTildeRanges, overlapsExclude } = require('./underline');

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

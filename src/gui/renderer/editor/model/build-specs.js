/**
 * P2 §4.1 装饰构建（纯函数）：文本 + 节点 + reveal → Spec[]，不碰 DOM。
 */
'use strict';

const { SYNTAX_RULES } = require('./syntax-rules');
const { isRevealed } = require('./reveal');
const { findAnnotationHideRanges } = require('./anno-lines');
const { detectFrontMatter } = require('./readonly-blocks');
const { findMathRanges } = require('./parse-math');

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
 * @param {string} text
 * @param {{ from: number, to: number, type: string, listKind?: string }[]} nodes
 * @param {{ from: number, to: number }[]} revealRanges
 * @param {{ skipTypes?: Record<string, 1> }} [opts]
 * @returns {DecoSpec[]}
 */
function buildDecorationSpecs(text, nodes, revealRanges, opts) {
  opts = opts || {};
  // 缩进代码块仍跳过；围栏 / 表 / 图走 Widget（须过 widgetPhase 闸门）
  const skipTypes = opts.skipTypes || { CodeBlock: 1 };
  const specs = [];
  const fullHide = opts.fullHide === true;
  const revealed = fullHide ? [] : revealRanges || [];
  const focusedBlock = opts.focusedBlock || null;
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

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || node.from >= node.to) continue;
    if (skipTypes[node.type]) continue;

    // 引用块手柄（零宽 side widget）；标题不加手柄
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

    const nodeRevealed = isRevealed(node, revealed);

    // —— Widget 类 ——
    if (rule.class === 'W') {
      if (
        !fullHide &&
        focusedBlock &&
        focusedBlock.kind !== 'table' &&
        node.from === focusedBlock.from &&
        node.to === focusedBlock.to
      ) {
        specs.push({
          kind: 'raw',
          from: node.from,
          to: node.to,
          cls: 'mda-cm-focused-source',
          priority: PRIORITY.raw,
        });
        continue;
      }
      if (rule.widget === 'task') {
        if (nodeRevealed) continue;
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
      if (nodeRevealed && !alwaysWidget) continue;
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

    if (node.type === 'ListMark' && node.listKind === 'ordered') continue;

    if (node.type === 'ListMark' && node.listKind === 'bullet') {
      if (nodeRevealed) continue;
      let markTo = node.to;
      if (markTo < text.length && text.charAt(markTo) === ' ') markTo += 1;
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
      if (nodeRevealed) continue;
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
        from: node.from,
        to: node.from,
        cls: 'mda-cm-blockquote-line',
        priority: PRIORITY['line-style'],
      });
      continue;
    }

    if (nodeRevealed) {
      const content =
        typeof rule.contentRange === 'function' ? rule.contentRange(node, text) : null;
      const href = typeof rule.hrefOf === 'function' ? rule.hrefOf(node, text) : '';
      if (content && content.from < content.to && rule.cls) {
        specs.push({
          kind: 'style',
          from: content.from,
          to: content.to,
          cls: rule.cls,
          href: href || undefined,
          priority: PRIORITY.style,
        });
        if (/^mda-cm-h[1-6]$/.test(rule.cls)) {
          specs.push({
            kind: 'line-style',
            from: node.from,
            cls: rule.cls + '-line',
            priority: PRIORITY['line-style'],
          });
        }
      } else if (rule.cls) {
        specs.push({
          kind: 'raw',
          from: node.from,
          to: node.to,
          cls: rule.cls,
          href: href || undefined,
          priority: PRIORITY.raw,
        });
      }
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
    if (content && content.from < content.to && rule.cls) {
      specs.push({
        kind: 'style',
        from: content.from,
        to: content.to,
        cls: rule.cls,
        href: href || undefined,
        priority: PRIORITY.style,
      });
      if (/^mda-cm-h[1-6]$/.test(rule.cls)) {
        specs.push({
          kind: 'line-style',
          from: node.from,
          cls: rule.cls + '-line',
          priority: PRIORITY['line-style'],
        });
      }
    }
  }

  appendMathSpecs(text, specs, {
    widgetEnabled: widgetEnabled,
    focusedBlock: focusedBlock,
    fullHide: fullHide,
  });

  return dedupeByPriority(specs);
}

/**
 * S15/S16 公式（Lezer 无节点，独立扫描）
 * @param {string} text
 * @param {DecoSpec[]} specs
 * @param {{ widgetEnabled?: (kind: string) => boolean, focusedBlock?: object, fullHide?: boolean }} opts
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

  const focusedBlock = opts.focusedBlock || null;
  const mathRanges = findMathRanges(text);
  for (let i = 0; i < mathRanges.length; i++) {
    const r = mathRanges[i];
    if (r.kind === 'math-inline' && !widgetEnabled('math-inline')) continue;
    if (r.kind === 'math-block' && !widgetEnabled('math-block')) continue;
    if (
      r.kind === 'math-block' &&
      focusedBlock &&
      focusedBlock.kind === 'math-block' &&
      focusedBlock.from === r.from &&
      focusedBlock.to === r.to
    ) {
      specs.push({
        kind: 'raw',
        from: r.from,
        to: r.to,
        cls: 'mda-cm-focused-source',
        priority: PRIORITY.raw,
      });
      continue;
    }
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

/**
 * @param {import('@lezer/common').Tree} tree
 * @returns {{ from: number, to: number, type: string, listKind?: string }[]}
 */
function collectSyntaxNodes(tree) {
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
  return nodes;
}

module.exports = {
  buildDecorationSpecs: buildDecorationSpecs,
  appendMathSpecs: appendMathSpecs,
  dedupeByPriority: dedupeByPriority,
  collectSyntaxNodes: collectSyntaxNodes,
  PRIORITY: PRIORITY,
};

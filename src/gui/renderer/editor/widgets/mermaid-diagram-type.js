/**
 * 从 Mermaid 源码首条有效语句识别图表类型关键字，供块顶栏展示。
 */
'use strict';

/**
 * @param {string} code
 * @returns {string}
 */
function getMermaidFirstKeyword(code) {
  if (!code) return '';
  const lines = String(code).replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('%%')) continue;
    const token = (line.split(/\s+/)[0] || '').trim();
    if (token) return token;
  }
  return '';
}

/**
 * 归一化 typeId（测试/分类用）；顶栏展示请用 getMermaidFirstKeyword + mermaidDiagramTypeLabel。
 * @param {string} code
 * @returns {string}
 */
function detectMermaidDiagramType(code) {
  const kw = getMermaidFirstKeyword(code);
  if (!kw) return 'unknown';
  const lower = kw.toLowerCase();
  if (lower === 'graph' || lower === 'flowchart') return lower;
  if (lower === 'sequencediagram') return 'sequence';
  if (lower.startsWith('classdiagram')) return 'class';
  if (lower.startsWith('statediagram')) return 'state';
  if (lower === 'erdiagram') return 'er';
  if (lower === 'journey') return 'journey';
  if (lower === 'gantt') return 'gantt';
  if (lower === 'pie') return 'pie';
  if (lower === 'quadrantchart') return 'quadrant';
  if (lower.startsWith('requirementdiagram')) return 'requirement';
  if (lower === 'gitgraph') return 'gitgraph';
  if (lower === 'mindmap') return 'mindmap';
  if (lower === 'timeline') return 'timeline';
  if (lower === 'zenuml') return 'zenuml';
  if (lower.startsWith('sankey')) return 'sankey';
  if (lower.startsWith('block')) return 'block';
  if (lower.startsWith('packet')) return 'packet';
  if (lower.startsWith('architecture')) return 'architecture';
  if (lower.startsWith('c4')) return 'c4';
  if (lower === 'xychart-beta' || lower === 'xychart') return 'xychart';
  if (lower === 'kanban') return 'kanban';
  return lower.replace(/-beta$/i, '').replace(/-v\d+$/i, '');
}

/**
 * 已知 Mermaid 关键字 → i18n 键（小写查找，避免 gitGraph/C4Context 等驼峰与键名大小写不一致）。
 * @type {Record<string, string>}
 */
const MERMAID_KEYWORD_I18N_KEYS = {
  gitgraph: 'mermaidKwGitgraph',
  c4context: 'mermaidKwC4',
  c4container: 'mermaidKwC4',
  c4component: 'mermaidKwC4',
  c4dynamic: 'mermaidKwC4',
  c4deployment: 'mermaidKwC4',
};

/**
 * @param {string} keyword
 * @returns {string}
 */
function mermaidKeywordI18nKey(keyword) {
  if (!keyword) return 'diagram';
  const withoutSuffix = keyword.replace(/-beta$/i, '').replace(/-v\d+$/i, '');
  const lower = withoutSuffix.toLowerCase();
  if (MERMAID_KEYWORD_I18N_KEYS[lower]) return MERMAID_KEYWORD_I18N_KEYS[lower];
  const parts = withoutSuffix
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(function (part) {
      return part.toLowerCase();
    });
  if (!parts.length) return 'diagram';
  const norm = parts
    .map(function (part, i) {
      if (i === 0) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
  return 'mermaidKw' + norm.charAt(0).toUpperCase() + norm.slice(1);
}

/**
 * @param {string} keyword
 * @returns {string}
 */
function formatMermaidKeywordFallback(keyword) {
  if (!keyword) return '';
  const lower = keyword.toLowerCase();
  if (lower === 'sequencediagram') return 'Sequence diagram';
  if (lower.startsWith('sankey')) {
    return keyword.replace(/-beta$/i, '').replace(/^sankey/i, 'Sankey');
  }
  if (lower.startsWith('classdiagram')) return 'Class diagram';
  if (lower.startsWith('statediagram')) return 'State diagram';
  if (lower === 'erdiagram') return 'ER diagram';
  if (lower === 'gitgraph') return 'GitGraph';
  if (lower.startsWith('c4')) return 'C4';
  if (lower === 'quadrantchart') return 'Quadrant chart';
  if (lower.startsWith('requirementdiagram')) return 'Requirement diagram';
  if (lower.startsWith('architecture')) return 'Architecture';
  if (lower === 'xychart-beta' || lower === 'xychart') return 'XY chart';
  if (lower.startsWith('radar')) return 'Radar chart';
  if (lower.startsWith('treemap')) return 'Treemap';
  if (lower.startsWith('venn')) return 'Venn diagram';
  // graph / flowchart / gantt 等：保留 Mermaid 源码写法（小写关键字）
  if (/^[a-z][a-z0-9-]*$/i.test(keyword) && keyword === keyword.toLowerCase()) {
    return keyword.replace(/-beta$/i, '');
  }
  return keyword;
}

/**
 * @param {string} code
 * @param {(key: string) => string} [t]
 * @returns {string}
 */
function mermaidDiagramTypeLabel(code, t) {
  const keyword = getMermaidFirstKeyword(code);
  if (!keyword) {
    const fallback = typeof t === 'function' ? t('diagram') : 'diagram';
    return fallback !== 'diagram' ? fallback : 'Diagram';
  }
  const key = mermaidKeywordI18nKey(keyword);
  const label = typeof t === 'function' ? t(key) : key;
  if (label && label !== key) return label;
  const formatted = formatMermaidKeywordFallback(keyword);
  return formatted || keyword;
}

/** @deprecated 使用 mermaidDiagramTypeLabel(code, t) */
function mermaidDiagramTypeI18nKey(typeId) {
  if (!typeId || typeId === 'unknown') return 'diagram';
  return (
    'mermaidType' +
    typeId.charAt(0).toUpperCase() +
    typeId.slice(1).replace(/-([a-z])/g, function (_m, c) {
      return c.toUpperCase();
    })
  );
}

module.exports = {
  getMermaidFirstKeyword: getMermaidFirstKeyword,
  detectMermaidDiagramType: detectMermaidDiagramType,
  mermaidKeywordI18nKey: mermaidKeywordI18nKey,
  mermaidDiagramTypeLabel: mermaidDiagramTypeLabel,
  mermaidDiagramTypeI18nKey: mermaidDiagramTypeI18nKey,
};

/**
 * 编辑面运行时配置：功能闸门 + 开发调试开关（发布时统一关闭）。
 *
 * 分阶段交付（代码已签收，开发默认 math）：
 *   text → image → mermaid → table → code → math → full
 * 覆盖：localStorage `mda-editor-widget-phase`
 * 兼容：旧键 `mda-editor-block-widgets=1` 视为 `full`
 *
 * 发布构建：`MDA_EDITOR_RELEASE=1 npm run build:editor`
 */
'use strict';

// esbuild `define` 注入；源码直跑时视为开发构建
var RELEASE =
  typeof __MDA_EDITOR_RELEASE__ !== 'undefined' ? __MDA_EDITOR_RELEASE__ === true : false;

/** @type {Record<string, { storageKey: string, devDefault: boolean, releaseValue: boolean }>} */
var FLAGS = {
  clickDebug: {
    storageKey: 'mda-editor-debug-click',
    devDefault: true,
    releaseValue: false,
  },
  logDecoBuild: {
    storageKey: 'mda-editor-log-deco',
    devDefault: false,
    releaseValue: false,
  },
  inlineFormatDebug: {
    storageKey: 'mda-editor-debug-inline-format',
    devDefault: false,
    releaseValue: false,
  },
};

/** @type {readonly string[]} */
var WIDGET_PHASES = ['text', 'image', 'mermaid', 'table', 'code', 'math', 'full'];

/** @type {Record<string, number>} */
var PHASE_RANK = {
  text: 0,
  image: 1,
  mermaid: 2,
  table: 3,
  code: 4,
  math: 5,
  full: 6,
};

/** @type {Record<string, string>} */
var WIDGET_MIN_PHASE = {
  image: 'image',
  mermaid: 'mermaid',
  table: 'table',
  code: 'code',
  'math-inline': 'math',
  'math-block': 'math',
  'quote-handle': 'text',
  'heading-handle': 'text',
  hr: 'math',
};

/**
 * @param {'clickDebug'|'logDecoBuild'|'inlineFormatDebug'} name
 */
function readFlag(name) {
  var spec = FLAGS[name];
  if (!spec) return false;
  if (RELEASE) return spec.releaseValue;
  try {
    var v = localStorage.getItem(spec.storageKey);
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
  } catch (_) {
    /* ignore */
  }
  return spec.devDefault;
}

/**
 * @returns {'text'|'image'|'mermaid'|'table'|'code'|'math'|'full'}
 */
function readWidgetPhase() {
  if (RELEASE) return 'text';
  try {
    var v = localStorage.getItem('mda-editor-widget-phase');
    if (v && PHASE_RANK[v] != null) return v;
    var legacy = localStorage.getItem('mda-editor-block-widgets');
    if (legacy === '1' || legacy === 'true') return 'full';
  } catch (_) {
    /* ignore */
  }
  return 'math';
}

/**
 * @param {'text'|'image'|'mermaid'|'table'|'code'|'full'} minPhase
 */
function widgetPhaseAtLeast(minPhase) {
  var cur = readWidgetPhase();
  return (PHASE_RANK[cur] || 0) >= (PHASE_RANK[minPhase] || 0);
}

/**
 * @param {'image'|'mermaid'|'table'|'code'|'hr'|'quote-handle'|'heading-handle'} kind
 */
function blockWidgetEnabled(kind) {
  var min = WIDGET_MIN_PHASE[kind];
  if (!min) return false;
  return widgetPhaseAtLeast(min);
}

/**
 * @param {'math-inline'|'math-block'|'quote-handle'|'heading-handle'} kind
 */
function mathWidgetEnabled(kind) {
  var min = WIDGET_MIN_PHASE[kind];
  if (!min) return false;
  return widgetPhaseAtLeast(min);
}

/** 任一块级 widget 已启用（非 text 阶段） */
function blockWidgetsEnabled() {
  return readWidgetPhase() !== 'text';
}

module.exports = {
  RELEASE: RELEASE,
  FLAGS: FLAGS,
  WIDGET_PHASES: WIDGET_PHASES,
  PHASE_RANK: PHASE_RANK,
  WIDGET_MIN_PHASE: WIDGET_MIN_PHASE,
  clickDebugEnabled: function () {
    return readFlag('clickDebug');
  },
  logDecoBuildEnabled: function () {
    return readFlag('logDecoBuild');
  },
  inlineFormatDebugEnabled: function () {
    return readFlag('inlineFormatDebug');
  },
  readWidgetPhase: readWidgetPhase,
  widgetPhaseAtLeast: widgetPhaseAtLeast,
  blockWidgetEnabled: blockWidgetEnabled,
  mathWidgetEnabled: mathWidgetEnabled,
  blockWidgetsEnabled: blockWidgetsEnabled,
};

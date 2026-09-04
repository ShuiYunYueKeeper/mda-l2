/**
 * 批注色条：对齐 2.0 decorateParagraphs（段落 startLine + mostSevere 级别色）。
 * 走 live-preview 的 line 装饰层（与标题行样式同路径，确保预览可见）。
 */
'use strict';

const { StateField, RangeSetBuilder, StateEffect } = require('@codemirror/state');
const { EditorView, Decoration, gutter, GutterMarker } = require('@codemirror/view');
const { findAnnotationHideRanges } = require('./model/anno-lines');

/** reload / refreshDecorations 后强制重算色条 */
const AnnoGutterRefresh = StateEffect.define();

function needsAnnoGutterRecompute(tr) {
  if (tr.docChanged) return true;
  for (let i = 0; i < tr.effects.length; i++) {
    if (tr.effects[i].is(AnnoGutterRefresh)) return true;
  }
  return false;
}

/**
 * @param {{ level?: string }[]} annos
 * @param {Record<string, number>} levelSeverity
 */
function mostSevereAnno(annos, levelSeverity) {
  if (!annos || !annos.length) return null;
  let best = annos[0];
  for (let i = 1; i < annos.length; i++) {
    const a = annos[i];
    if ((levelSeverity[a.level] || 0) > (levelSeverity[best.level] || 0)) best = a;
  }
  return best;
}

/**
 * @param {string} text
 * @param {{ paragraphs?: { startLine: number, annotations?: object[] }[] }} scan
 * @param {Record<string, string>} levelColors
 * @param {Record<string, number>} levelSeverity
 * @returns {{ line: number, color: string }[]}
 */
function buildAnnoGutterMarks(text, scan, levelColors, levelSeverity, filterAnnotation) {
  const paragraphs = (scan && scan.paragraphs) || [];
  const colors = levelColors || {};
  const severity = levelSeverity || {};
  const out = [];
  const seen = Object.create(null);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    let annos = p && p.annotations;
    if (!annos || !annos.length) continue;
    if (typeof filterAnnotation === 'function') {
      annos = annos.filter(filterAnnotation);
      if (!annos.length) continue;
    }
    const line = p.startLine;
    if (!(line >= 1) || seen[line]) continue;
    const top = mostSevereAnno(annos, severity);
    if (!top) continue;
    const color = colors[top.level] || colors.info || '#95a5a6';
    seen[line] = 1;
    out.push({ line: line, color: color });
  }
  return out;
}

/**
 * 1-based 行号 → 文档偏移（行首）。
 * @param {string} text
 * @returns {number[]}
 */
function lineStartOffsets(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * 追加批注色条到 line 装饰层（buildLayerDecos 调用）。
 * @param {string} text
 * @param {{ from: number, to: number, deco: import('@codemirror/view').Decoration }[]} lineDecos
 * @param {{
 *   parseAnnotations?: (text: string) => { paragraphs?: object[] },
 *   levelColors?: Record<string, string>,
 *   levelSeverity?: Record<string, number>,
 *   filterAnnotation?: (anno: object) => boolean,
 * }} liveOpts
 * @param {typeof Decoration} LineDeco
 */
function appendAnnoLineDecorations(text, lineDecos, liveOpts, LineDeco) {
  if (!liveOpts || typeof liveOpts.parseAnnotations !== 'function' || !LineDeco) return;
  try {
    const scan = liveOpts.parseAnnotations(text) || {};
    const marks = buildAnnoGutterMarks(
      text,
      scan,
      liveOpts.levelColors || {},
      liveOpts.levelSeverity || {},
      liveOpts.filterAnnotation
    );
    if (!marks.length) return;
    const starts = lineStartOffsets(text);
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      const idx = m.line - 1;
      if (idx < 0 || idx >= starts.length) continue;
      const from = starts[idx];
      lineDecos.push({
        from: from,
        to: from,
        deco: LineDeco.line({
          class: 'mda-anno-block-line',
          attributes: {
            style: '--mda-anno-bar: ' + m.color + ';',
          },
        }),
      });
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {{ line: number, color: string }[]} marks
 */
function marksToLineDecoSet(state, marks) {
  const sorted = marks.slice().sort(function (a, b) {
    return a.line - b.line;
  });
  const builder = new RangeSetBuilder();
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    if (m.line < 1 || m.line > state.doc.lines) continue;
    const line = state.doc.line(m.line);
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: 'mda-anno-block-line',
        attributes: {
          style: '--mda-anno-bar: ' + m.color + ';',
        },
      })
    );
  }
  return builder.finish();
}

/**
 * @param {{
 *   parseAnnotations?: (text: string) => { paragraphs?: object[] },
 *   levelColors?: Record<string, string>,
 *   levelSeverity?: Record<string, number>,
 * }} opts
 */
function createAnnoGutterField(opts) {
  opts = opts || {};
  if (typeof opts.parseAnnotations !== 'function') {
    return [];
  }
  const parseAnnotations = opts.parseAnnotations;
  const levelColors = opts.levelColors || {};
  const levelSeverity = opts.levelSeverity || {
    critical: 3,
    major: 2,
    minor: 1,
    info: 0,
  };

  function compute(state) {
    try {
      const text = state.doc.toString();
      const scan = parseAnnotations(text) || {};
      const marks = buildAnnoGutterMarks(text, scan, levelColors, levelSeverity);
      return marksToLineDecoSet(state, marks);
    } catch (_) {
      return Decoration.none;
    }
  }

  return StateField.define({
    create: function (state) {
      return compute(state);
    },
    update: function (deco, tr) {
      if (!needsAnnoGutterRecompute(tr)) return deco;
      return compute(tr.state);
    },
    provide: function (field) {
      return EditorView.decorations.from(field);
    },
  });
}

/** 强制重算色条（reload / refreshDecorations 后批注归属可能变化而 doc 未变） */
function refreshAnnoGutter(view) {
  if (!view || typeof view.dispatch !== 'function') return;
  view.dispatch({ effects: AnnoGutterRefresh.of(null) });
}

class MalformedAnnoGutterMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'mda-anno-malformed-gutter';
    el.textContent = '!';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

const malformedAnnoMarker = new MalformedAnnoGutterMarker();

/**
 * S25：坏批注行行号槽警示（预览模式无行号时仍显示窄槽）。
 */
function createAnnoMalformedGutter() {
  const field = StateField.define({
    create: function (state) {
      return buildMalformedGutterSet(state);
    },
    update: function (set, tr) {
      if (!needsAnnoGutterRecompute(tr)) return set;
      return buildMalformedGutterSet(tr.state);
    },
  });

  return [
    field,
    gutter({
      class: 'cm-mda-anno-malformed-gutter',
      markers: function (view) {
        return view.state.field(field);
      },
      initialSpacer: function () {
        return malformedAnnoMarker;
      },
    }),
  ];
}

/**
 * @param {import('@codemirror/state').EditorState} state
 */
function buildMalformedGutterSet(state) {
  const text = state.doc.toString();
  const ranges = findAnnotationHideRanges(text);
  const builder = new RangeSetBuilder();
  for (let i = 0; i < ranges.length; i++) {
    const ar = ranges[i];
    if (!ar.malformed) continue;
    const line = state.doc.lineAt(ar.from);
    builder.add(line.from, line.from, malformedAnnoMarker);
  }
  return builder.finish();
}

module.exports = {
  mostSevereAnno: mostSevereAnno,
  buildAnnoGutterMarks: buildAnnoGutterMarks,
  appendAnnoLineDecorations: appendAnnoLineDecorations,
  createAnnoGutterField: createAnnoGutterField,
  createAnnoMalformedGutter: createAnnoMalformedGutter,
  refreshAnnoGutter: refreshAnnoGutter,
};

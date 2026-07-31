/**
 * 批注色条：对齐 2.0 decorateParagraphs（段落 startLine + mostSevere 级别色）。
 * 经 StateField → EditorView.decorations.from 提供（行装饰，非 block widget）。
 */
'use strict';

const { StateField, RangeSetBuilder } = require('@codemirror/state');
const { EditorView, Decoration } = require('@codemirror/view');

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
function buildAnnoGutterMarks(text, scan, levelColors, levelSeverity) {
  const paragraphs = (scan && scan.paragraphs) || [];
  const colors = levelColors || {};
  const severity = levelSeverity || {};
  const out = [];
  const seen = Object.create(null);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const annos = p && p.annotations;
    if (!annos || !annos.length) continue;
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
          style: 'border-left: 4px solid ' + m.color + '; padding-left: 10px;',
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
      if (!tr.docChanged) return deco;
      return compute(tr.state);
    },
    provide: function (field) {
      return EditorView.decorations.from(field);
    },
  });
}

module.exports = {
  mostSevereAnno: mostSevereAnno,
  buildAnnoGutterMarks: buildAnnoGutterMarks,
  createAnnoGutterField: createAnnoGutterField,
};

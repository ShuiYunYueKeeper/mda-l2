/**
 * AI 会话在 CM6 里的状态：作用范围随编辑映射、改写范围被改动即判「过期」、范围底色。
 * 面板本身是 document.body 上的浮层（见 panel.js），不进 contentDOM——不参与 posAtCoords /
 * coordsAtPos，也就不会影响正文点击落点与拖选（AGENTS §8.13）。底色是纯 mark，不改排版。
 */
'use strict';

const { StateField, StateEffect, Annotation, Prec } = require('@codemirror/state');
const { EditorView, Decoration, keymap } = require('@codemirror/view');

/** 采纳 AI 结果的事务标记：自身的写入不能把会话判成过期 */
const aiApplyAnnotation = Annotation.define();

/**
 * @typedef {{ id: string, from: number, to: number, guard: boolean, highlight: boolean, stale: boolean }} AiSessionRange
 */

/** @type {import('@codemirror/state').StateEffectType<Omit<AiSessionRange,'stale'>>} */
const setAiSession = StateEffect.define();
/** @type {import('@codemirror/state').StateEffectType<string|null>} */
const clearAiSession = StateEffect.define();
/** @type {import('@codemirror/state').StateEffectType<boolean>} */
const setAiHighlight = StateEffect.define();

const scopeMark = Decoration.mark({ class: 'mda-ai-scope' });

const aiSessionField = StateField.define({
  create() {
    return /** @type {AiSessionRange|null} */ (null);
  },
  update(value, tr) {
    let v = value;
    if (v && tr.docChanged) {
      // guard：改写类在采纳前原文不得被他人改动，否则替换会覆盖用户的新编辑
      const touched = v.guard && !tr.annotation(aiApplyAnnotation) && tr.changes.touchesRange(v.from, v.to);
      const from = tr.changes.mapPos(v.from, -1);
      const to = Math.max(from, tr.changes.mapPos(v.to, 1));
      v = Object.assign({}, v, { from: from, to: to, stale: v.stale || !!touched });
    }
    for (const e of tr.effects) {
      if (e.is(setAiSession)) v = Object.assign({ stale: false }, e.value);
      else if (e.is(clearAiSession)) {
        if (v && (e.value == null || e.value === v.id)) v = null;
      } else if (e.is(setAiHighlight) && v) {
        v = Object.assign({}, v, { highlight: !!e.value });
      }
    }
    return v;
  },
  provide(field) {
    return EditorView.decorations.from(field, function (v) {
      if (!v || !v.highlight || v.from >= v.to) return Decoration.none;
      return Decoration.set([scopeMark.range(v.from, v.to)]);
    });
  },
});

/**
 * @param {{ ctrl: any }} holder  controller 在 view 创建后才有，setState 重建扩展时复用同一 holder
 */
function createAiExtension(holder) {
  return [
    aiSessionField,
    Prec.highest(keymap.of([
      {
        key: 'Escape',
        run: function () { return !!(holder.ctrl && holder.ctrl.onEscape()); },
      },
      {
        key: 'Alt-Enter',
        run: function () { return !!(holder.ctrl && holder.ctrl.onAccept()); },
      },
    ])),
    EditorView.updateListener.of(function (update) {
      if (holder.ctrl) holder.ctrl.onViewUpdate(update);
    }),
  ];
}

module.exports = {
  aiApplyAnnotation,
  setAiSession,
  clearAiSession,
  setAiHighlight,
  aiSessionField,
  createAiExtension,
};

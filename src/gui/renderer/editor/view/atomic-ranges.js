/**
 * M8-B8b：将 replace 装饰区间注册为 atomic，使光标/点击跳过隐藏语法标记。
 */
'use strict';

const { EditorView, Decoration } = require('@codemirror/view');

/**
 * ViewPlugin → atomicRanges（hide-mark 层等）。
 * @param {import('@codemirror/view').ViewPlugin<unknown>} plugin
 */
function atomicRangesFromPlugin(plugin) {
  return EditorView.atomicRanges.of(function (view) {
    const inst = view.plugin(plugin);
    return inst && inst.decorations ? inst.decorations : Decoration.none;
  });
}

/**
 * StateField block 装饰 → atomicRanges（整块，含批注 hide-line）。
 * @param {import('@codemirror/state').StateField<unknown>} blockDecoField
 * @param {(view: import('@codemirror/view').EditorView) => boolean} [when]
 */
function atomicRangesFromBlockField(blockDecoField, when) {
  return EditorView.atomicRanges.of(function (view) {
    if (typeof when === 'function' && !when(view)) return Decoration.none;
    const val = view.state.field(blockDecoField);
    return val && val.deco ? val.deco : Decoration.none;
  });
}

/**
 * 块 widget 开启时仍对批注 hide-line 注册 atomic（不含 table/code/image 块）。
 * @param {import('@codemirror/state').StateField<unknown>} blockDecoField
 */
function atomicRangesFromHideLines(blockDecoField) {
  return EditorView.atomicRanges.of(function (view) {
    const val = view.state.field(blockDecoField);
    return val && val.hideLineDeco ? val.hideLineDeco : Decoration.none;
  });
}

module.exports = {
  atomicRangesFromPlugin: atomicRangesFromPlugin,
  atomicRangesFromBlockField: atomicRangesFromBlockField,
  atomicRangesFromHideLines: atomicRangesFromHideLines,
};

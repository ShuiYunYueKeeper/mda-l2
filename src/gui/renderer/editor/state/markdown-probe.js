/**
 * 一次性 Markdown 解析探针：把一段字符串建成临时 EditorState 来问「解析器怎么看它」。
 *
 * 存在的理由是「定界符成对」并不等于「渲染符合预期」。CommonMark 的 flanking 规则要求
 * 闭定界符左侧不能是空白、且（右侧非空白时）左侧不能是标点，于是拆分取消产出的
 * `**、**测试**粗体**` 会被重新配对成**外层**强调 —— 每对都配对，渲染出来却是整串加粗，
 * 用户按了「取消」反而全变粗。这类串只有真跑一遍解析器才能识破。
 *
 * 拆到独立模块是为了断依赖环：inline-string-ops 在模块加载期就 require pending-inline-format，
 * 所以后者不能反向静态依赖它。
 */
'use strict';

const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { GFM } = require('@lezer/markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { collectMarkRegions } = require('./inline-mark-context');

/**
 * @param {string} text
 * @returns {import('@codemirror/state').EditorState}
 */
function textState(text) {
  const src = String(text || '');
  const state = EditorState.create({
    doc: src,
    extensions: [markdown({ extensions: GFM })],
  });
  ensureSyntaxTree(state, src.length);
  return state;
}

/**
 * `[from, to)` 这段文字在解析器眼里是否**恰好**带着 `expected` 里为真的那些标记。
 * 只校验 `keys` 列出的标记，避免被无关样式干扰。
 *
 * 判据是「有没有一个样式段的 content 完整盖住这段文字」，而不是逐位置问 flags：
 * 后者在端点处会被邻接判定带偏，单字符残段（`**、**` 里的「、」）更是一个内部位置都没有，
 * 检查会空转通过。
 *
 * @param {string} text 整行（或整格）文本
 * @param {number} from
 * @param {number} to
 * @param {Record<string, boolean>} expected
 * @param {string[]} keys
 */
function textRangeHasMarks(text, from, to, expected, keys) {
  const src = String(text || '');
  const a = Math.max(0, Math.min(from, src.length));
  const b = Math.max(a, Math.min(to, src.length));
  if (b <= a) return true;
  const state = textState(src);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const regions = collectMarkRegions(state, k);
    let covered = false;
    for (let j = 0; j < regions.length; j++) {
      const c = regions[j].content;
      if (c.from <= a && c.to >= b) {
        covered = true;
        break;
      }
    }
    if (covered !== !!expected[k]) return false;
  }
  return true;
}

module.exports = {
  textState: textState,
  textRangeHasMarks: textRangeHasMarks,
};

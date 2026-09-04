/**
 * 按 docs/编辑栏交互说明.md 判断格式命令是否可用。
 * tip 里的「空格」指 Markdown 语法中的空格字符（如 `1. ` / `- `），不是空白行。
 *
 * 加粗：标题 / 图片 / 公式 / 代码块 / 流程图 → 置灰
 * 斜体、下划线、删除线：图片 / 公式 / 代码块 / 流程图 → 置灰（标题可用）
 * 行内代码：代码块内置灰；图片/公式/流程图选中时置灰
 * 列表：代码块 / 图片 / 公式 / 流程图 / 分割线 → 置灰
 * 选区混合列表类型：不高亮/半激活，按钮仍可用（点击后统一转换）
 */
'use strict';

const { syntaxTree } = require('@codemirror/language');
const { blockFormatOfLine, paragraphSelectOfLine } = require('./block-format');
const { buildCodeFenceMask } = require('../model/parse-math');
const { detectFrontMatter } = require('../model/readonly-blocks');
const { getSelectedBlockOfKind } = require('../widgets/block-selection');
const { getSelectedImageBlock } = require('../widgets/image-selection');
const { getSelectedMermaidBlock } = require('../widgets/mermaid-selection');
const { getSelectedInlineMath } = require('../widgets/inline-math-selection');

/** @type {Record<string, 1>} */
const HEADING_NODES = {
  ATXHeading1: 1,
  ATXHeading2: 1,
  ATXHeading3: 1,
  ATXHeading4: 1,
  ATXHeading5: 1,
  ATXHeading6: 1,
  SetextHeading1: 1,
  SetextHeading2: 1,
};

/**
 * @param {import('@codemirror/state').EditorState} state
 */
function selectionTouchesFenceLocal(state) {
  const lines = [];
  for (let i = 1; i <= state.doc.lines; i++) lines.push(state.doc.line(i).text);
  const mask = buildCodeFenceMask(lines);
  const sel = state.selection.main;
  const fromLine = state.doc.lineAt(sel.from).number - 1;
  const toLine = state.doc.lineAt(Math.max(sel.from, sel.to)).number - 1;
  for (let i = fromLine; i <= toLine; i++) {
    if (mask[i]) return true;
  }
  return false;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 */
function selectionTouchesReadonlyLocal(state) {
  const text = state.doc.toString();
  const fm = detectFrontMatter(text);
  if (!fm) return false;
  const sel = state.selection.main;
  return sel.from < fm.to && sel.to > fm.from;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {Record<string, 1>} names
 */
function posInNamed(state, pos, names) {
  let tree;
  try {
    tree = syntaxTree(state);
  } catch (_) {
    return false;
  }
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (names[node.name]) return true;
    node = node.parent;
  }
  return false;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 * @param {Record<string, 1>} names
 */
function rangeTouchesNamed(state, from, to, names) {
  if (from === to) return posInNamed(state, from, names);
  let tree;
  try {
    tree = syntaxTree(state);
  } catch (_) {
    return false;
  }
  let hit = false;
  tree.iterate({
    from: from,
    to: to,
    enter: function (node) {
      if (names[node.name]) {
        hit = true;
        return false;
      }
    },
  });
  if (hit) return true;
  return posInNamed(state, from, names) || posInNamed(state, Math.max(from, to - 1), names);
}

/**
 * 光标/选区是否在标题段内。行末折叠光标时 syntaxTree 可能落不到 Heading 节点，需结合行级判断。
 * @param {import('@codemirror/state').EditorState} state
 */
function selectionTouchesHeading(state) {
  const sel = state.selection.main;
  if (rangeTouchesNamed(state, sel.from, sel.to, HEADING_NODES)) return true;
  const fromN = state.doc.lineAt(sel.from).number;
  const toN = state.doc.lineAt(sel.to).number;
  for (let n = fromN; n <= toN; n++) {
    const text = state.doc.line(n).text;
    if (!String(text).trim()) continue;
    // 列表项内标题（`- ## 标题`）也算标题行
    const fmt = paragraphSelectOfLine(text);
    if (fmt.charAt(0) === 'h' && fmt.length === 2) return true;
  }
  return false;
}

/**
 * 选区是否跨多种段落格式（段落格式类通用：混合则置灰）。
 * @param {import('@codemirror/state').EditorState} state
 */
function selectionHasMixedParagraphFormats(state) {
  const sel = state.selection.main;
  const fromN = state.doc.lineAt(sel.from).number;
  const toN = state.doc.lineAt(sel.to).number;
  /** @type {string | null} */
  let first = null;
  for (let n = fromN; n <= toN; n++) {
    const text = state.doc.line(n).text;
    if (!String(text).trim()) continue;
    const fmt = blockFormatOfLine(text);
    if (first == null) first = fmt;
    else if (fmt !== first) return true;
  }
  return false;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @returns {{
 *   bold: boolean,
 *   italic: boolean,
 *   underline: boolean,
 *   strike: boolean,
 *   code: boolean,
 *   list: boolean,
 *   taskList: boolean,
 *   inHeading: boolean,
 *   mediaOrFence: boolean,
 * }}
 */
function deriveFormatAvailability(state) {
  const denied = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
    list: false,
    taskList: false,
    inHeading: false,
    mediaOrFence: true,
  };
  if (!state) return denied;
  if (selectionTouchesReadonlyLocal(state)) return denied;

  const inFence = selectionTouchesFenceLocal(state);
  const imgSel = !!getSelectedImageBlock();
  const merSel = !!getSelectedMermaidBlock();
  const mathSel = !!getSelectedBlockOfKind('math');
  const codeBlockSel = !!getSelectedBlockOfKind('code');
  const hrSel = !!getSelectedBlockOfKind('hr');
  let inlineMathSel = false;
  try {
    inlineMathSel = !!getSelectedInlineMath();
  } catch (_) {
    inlineMathSel = false;
  }
  const mediaOrFence =
    inFence || imgSel || merSel || mathSel || codeBlockSel || hrSel || inlineMathSel;

  const sel = state.selection.main;
  const inHeading = selectionTouchesHeading(state);

  // 媒体/围栏/公式/代码块/流程图/分割线：字符与列表一律不可
  if (mediaOrFence) {
    return {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
      list: false,
      taskList: false,
      inHeading: inHeading,
      mediaOrFence: true,
    };
  }

  // 加粗：标题置灰；斜体/下划线/删除线：标题可用
  const bold = !inHeading;
  const markOk = true;
  const code = true;
  // 无序/有序列表：混合类型显示半激活，点击后统一转换，不因混合而置灰。
  // 列表项内可嵌 ATX 标题（`- ## 标题`），故标题行也可用。
  const list = true;
  // 任务列表：GFM 要求任务标记后首块为段落，`- [ ] ## 标题` 的 # 会退化成字面文本，
  // 无法既是任务项又是标题，故标题行置灰而非静默丢标题。
  const taskList = !inHeading;

  return {
    bold: bold,
    italic: markOk,
    underline: markOk,
    strike: markOk,
    code: code,
    list: list,
    taskList: taskList,
    inHeading: inHeading,
    mediaOrFence: false,
  };
}

/**
 * @param {string} cmd
 * @param {ReturnType<typeof deriveFormatAvailability>} avail
 */
function isFormatCmdAvailable(cmd, avail) {
  if (!avail) return false;
  if (cmd === 'bold') return !!avail.bold;
  if (cmd === 'italic') return !!avail.italic;
  if (cmd === 'underline') return !!avail.underline;
  if (cmd === 'strike') return !!avail.strike;
  if (cmd === 'code') return !!avail.code;
  if (cmd === 'task') return !!avail.list && !!avail.taskList;
  if (cmd === 'ul' || cmd === 'ol') return !!avail.list;
  return true;
}

module.exports = {
  deriveFormatAvailability: deriveFormatAvailability,
  isFormatCmdAvailable: isFormatCmdAvailable,
  rangeTouchesNamed: rangeTouchesNamed,
  selectionTouchesHeading: selectionTouchesHeading,
  selectionHasMixedParagraphFormats: selectionHasMixedParagraphFormats,
};

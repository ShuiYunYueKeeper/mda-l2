/**
 * 无选区时的「后续输入」字符格式（docs/编辑栏交互说明.md）。
 * 只改 UI/输入态，不改已有文本，不进入撤销栈。
 */
'use strict';

const { StateField, StateEffect, Transaction } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');
const { getInlineFlagsAt } = require('./block-format');
const {
  getInlineFlagsAtPos,
  planMarkInsert,
  planPendingMarkToggle,
  resolveMarkRegion,
  classifyMarkZone,
  canPassThroughPendingInput,
  needsPendingInputTransform,
  findMarkRegionAhead,
  findMarkRegionBehind,
} = require('./inline-mark-context');
const { dispatchTypedInsertWithCleanup } = require('./inline-delimiter-ops');
const { textRangeHasMarks } = require('./markdown-probe');
const inlineDbg = require('./inline-format-debug');

/** @typedef {{ bold: boolean, italic: boolean, underline: boolean, strike: boolean, code: boolean }} InlineFlags */

const MARK_KEYS = ['bold', 'italic', 'underline', 'strike', 'code'];

const DELIM = {
  code: ['`', '`'],
  underline: ['~', '~'],
  strike: ['~~', '~~'],
  italic: ['*', '*'],
  bold: ['**', '**'],
};

/** 由内到外，先关内层再关外层 */
const WRAP_ORDER = ['code', 'underline', 'strike', 'italic', 'bold'];

/**
 * @returns {InlineFlags}
 */
function emptyMarks() {
  return {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
  };
}

/**
 * @returns {{ armed: boolean, marks: InlineFlags }}
 */
function emptyPending() {
  return { armed: false, marks: emptyMarks(), explicit: false };
}

/**
 * @param {InlineFlags} flags
 */
function anyMarkOn(flags) {
  if (!flags) return false;
  for (let i = 0; i < MARK_KEYS.length; i++) {
    if (flags[MARK_KEYS[i]]) return true;
  }
  return false;
}

/**
 * @param {InlineFlags} a
 * @param {InlineFlags} b
 */
function sameMarkContext(a, b) {
  for (let i = 0; i < MARK_KEYS.length; i++) {
    const k = MARK_KEYS[i];
    if (!!a[k] !== !!b[k]) return false;
  }
  return true;
}

const pendingFormatEffect = StateEffect.define();

const pendingFormatField = StateField.define({
  create: function () {
    return emptyPending();
  },
  update: function (value, tr) {
    for (let i = 0; i < tr.effects.length; i++) {
      const e = tr.effects[i];
      if (e.is(pendingFormatEffect)) {
        inlineDbg.log('pending.effect', {
          pending: e.value,
          pos: tr.state.selection.main.head,
          state: tr.state,
        });
        return e.value;
      }
    }
    const start = tr.startState.selection.main;
    const cur = tr.state.selection.main;
    const selMoved =
      !tr.docChanged &&
      (start.from !== cur.from || start.to !== cur.to || start.anchor !== cur.anchor || start.head !== cur.head);
    if (selMoved) {
      if (cur.from === cur.to) {
        const flags = getInlineFlagsAtPos(tr.state, cur.head);
        if (anyMarkOn(flags)) {
          const prevFlags = getInlineFlagsAtPos(tr.startState, start.head);
          // 只有「用户在工具栏显式切过」的覆盖态才跨光标移动保留。
          // 由 selMove / 输入自动武装的 marks 若在这里继续沿用，会跨操作串味：
          // 例如上一处编辑在行内代码里武装了 code，撤销不改选区（不清 pending），
          // 之后点进下划线段落时 prevFlags 恰好与 flags 相同 → code 被带过来，
          // 输入就会插出 `测试` 这类完全不相干的定界符（实测复现）。
          if (value.armed && value.explicit && sameMarkContext(prevFlags, flags)) {
            const next = Object.assign(emptyMarks(), flags);
            for (let i = 0; i < MARK_KEYS.length; i++) {
              const k = MARK_KEYS[i];
              if (!!value.marks[k] !== !!flags[k]) next[k] = value.marks[k];
            }
            inlineDbg.log('pending.selMove.keepOverride', {
              pos: cur.head,
              state: tr.state,
              current: flags,
              pending: { armed: true, marks: next },
            });
            return { armed: true, marks: next, explicit: true };
          }
          inlineDbg.log('pending.selMove.arm', {
            pos: cur.head,
            state: tr.state,
            current: flags,
            pending: { armed: true, marks: flags },
          });
          return { armed: true, marks: flags, explicit: false };
        }
      }
      inlineDbg.log('pending.selMove.clear', {
        pos: cur.head,
        state: tr.state,
        hadArmed: value.armed,
      });
      return emptyPending();
    }
    return value;
  },
});

/** @type {{ armed: boolean, marks: InlineFlags, el: HTMLElement } | null} */
let widgetPending = null;
/** 单元格组字期间的干净取材快照（compositionstart 拍下，compositionend 使用） */
let widgetComposition = null;

function clearWidgetPending() {
  widgetPending = null;
}

/** @type {((...args: any[]) => void) | null} */
let widgetPendingListener = null;

/**
 * 待输入格式由按键武装时不改选区，工具栏收不到任何刷新信号（CM6 事务与 selectionchange 都不动），
 * 按钮就不会亮。这里给它一条通知回路。
 * @param {((...args: any[]) => void) | null} fn
 */
function setWidgetPendingListener(fn) {
  widgetPendingListener = typeof fn === 'function' ? fn : null;
}

function notifyWidgetPending() {
  if (!widgetPendingListener) return;
  try {
    widgetPendingListener();
  } catch (_) {
    /* ignore */
  }
}

/**
 * @returns {{ armed: boolean, marks: InlineFlags, el: HTMLElement } | null}
 */
function getWidgetPending() {
  if (!widgetPending || !widgetPending.armed) return null;
  if (!widgetPending.el || !widgetPending.el.isConnected) {
    widgetPending = null;
    return null;
  }
  return widgetPending;
}

/**
 * @param {HTMLElement} el
 * @param {string} mark
 * @param {InlineFlags} base 光标处已有的标记；缺省会让「在斜体里按 Ctrl+B」把斜体一并关掉
 * @param {number} [pos] 武装时的可见偏移，供 syncWidgetPendingForCaret 判断光标是否移开
 */
function toggleWidgetPendingMark(el, mark, base, pos) {
  const baseFlags = Object.assign(emptyMarks(), base || emptyMarks());
  const cur =
    widgetPending && widgetPending.armed && widgetPending.el === el
      ? widgetPending.marks
      : baseFlags;
  const next = Object.assign(emptyMarks(), cur);
  next[mark] = !next[mark];
  widgetPending = {
    armed: true,
    marks: next,
    el: el,
    base: widgetPending && widgetPending.armed && widgetPending.el === el && widgetPending.base
      ? widgetPending.base
      : baseFlags,
    pos: typeof pos === 'number' ? pos : null,
  };
  notifyWidgetPending();
  return next;
}

/**
 * 光标在格内移动后校正待输入格式，语义对齐正文 `pendingFormatField` 的 selMove 分支：
 * 标记上下文变了就丢弃覆盖态，否则沿用。不做这一步，武装过的格式会跨落点串味
 * （在行内代码里武装了 code，移到普通文字处仍按 code 输入）。
 *
 * @param {HTMLElement} el
 * @param {number} pos
 * @param {InlineFlags} flags 当前光标处的标记
 */
function syncWidgetPendingForCaret(el, pos, flags) {
  const wp = getWidgetPending();
  if (!wp) return null;
  if (wp.el !== el) {
    widgetPending = null;
    return null;
  }
  if (wp.pos == null || wp.pos === pos) return wp;
  if (!sameMarkContext(wp.base || emptyMarks(), flags || emptyMarks())) {
    widgetPending = null;
    return null;
  }
  wp.pos = pos;
  return wp;
}

/**
 * @param {HTMLElement} el
 * @param {InlineFlags} [base] 光标处已有标记，供 syncWidgetPendingForCaret 判断上下文
 * @param {number} [pos]
 */
function clearWidgetPendingMarks(el, base, pos) {
  widgetPending = {
    armed: true,
    marks: emptyMarks(),
    el: el || (widgetPending && widgetPending.el),
    base: Object.assign(emptyMarks(), base || emptyMarks()),
    pos: typeof pos === 'number' ? pos : null,
  };
  if (!widgetPending.el) widgetPending = null;
  notifyWidgetPending();
}

/**
 * @param {import('@codemirror/state').EditorState} state
 */
function getPending(state) {
  try {
    return state.field(pendingFormatField);
  } catch (_) {
    return emptyPending();
  }
}

/**
 * 工具栏展示用：无选区且已武装则用待输入格式。
 * @param {import('@codemirror/state').EditorState} state
 * @param {{ bold: {on:boolean,mixed:boolean}, italic: {on:boolean,mixed:boolean}, underline: {on:boolean,mixed:boolean}, strike: {on:boolean,mixed:boolean}, code: {on:boolean,mixed:boolean} }} base
 */
function overlayPendingInlineState(state, base) {
  const pending = getPending(state);
  const sel = state.selection.main;
  if (!pending.armed || sel.from !== sel.to) return base;
  function flag(on) {
    return { on: !!on, mixed: false };
  }
  return {
    bold: flag(pending.marks.bold),
    italic: flag(pending.marks.italic),
    underline: flag(pending.marks.underline),
    strike: flag(pending.marks.strike),
    code: flag(pending.marks.code),
  };
}

/**
 * 无选区时清除格式是否可用：有待输入格式，或光标处已有字符格式。
 * @param {import('@codemirror/state').EditorState} state
 */
function hasPendingInputFormat(state) {
  const sel = state.selection.main;
  if (sel.from !== sel.to) return true;
  const wp = getWidgetPending();
  if (wp && wp.armed) return anyMarkOn(wp.marks);
  const pending = getPending(state);
  if (pending.armed) return anyMarkOn(pending.marks);
  return anyMarkOn(getInlineFlagsAt(state, sel.head));
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} mark
 */
function togglePendingInlineMark(view, mark) {
  if (!view || !MARK_KEYS.includes(mark)) return false;
  const state = view.state;
  const head = state.selection.main.head;
  const atCursor = getInlineFlagsAt(state, head);
  const pending = getPending(state);
  const planned = planPendingMarkToggle(state, head, mark, pending);
  const next = Object.assign(emptyMarks(), planned.marks);
  inlineDbg.log('pending.toggle', {
    pos: head,
    state: state,
    mark: mark,
    atCursor: atCursor,
    before: pending,
    after: { armed: true, marks: next },
    cursor: planned.cursor,
  });
  view.dispatch({
    effects: pendingFormatEffect.of({ armed: true, marks: next, explicit: true }),
    selection: { anchor: planned.cursor, head: planned.cursor },
    annotations: Transaction.addToHistory.of(false),
  });
  try {
    view.focus();
  } catch (_) {
    /* ignore */
  }
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function clearPendingInlineFormat(view) {
  if (!view) return false;
  view.dispatch({
    effects: pendingFormatEffect.of({ armed: true, marks: emptyMarks(), explicit: true }),
  });
  try {
    view.focus();
  } catch (_) {
    /* ignore */
  }
  return true;
}

/**
 * @param {string} text
 * @param {InlineFlags} adds
 */
function wrapWithAdds(text, adds) {
  let s = text;
  for (let i = 0; i < WRAP_ORDER.length; i++) {
    const k = WRAP_ORDER[i];
    if (adds[k]) {
      const d = DELIM[k];
      s = d[0] + s + d[1];
    }
  }
  return s;
}

/**
 * @param {InlineFlags} adds
 */
function addedOpenLen(adds) {
  let n = 0;
  for (let i = 0; i < WRAP_ORDER.length; i++) {
    const k = WRAP_ORDER[i];
    if (adds[k]) n += DELIM[k][0].length;
  }
  return n;
}

/** @type {boolean} IME 组字期间禁止 inputHandler 逐键改写，避免拼音落盘 */
let pendingImeActive = false;

/** @type {number | null} compositionstart 时的锚点，用于整段替换 IME 污染区间 */
let imeComposeAnchor = null;

/** @type {string | null} compositionend 已处理后，跳过下一次同名 inputHandler */
let skipNextInputText = null;

/** IME 组字区间最大长度（防止锚点与 head 漂移跨段误删） */
const MAX_IME_COMPOSE_LEN = 48;

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} head
 * @param {string} data
 * @returns {{ start: number, end: number } | null}
 */
function findCommittedText(state, head, data) {
  if (!data) return null;
  if (head >= data.length && state.doc.sliceString(head - data.length, head) === data) {
    return { start: head - data.length, end: head };
  }
  return null;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} head
 * @param {string} data
 * @param {number | null | undefined} composeAnchor
 * @returns {{ deleteFrom: number, deleteTo: number, commitStart: number } | null}
 */
function resolveImeDeleteRange(state, head, data, composeAnchor) {
  const committed = findCommittedText(state, head, data);
  if (!committed) return null;

  const commitStart = committed.start;
  let deleteFrom = commitStart;

  if (typeof composeAnchor === 'number' && composeAnchor < commitStart) {
    const between = state.doc.sliceString(composeAnchor, commitStart);
    if (/^[a-z'`:]+$/i.test(between)) deleteFrom = composeAnchor;
  }

  const tail = state.doc.sliceString(commitStart, head);
  if (tail.length > data.length && tail.endsWith(data)) {
    const prefix = tail.slice(0, tail.length - data.length);
    if (/^[a-z'`:]+$/i.test(prefix)) deleteFrom = commitStart;
  }

  const deleteTo = head;
  if (deleteTo < deleteFrom || deleteTo - deleteFrom > MAX_IME_COMPOSE_LEN) return null;
  return { deleteFrom: deleteFrom, deleteTo: deleteTo, commitStart: commitStart };
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} head
 * @param {string} data
 * @param {InlineFlags} intended
 * @param {number} [composeAnchor] compositionstart 锚点（仅当与提交点之间全是拼音时才扩删）
 * @returns {{ from: number, to: number, insert: string, cursor: number } | null}
 */
function planCompositionEndReplace(state, head, data, intended, composeAnchor) {
  if (!data) return null;

  const anchor =
    typeof composeAnchor === 'number'
      ? composeAnchor
      : imeComposeAnchor != null
        ? imeComposeAnchor
        : null;
  const range = resolveImeDeleteRange(state, head, data, anchor);
  if (!range) {
    inlineDbg.log('compose.plan.reject', {
      pos: head,
      reason: 'noCommittedTextOrRange',
      anchor: anchor,
    });
    return null;
  }

  const deleteFrom = range.deleteFrom;
  const deleteTo = range.deleteTo;
  const composed = state.doc.sliceString(deleteFrom, deleteTo);

  const plan = planTypedReplace(state, deleteFrom, deleteTo, data, intended);
  if (!plan) return null;

  inlineDbg.log('compose.plan', {
    pos: head,
    state: state,
    data: data,
    intended: intended,
    composeAnchor: anchor,
    commitStart: range.commitStart,
    deleteFrom: deleteFrom,
    deleteTo: deleteTo,
    composed: composed,
    plan: plan,
  });

  // 组字结果已经落在正确位置时不再二次改写，避免多余的历史项与 IME 抖动
  if (state.doc.sliceString(plan.from, plan.to) === plan.insert) return null;

  inlineDbg.log('compose.apply.transform', { plan: plan });
  return plan;
}

/**
 * 在「摘掉 [from, to) 之后的干净文档」上规划插入，再把结果换算回当前文档坐标。
 *
 * 键盘逐字输入时 `from === to`，文档本就干净；但**替换**路径不是：输入法上屏时 CM6 传来的
 * 是「用汉字替换掉已落盘的拼音」，那段拼音恰好夹在光标与定界符之间。若直接在当前文档上取材，
 * `resolveMarkRegion` 找不到紧邻的样式段，就会把「延续已有样式」误判成「新包一层」，
 * 插出 `**测试****加粗**` 这类重复定界符（选区替换同理）。
 *
 * 换算时须把落点与待删区之间的原文一并带上，否则夹在中间的定界符会被吞掉。
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 * @param {string} text
 * @param {InlineFlags} intended
 * @returns {{ from: number, to: number, insert: string, cursor: number } | null}
 */
function planTypedReplace(state, from, to, text, intended) {
  if (to <= from) return buildPendingTypedInsert(state, from, from, text, intended);

  const cleanState = state.update({ changes: { from: from, to: to, insert: '' } }).state;
  const spec = buildPendingTypedInsert(cleanState, from, from, text, intended);
  if (!spec) return null;

  // 干净文档坐标 x ↦ 当前文档坐标：待删区之后的位置整体右移 (to - from)
  const lo = Math.min(spec.from, from);
  const hi = Math.max(spec.to, from);
  return {
    from: lo,
    to: hi > from ? hi + (to - from) : to,
    insert:
      cleanState.doc.sliceString(lo, spec.from) +
      spec.insert +
      cleanState.doc.sliceString(spec.to, hi),
    cursor: spec.cursor,
  };
}

/**
 * 待输入格式的判定基准文档：替换路径须先摘掉待删区间，理由同 planTypedReplace。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 */
function typedReplaceBasis(state, from, to) {
  if (to <= from) return state;
  return state.update({ changes: { from: from, to: to, insert: '' } }).state;
}
/**
 * 拆分取消（「关闭 + 重开」）产出的串未必真按预期渲染，这里校验并在必要时解包残段。
 *
 * CommonMark 的 flanking 规则要求闭定界符左邻非空白、且（右邻非空白时）左邻非标点。
 * 于是 `**、加粗**` 在「、」后取消加粗会得到 `**、**测试**粗**`：每对都配对，解析器却把它
 * 重新配对成**外层**强调 —— 用户按了取消，整串反而全是粗的。`**(**`、`** **`、`**“**`
 * 同理，bold/italic/strike 都会中招（自定义的 `~` 下划线不受影响）。
 *
 * 这种残段在 CommonMark 里根本无法独立成立，唯一的出路是把它解包成普通文字：残段那个标点
 * 失去样式，但文字顺序与「取消」意图都保住了（`、测试**加粗**`）。按「原方案 → 解左 →
 * 解右 → 两边都解」的顺序取第一个真能渲染成预期的方案。
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {{ from: number, to: number, insert: string, cursor: number }} spec
 * @param {{ key: string, region: any }[]} splits
 * @param {InlineFlags} marks
 * @param {{ prefix: string, suffix: string, wrapped: string, textLen: number, textOffset: number }} parts
 * @returns {{ from: number, to: number, insert: string, cursor: number } | null}
 */
function repairUnrenderableSplit(state, spec, splits, marks, parts) {
  // 多个标记同时拆分极罕见，且解包组合会爆炸；保持原行为
  if (splits.length !== 1 || !splits[0].region) return null;
  const key = splits[0].key;
  const region = splits[0].region;
  const line = state.doc.lineAt(spec.from);
  const lineText = line.text;
  const at = spec.from;
  const leftText = state.doc.sliceString(region.leading.to, at);
  const rightText = state.doc.sliceString(at, region.trailing.from);

  /** @type {InlineFlags} */
  const on = Object.assign(emptyMarks(), marks);
  on[key] = true;

  /** @param {boolean} unwrapLeft @param {boolean} unwrapRight */
  function evaluate(unwrapLeft, unwrapRight) {
    // 解包 = 把残段的定界符从改动区间里吃掉，残段内容原样吐回（于是它变成普通文字）
    const head = unwrapLeft ? leftText : parts.prefix;
    const tail = unwrapRight ? rightText : parts.suffix;
    const cFrom = unwrapLeft ? region.leading.from : at;
    const cTo = unwrapRight ? region.trailing.to : at;
    const insert = head + parts.wrapped + tail;
    const relFrom = cFrom - line.from;
    const nextLine =
      lineText.slice(0, relFrom) + insert + lineText.slice(cTo - line.from);

    const textFrom = relFrom + head.length + parts.textOffset;
    let ok = textRangeHasMarks(nextLine, textFrom, textFrom + parts.textLen, marks, [key]);
    // 保留下来的残段必须仍带着该样式，否则这个方案只是把问题挪了个位置
    if (ok && !unwrapLeft && leftText) {
      const lf = region.leading.to - line.from;
      ok = textRangeHasMarks(nextLine, lf, relFrom, on, [key]);
    }
    if (ok && !unwrapRight && rightText) {
      const rf = relFrom + insert.length;
      ok = textRangeHasMarks(nextLine, rf, rf + rightText.length, on, [key]);
    }
    if (!ok) return null;
    return {
      from: cFrom,
      to: cTo,
      insert: insert,
      cursor: cFrom + head.length + parts.textOffset + parts.textLen,
    };
  }

  const variants = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ];
  for (let i = 0; i < variants.length; i++) {
    const fixed = evaluate(variants[i][0], variants[i][1]);
    if (!fixed) continue;
    return i === 0 ? null : fixed;
  }
  return null;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 * @param {string} text
 * @param {InlineFlags} intended
 * @returns {{ from: number, to: number, insert: string, cursor: number } | null}
 */
function buildPendingTypedInsert(state, from, to, text, intended) {
  if (text == null || text === '') return null;
  const current = getInlineFlagsAt(state, from);
  const marks = intended || emptyMarks();
  /** @type {InlineFlags} */
  const adds = emptyMarks();
  let insertAt = from;
  let prefix = '';
  let suffix = '';
  /** @type {{ key: string, region: any }[]} 走了「关闭+重开」拆分路径的标记 */
  const splits = [];
  for (let i = 0; i < WRAP_ORDER.length; i++) {
    const k = WRAP_ORDER[i];
    const region = resolveMarkRegion(state, insertAt, k);
    const zone = classifyMarkZone(region, insertAt);

    if (marks[k] && region && (zone === 'head-out' || zone === 'before')) {
      // 头外待输入延续：插入到内容首，不另包定界符（避免 ****）
      insertAt = region.content.from;
      continue;
    }
    if (marks[k] && region && zone === 'open') {
      insertAt = region.content.from;
      continue;
    }
    if (marks[k] && region && zone === 'tail-out') {
      // 尾外待输入延续：插入到内容末，不另包定界符（避免 ~~~~）
      insertAt = region.content.to;
      continue;
    }
    if (marks[k] && !region) {
      const ahead = findMarkRegionAhead(state, insertAt, k);
      if (ahead) {
        insertAt = ahead.content.from;
        continue;
      }
      const behind = findMarkRegionBehind(state, insertAt, k);
      if (behind) {
        insertAt = behind.content.to;
        continue;
      }
    }
    if (marks[k] && !current[k]) adds[k] = true;
    if (!marks[k] && current[k]) {
      const plan = planMarkInsert(state, insertAt, k, false);
      insertAt = plan.insertAt;
      if (plan.split) {
        const d = DELIM[k];
        prefix += d[1];
        suffix = d[0] + suffix;
        splits.push({ key: k, region: resolveMarkRegion(state, insertAt, k) });
      }
    } else if (marks[k]) {
      const plan = planMarkInsert(state, insertAt, k, true);
      insertAt = plan.insertAt;
    }
  }
  const wrapped = wrapWithAdds(text, adds);
  const insert = prefix + wrapped + suffix;
  const cursor = insertAt + prefix.length + addedOpenLen(adds) + text.length;
  let spec = { from: insertAt, to: insertAt, insert: insert, cursor: cursor };
  const repaired = repairUnrenderableSplit(state, spec, splits, marks, {
    prefix: prefix,
    suffix: suffix,
    wrapped: wrapped,
    textLen: text.length,
    textOffset: addedOpenLen(adds),
  });
  if (repaired) spec = repaired;
  inlineDbg.log('buildInsert', {
    pos: from,
    state: state,
    text: text,
    intended: marks,
    current: current,
    adds: adds,
    insertAt: insertAt,
    prefix: prefix,
    suffix: suffix,
    spec: spec,
  });
  return spec;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 * @param {string} text
 */
function applyPendingTypedInsert(view, from, to, text) {
  const pending = getPending(view.state);
  if (!pending.armed) return false;
  if (!text || text === '\n' || text === '\r\n') {
    view.dispatch({ effects: pendingFormatEffect.of(emptyPending()) });
    return false;
  }
  const plan = planTypedReplace(view.state, from, to, text, pending.marks);
  if (!plan) return false;
  inlineDbg.log('input.apply', {
    pos: from,
    state: view.state,
    from: from,
    to: to,
    text: text,
    pending: pending,
    plan: plan,
  });
  // 替换已有选区时可能把某个样式段掏空，须在同一事务里清掉残留的空定界符对
  dispatchTypedInsertWithCleanup(
    view,
    { from: plan.from, to: plan.to, insert: plan.insert },
    plan.cursor,
    [pendingFormatEffect.of({ armed: true, marks: Object.assign(emptyMarks(), pending.marks) })]
  );
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 * @param {string} text
 */
function handlePendingInput(view, from, to, text) {
  if (skipNextInputText != null && text === skipNextInputText) {
    inlineDbg.log('input.skip', { reason: 'compositionHandled', pos: from, text: text });
    skipNextInputText = null;
    return false;
  }
  if (view.composing || pendingImeActive) {
    inlineDbg.log('input.skip', {
      reason: view.composing ? 'composing' : 'pendingImeActive',
      pos: from,
      state: view.state,
      text: text,
    });
    return false;
  }
  const pending = getPending(view.state);
  if (!pending.armed) {
    inlineDbg.log('input.skip', { reason: 'notArmed', pos: from, state: view.state, text: text });
    return false;
  }
  // 放行与否同样要看干净文档：放行等价于「CM6 把 text 插到摘掉待删区后的 from 处」
  const basis = typedReplaceBasis(view.state, from, to);
  const current = getInlineFlagsAt(basis, from);
  const needs = !canPassThroughPendingInput(basis, from, pending.marks);
  inlineDbg.log('input.check', {
    pos: from,
    state: view.state,
    from: from,
    to: to,
    text: text,
    pending: pending,
    current: current,
    needsTransform: needs,
  });
  if (!needs) {
    inlineDbg.log('input.pass', {
      reason: 'marksMatch',
      pos: from,
      state: view.state,
      text: text,
      note: '延续样式：交给 CM6/IME，若末尾未包样式请查 docSnap',
    });
    return false;
  }
  if (text === '\n' || text === '\r\n') {
    view.dispatch({ effects: pendingFormatEffect.of(emptyPending()) });
    return false;
  }
  return applyPendingTypedInsert(view, from, to, text);
}

/**
 * @param {CompositionEvent} event
 * @param {import('@codemirror/view').EditorView} view
 */
function handleCompositionEnd(event, view) {
  const pending = getPending(view.state);
  const data = event && event.data ? event.data : '';
  const head = view.state.selection.main.head;
  inlineDbg.log('compose.end', {
    pos: head,
    state: view.state,
    data: data,
    pending: pending,
    armed: pending.armed,
  });
  if (!pending.armed) return false;
  if (!data) return false;
  const anchor = imeComposeAnchor;
  const plan = planCompositionEndReplace(view.state, head, data, pending.marks, anchor);
  if (!plan) {
    inlineDbg.log('compose.skip', {
      reason: 'noPlan',
      pos: head,
      state: view.state,
      data: data,
      anchor: anchor,
    });
    return false;
  }
  inlineDbg.log('compose.dispatch', { plan: plan });
  skipNextInputText = data;
  dispatchTypedInsertWithCleanup(
    view,
    { from: plan.from, to: plan.to, insert: plan.insert },
    plan.cursor,
    [pendingFormatEffect.of({ armed: true, marks: Object.assign(emptyMarks(), pending.marks) })]
  );
  return true;
}

function handleCompositionStart(_event, view) {
  pendingImeActive = true;
  skipNextInputText = null;
  if (view) {
    imeComposeAnchor = view.state.selection.main.head;
    inlineDbg.log('compose.start', {
      pos: imeComposeAnchor,
      state: view.state,
      pending: getPending(view.state),
    });
  } else {
    imeComposeAnchor = null;
  }
  return false;
}

/**
 * @param {InputEvent} event
 */
function handleBeforeInput(event) {
  if (!event || !event.inputType) return false;
  const t = String(event.inputType);
  if (t.indexOf('Composition') >= 0 || t === 'insertFromComposition') {
    pendingImeActive = true;
    inlineDbg.log('beforeinput.composition', { inputType: t });
  }
  return false;
}

function handleCompositionEndWrapper(event, view) {
  let handled = false;
  try {
    handled = handleCompositionEnd(event, view);
  } finally {
    pendingImeActive = false;
    imeComposeAnchor = null;
  }
  return handled;
}

function createPendingInlineFormatExtension() {
  return [
    pendingFormatField,
    EditorView.inputHandler.of(handlePendingInput),
    EditorView.domEventHandlers({
      beforeinput: handleBeforeInput,
      compositionstart: handleCompositionStart,
      compositionend: handleCompositionEndWrapper,
    }),
  ];
}

/** 事件目标所在的表格单元格（未武装待输入时 widgetPending 为空，只能从事件反查） */
function cellFromEventTarget(target) {
  if (!target) return null;
  const node = /** @type {Node} */ (target);
  const el =
    node.nodeType === 1 ? /** @type {HTMLElement} */ (node) : /** @type {any} */ (node).parentElement;
  if (!el || !el.closest) return null;
  return el.closest('th[contenteditable], td[contenteditable]');
}

/**
 * 取材：单元格当前 Markdown、光标 md 偏移、意图标记。
 * @returns {{ table: any, plan: Function, md: string, mdPos: number, marks: Record<string, boolean>, armed: boolean } | null}
 */
function readCellTypingContext(el) {
  let table;
  let plan;
  let cellFlags;
  try {
    // inline-string-ops 反过来依赖本模块（buildPendingTypedInsert），必须懒加载破环
    table = require('../widgets/table-cell-content');
    plan = require('./inline-string-ops').planTypedInsertInText;
    cellFlags = table.getCellInlineFlags(el);
  } catch (_) {
    return null;
  }
  const wp = getWidgetPending();
  const armed = !!(wp && wp.armed && wp.el === el);
  const marks = armed ? wp.marks : cellFlags ? cellFlags.flags : emptyMarks();
  const md = table.getCellMarkdownContent(el);
  const visStart = cellFlags ? cellFlags.pos : (el.textContent || '').length;
  return {
    table: table,
    plan: plan,
    md: md,
    mdPos: table.visibleToMarkdownOffset(md, visStart),
    marks: marks,
    armed: armed,
  };
}

/**
 * 按规划结果重写单元格并把光标放回插入点后。
 * @returns {boolean} 是否真的改写了（与浏览器朴素插入一致时返回 false，交回默认行为）
 */
function applyCellPlannedInsert(el, ctx, text, force) {
  const md = ctx.md;
  const mdPos = ctx.mdPos;
  let next;
  let cursorMd;
  // 走正文同一套落点规划：在样式段头前/尾后输入应并入该段，而不是另包一层
  // （盲目 wrapWithAdds 会插出 `**测试****加粗**`）。
  const planned = ctx.plan ? ctx.plan(md, mdPos, text, ctx.marks) : null;
  if (planned) {
    next = planned.value;
    cursorMd = planned.cursor;
  } else {
    next = md.slice(0, mdPos) + wrapWithAdds(text, ctx.marks) + md.slice(mdPos);
    cursorMd = mdPos + addedOpenLen(ctx.marks) + text.length;
  }
  // 未武装待输入时只在「规划结果 ≠ 浏览器朴素插入」时接管，避免每次按键都重建单元格 DOM
  const naive = md.slice(0, mdPos) + text + md.slice(mdPos);
  inlineDbg.log('cell.typedInsert', {
    md: md,
    mdPos: mdPos,
    text: text,
    marks: ctx.marks,
    armed: !!ctx.armed,
    next: next,
    takeover: force || next !== naive,
  });
  if (!force && next === naive) return false;
  ctx.table.setCellMarkdownContent(el, next);
  const cursorVis = ctx.table.markdownToVisibleOffset(next, cursorMd);
  try {
    el.focus();
  } catch (_) {
    /* ignore */
  }
  if (typeof ctx.table.setCellVisibleSelection === 'function') {
    ctx.table.setCellVisibleSelection(el, cursorVis, cursorVis);
  }
  // 用户显式取消的样式必须**继续有效**：插入后就清空待输入，下一个字会按落点周围的样式
  // 重新判断，于是只有第一个字落在样式外（`a**bc加粗**`），按钮也跟着弹回选中态。
  // 与正文 pendingFormatField 一致：保留覆盖态，只把落点更新到插入点之后。
  if (ctx.armed) {
    const after = ctx.table.getCellInlineFlags(el);
    widgetPending = {
      armed: true,
      marks: Object.assign(emptyMarks(), ctx.marks),
      el: el,
      base: after ? Object.assign(emptyMarks(), after.flags) : emptyMarks(),
      pos: after ? after.pos : cursorVis,
      explicit: true,
    };
  } else {
    widgetPending = null;
  }
  notifyWidgetPending();
  try {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (_) {
    /* ignore */
  }
  return true;
}

function onWidgetBeforeInput(e) {
  // 组字阶段落进 DOM 的是拼音，这里接管等于把拼音首字母当正式输入写死，
  // 且重建 DOM 会把组字打断（现象：`**加**c测试**粗**`）。IME 一律交 composition 路径。
  if (e.isComposing || e.inputType === 'insertCompositionText') return;
  const el = cellFromEventTarget(e.target);
  if (!el) return;
  if (!e.inputType || String(e.inputType).indexOf('insert') !== 0) return;
  const text = e.data;
  if (!text || text === '\n') return;
  const ctx = readCellTypingContext(el);
  if (!ctx) return;
  // marks 全关时仍须接管「光标正落在样式段内」的情形：用户刚按 Ctrl+B 取消了加粗，
  // 直接放行会让浏览器把字插进 <strong> 里，序列化回来还是 `**...**`（样式取消不掉）。
  if (!ctx.armed && !anyMarkOn(ctx.marks)) return;
  const saveDefault = applyCellPlannedInsert(el, ctx, text, ctx.armed);
  if (!saveDefault) return;
  e.preventDefault();
  e.stopPropagation();
}

/** 组字开始时拍一份**干净**取材（此刻拼音还没落盘），commit 时据此规划 */
function onWidgetCompositionStart(e) {
  widgetComposition = null;
  const el = cellFromEventTarget(e.target);
  if (!el) return;
  const ctx = readCellTypingContext(el);
  if (!ctx) return;
  if (!ctx.armed && !anyMarkOn(ctx.marks)) return;
  widgetComposition = { el: el, ctx: ctx, armed: ctx.armed };
}

function onWidgetCompositionEnd(e) {
  const comp = widgetComposition;
  widgetComposition = null;
  if (!comp || comp.el !== cellFromEventTarget(e.target)) return;
  const text = e.data;
  if (!text || text === '\n') return;
  // 用组字前的快照重排：DOM 里此刻是「拼音已被上屏文字替换」的结果，
  // 在被污染的文档上取材会让紧邻样式段认不出来（见 AGENTS.md §9.4l5）
  applyCellPlannedInsert(comp.el, comp.ctx, text, comp.armed);
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('beforeinput', onWidgetBeforeInput, true);
  document.addEventListener('compositionstart', onWidgetCompositionStart, true);
  document.addEventListener('compositionend', onWidgetCompositionEnd, true);
}

module.exports = {
  MARK_KEYS: MARK_KEYS,
  emptyMarks: emptyMarks,
  emptyPending: emptyPending,
  anyMarkOn: anyMarkOn,
  pendingFormatEffect: pendingFormatEffect,
  pendingFormatField: pendingFormatField,
  getPending: getPending,
  overlayPendingInlineState: overlayPendingInlineState,
  hasPendingInputFormat: hasPendingInputFormat,
  togglePendingInlineMark: togglePendingInlineMark,
  clearPendingInlineFormat: clearPendingInlineFormat,
  buildPendingTypedInsert: buildPendingTypedInsert,
  canPassThroughPendingInput: canPassThroughPendingInput,
  needsPendingInputTransform: needsPendingInputTransform,
  planCompositionEndReplace: planCompositionEndReplace,
  planTypedReplace: planTypedReplace,
  createPendingInlineFormatExtension: createPendingInlineFormatExtension,
  getWidgetPending: getWidgetPending,
  clearWidgetPending: clearWidgetPending,
  toggleWidgetPendingMark: toggleWidgetPendingMark,
  syncWidgetPendingForCaret: syncWidgetPendingForCaret,
  setWidgetPendingListener: setWidgetPendingListener,
  clearWidgetPendingMarks: clearWidgetPendingMarks,
  wrapWithAdds: wrapWithAdds,
};

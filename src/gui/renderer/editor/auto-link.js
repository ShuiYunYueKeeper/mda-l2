/**
 * 自动 URL → Markdown 链接：CM6 扩展 + 粘贴短路。
 */
'use strict';

const { EditorView, keymap } = require('@codemirror/view');
const { Prec } = require('@codemirror/state');
const { syntaxTree, ensureSyntaxTree } = require('@codemirror/language');
const {
  isWwwTerminator,
  isUrlTokenChar,
  findUrlTokenBefore,
  classifyUrlToken,
  planAutoLinkWrap,
  parseSimpleMarkdownLink,
  planGrowAutoLink,
  planPasteAutoLink,
  wrapMarkdownLink,
  planRepairNewlineInsideLink,
} = require('./model/auto-link');

const AUTO_LINK_EVENT = 'input.autoLink';

/** 禁止「裸 token → wrap」的节点（Link 内走 grow，不在此拦 grow） */
const BLOCKED_WRAP_NODES = new Set([
  'FencedCode',
  'CodeText',
  'InlineCode',
  'Link',
  'Autolink',
  'URL',
  'Image',
  'Comment',
]);

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {Set<string>} names
 * @returns {boolean}
 */
function posInNamedNodes(state, pos, names) {
  try {
    if (typeof ensureSyntaxTree === 'function') {
      ensureSyntaxTree(state, Math.min(state.doc.length, pos + 1), 50);
    }
  } catch (_) {
    /* ignore */
  }
  let node = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (names.has(node.name)) return true;
    if (node.name === 'Interpolation' || /Math/i.test(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @returns {boolean}
 */
function isBlockedWrapContext(state, pos) {
  return posInNamedNodes(state, pos, BLOCKED_WRAP_NODES);
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @returns {boolean}
 */
function isHardBlockedContext(state, pos) {
  return posInNamedNodes(
    state,
    pos,
    new Set(['FencedCode', 'CodeText', 'InlineCode', 'Image', 'Comment'])
  );
}

/**
 * @param {import('@codemirror/state').Transaction} tr
 * @returns {boolean}
 */
function isUserTypingOrPaste(tr) {
  if (!tr.docChanged) return false;
  if (tr.isUserEvent(AUTO_LINK_EVENT)) return false;
  return (
    tr.isUserEvent('input.type') ||
    tr.isUserEvent('input.paste') ||
    tr.isUserEvent('input.complete') ||
    tr.isUserEvent('input')
  );
}

/**
 * @param {import('@codemirror/state').Transaction} tr
 * @returns {{ inserted: string, fromA: number, toA: number, fromB: number, toB: number } | null}
 */
function singleInsertInfo(tr) {
  let info = null;
  let count = 0;
  tr.changes.iterChanges(function (fromA, toA, fromB, toB, inserted) {
    count += 1;
    if (count === 1) {
      info = {
        fromA: fromA,
        toA: toA,
        fromB: fromB,
        toB: toB,
        inserted: inserted.toString(),
      };
    }
  });
  if (count !== 1 || !info) return null;
  return info;
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function hrefForAutoText(text) {
  const classified = classifyUrlToken(text);
  if (classified) return classified.href;
  const lower = String(text || '').toLowerCase();
  if (lower.startsWith('https://') && text.length > 'https://'.length) return text;
  if (lower.startsWith('http://') && text.length > 'http://'.length) return text;
  if (/^www\./i.test(text)) return 'https://' + text;
  return null;
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} head
 */
function linkContentAtCaret(state, head) {
  let node = syntaxTree(state).resolveInner(head, -1);
  while (node && node.name !== 'Link') {
    node = node.parent;
  }
  if (!node || node.name !== 'Link') return null;
  const parsed = parseSimpleMarkdownLink(state.doc.toString(), node.from, node.to);
  if (!parsed) return null;
  if (head < parsed.textFrom || head > parsed.textTo) return null;
  return { linkFrom: node.from, linkTo: node.to, parsed: parsed };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ from: number, to: number, insert: string, caret: number }} plan
 */
function dispatchAutoLink(view, plan) {
  view.dispatch({
    changes: { from: plan.from, to: plan.to, insert: plan.insert },
    selection: { anchor: plan.caret, head: plan.caret },
    userEvent: AUTO_LINK_EVENT,
  });
}

/**
 * 定位光标所在（或紧邻）的 Link，并解析 `[text](href)`。
 * 允许 head 落在可见文本末到整段链接末（含隐藏的 `](…)`），避免 hide-mark 下误插进链内。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} head
 * @returns {{ linkFrom: number, linkTo: number, parsed: NonNullable<ReturnType<typeof parseSimpleMarkdownLink>> } | null}
 */
function linkAroundCaret(state, head) {
  try {
    if (typeof ensureSyntaxTree === 'function') {
      ensureSyntaxTree(state, Math.min(state.doc.length, head + 1), 50);
    }
  } catch (_) {
    /* ignore */
  }
  let node = syntaxTree(state).resolveInner(head, -1);
  while (node && node.name !== 'Link') {
    node = node.parent;
  }
  if (!node || node.name !== 'Link') {
    node = syntaxTree(state).resolveInner(head, 1);
    while (node && node.name !== 'Link') {
      node = node.parent;
    }
  }
  if (!node || node.name !== 'Link') return null;
  const parsed = parseSimpleMarkdownLink(state.doc.toString(), node.from, node.to);
  if (!parsed) return null;
  // 光标必须仍在链接同一行，避免下一空行 resolveInner 误挂到上一行 Link
  if (state.doc.lineAt(node.from).number !== state.doc.lineAt(head).number) return null;
  // 可见文本末 … 整段链接末（含隐藏标记）均可退出
  if (head < parsed.textTo || head > node.to) return null;
  return { linkFrom: node.from, linkTo: node.to, parsed: parsed };
}

/**
 * 在自动链可见文本末（或隐藏 `](…)` 上）按 Enter/Space：把收尾符插到整段之后。
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} insert
 * @returns {boolean}
 */
function exitAutoLinkWith(view, insert) {
  const head = view.state.selection.main.head;
  if (view.state.selection.main.from !== head) return false;
  const inLink = linkAroundCaret(view.state, head);
  if (!inLink) return false;
  const at = inLink.linkTo;
  view.dispatch({
    changes: { from: at, to: at, insert: insert },
    selection: { anchor: at + insert.length, head: at + insert.length },
    userEvent: 'input.type',
  });
  return true;
}

/**
 * 裸 URL/www 在光标前：Enter/Space 时一次性包装并把收尾符放到整段链接后。
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} breakChar
 * @returns {boolean}
 */
function wrapBareUrlThenBreak(view, breakChar) {
  const head = view.state.selection.main.head;
  if (view.state.selection.main.from !== head) return false;
  if (isHardBlockedContext(view.state, Math.max(0, head - 1))) return false;
  const docText = view.state.doc.toString();
  const found = findUrlTokenBefore(docText, head);
  if (!found || found.to !== head) return false;
  if (found.from > 0 && docText.charAt(found.from - 1) === '[') return false;
  const classified = classifyUrlToken(found.token);
  if (!classified) return false;
  const wrapped = wrapMarkdownLink(classified.text, classified.href);
  const insert = wrapped + breakChar;
  view.dispatch({
    changes: { from: found.from, to: found.to, insert: insert },
    selection: { anchor: found.from + insert.length, head: found.from + insert.length },
    userEvent: AUTO_LINK_EVENT,
  });
  return true;
}

/**
 * Enter/Space：先退出已有链，再尝试包装裸 URL。
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} breakChar
 * @returns {boolean}
 */
function handleAutoLinkBreak(view, breakChar) {
  if (exitAutoLinkWith(view, breakChar)) return true;
  if (wrapBareUrlThenBreak(view, breakChar)) return true;
  return false;
}

/**
 * @param {import('@codemirror/view').ViewUpdate} update
 */
function onAutoLinkUpdate(update) {
  if (!update.docChanged) return;
  const view = update.view;
  if (view.composing) return;

  let lastUserTr = null;
  for (let i = 0; i < update.transactions.length; i++) {
    const tr = update.transactions[i];
    if (isUserTypingOrPaste(tr)) lastUserTr = tr;
  }
  if (!lastUserTr) return;

  const head = update.state.selection.main.head;
  if (update.state.selection.main.from !== update.state.selection.main.to) return;
  if (isHardBlockedContext(update.state, Math.max(0, head - 1))) return;

  const insertInfo = singleInsertInfo(lastUserTr);
  const docText = update.state.doc.toString();

  // —— 修复：换行已被插进 [text]\n](href) ——
  if (insertInfo && insertInfo.inserted === '\n') {
    const repaired = planRepairNewlineInsideLink(docText, insertInfo.fromB);
    if (repaired) {
      dispatchAutoLink(view, repaired);
      return;
    }
  }

  // —— 已在 Link 文本末：仅 URL 字符同步 href（换行/空格不走 grow）——
  const inLink = linkContentAtCaret(update.state, head);
  if (
    inLink &&
    insertInfo &&
    insertInfo.inserted.length > 0 &&
    head === inLink.parsed.textTo &&
    isUrlTokenChar(insertInfo.inserted.slice(-1))
  ) {
    const newText = inLink.parsed.text;
    const newHref = hrefForAutoText(newText);
    if (newHref && newHref !== inLink.parsed.href) {
      const plan = planGrowAutoLink(inLink.linkFrom, inLink.linkTo, newText, newHref);
      const cur = docText.slice(inLink.linkFrom, inLink.linkTo);
      if (cur !== plan.insert) {
        dispatchAutoLink(view, plan);
        return;
      }
    }
    return;
  }

  // —— 裸 token → wrap ——
  if (isBlockedWrapContext(update.state, Math.max(0, head - 1))) return;

  const justTerm =
    !!insertInfo && insertInfo.inserted.length === 1 && isWwwTerminator(insertInfo.inserted);
  const justSchemeChar =
    !!insertInfo &&
    insertInfo.inserted.length === 1 &&
    isUrlTokenChar(insertInfo.inserted);

  const tokenHead = justTerm ? head - 1 : head;
  const found = findUrlTokenBefore(docText, tokenHead);
  if (!found) return;
  if (isBlockedWrapContext(update.state, found.from)) return;

  const classified = classifyUrlToken(found.token);
  if (!classified) return;

  if (found.from > 0 && docText.charAt(found.from - 1) === '[') return;

  if (classified.kind === 'scheme') {
    if (!justSchemeChar && !lastUserTr.isUserEvent('input.paste')) return;
    // 续打 URL 时 caret 留在文本末；粘贴则整段后
    const caretMode = lastUserTr.isUserEvent('input.paste') ? 'afterLink' : 'textEnd';
    dispatchAutoLink(view, planAutoLinkWrap(found.from, found.to, classified, { caret: caretMode }));
    return;
  }

  if (classified.kind === 'www') {
    if (!justTerm && !lastUserTr.isUserEvent('input.paste')) return;
    // 收尾符已在 token 之后：一并吃进替换，caret 停在收尾符后（避免落在 \n 上看起来像还在链尾）
    const term = justTerm && insertInfo ? insertInfo.inserted : '';
    const wrapped = wrapMarkdownLink(classified.text, classified.href);
    dispatchAutoLink(view, {
      from: found.from,
      to: found.to + term.length,
      insert: wrapped + term,
      caret: found.from + wrapped.length + term.length,
    });
  }
}

/**
 * @returns {import('@codemirror/state').Extension[]}
 */
function createAutoLinkExtension() {
  return [
    // 须高于 heading Enter 等 Prec.high，否则链尾回车会先走默认插入拆坏链接
    Prec.highest(
      keymap.of([
        {
          key: 'Enter',
          run: function (view) {
            return handleAutoLinkBreak(view, '\n');
          },
        },
        {
          key: 'Space',
          run: function (view) {
            return handleAutoLinkBreak(view, ' ');
          },
        },
      ])
    ),
    EditorView.updateListener.of(onAutoLinkUpdate),
  ];
}

/**
 * @returns {(event: ClipboardEvent, view: import('@codemirror/view').EditorView) => boolean}
 */
function createAutoLinkPasteHandler() {
  return function (event, view) {
    if (!event || !event.clipboardData || !view) return false;
    const raw = event.clipboardData.getData('text/plain');
    if (raw == null || raw === '') return false;
    const wrapped = planPasteAutoLink(raw);
    if (!wrapped) return false;
    const sel = view.state.selection.main;
    if (isHardBlockedContext(view.state, sel.from)) return false;
    event.preventDefault();
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: wrapped },
      selection: { anchor: sel.from + wrapped.length, head: sel.from + wrapped.length },
      userEvent: AUTO_LINK_EVENT,
    });
    return true;
  };
}

module.exports = {
  createAutoLinkExtension: createAutoLinkExtension,
  createAutoLinkPasteHandler: createAutoLinkPasteHandler,
  AUTO_LINK_EVENT: AUTO_LINK_EVENT,
  isHardBlockedContext: isHardBlockedContext,
  isBlockedWrapContext: isBlockedWrapContext,
  hrefForAutoText: hrefForAutoText,
  wrapMarkdownLink: wrapMarkdownLink,
  exitAutoLinkWith: exitAutoLinkWith,
  wrapBareUrlThenBreak: wrapBareUrlThenBreak,
  handleAutoLinkBreak: handleAutoLinkBreak,
  linkAroundCaret: linkAroundCaret,
};

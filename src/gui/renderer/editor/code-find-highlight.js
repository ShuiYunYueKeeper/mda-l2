/**
 * CM6 预览模式：围栏代码块内查找匹配 DOM 高亮。
 */
'use strict';

const { readPlainCodeDom } = require('./widgets/code');
const {
  FIND_MARK_CLS,
  FIND_ACTIVE_CLS,
  clearContainerFindMarks,
  applyVisibleHighlightsInContainer,
  indexLogicalTextNodes,
  indexTextNodes,
} = require('./widget-find-dom');

/**
 * @param {number} blockFrom
 * @param {string} blockText
 * @returns {{ bodyFrom: number, bodyTo: number, code: string } | null}
 */
function getFenceBodyDocRange(blockFrom, blockText) {
  const text = String(blockText || '').replace(/\r\n/g, '\n');
  const openNl = text.indexOf('\n');
  if (openNl < 0) return null;
  const openLine = text.slice(0, openNl);
  const openM = /^ {0,3}(`{3,}|~{3,})/.exec(openLine);
  if (!openM) return null;
  const marker = openM[1];
  const ch = marker.charAt(0);
  const minLen = marker.length;
  const closeRe = new RegExp('^ {0,3}\\' + ch + '{' + minLen + ',}\\s*$');

  const bodyStartRel = openNl + 1;
  let bodyEndRel = text.length;
  const tail = text.slice(bodyStartRel);
  let scan = 0;
  while (scan < tail.length) {
    const nl = tail.indexOf('\n', scan);
    const lineEnd = nl < 0 ? tail.length : nl;
    const line = tail.slice(scan, lineEnd);
    if (closeRe.test(line)) {
      bodyEndRel = bodyStartRel + scan;
      break;
    }
    scan = nl < 0 ? tail.length : nl + 1;
  }

  const code = text.slice(bodyStartRel, bodyEndRel);
  return {
    bodyFrom: blockFrom + bodyStartRel,
    bodyTo: blockFrom + bodyEndRel,
    code: code,
  };
}

/**
 * @param {HTMLElement} codeInput
 * @returns {string}
 */
function getCodeInputPlainText(codeInput) {
  if (!codeInput) return '';
  if (codeInput.querySelector && codeInput.querySelector('br')) {
    return readPlainCodeDom(codeInput).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  return String(codeInput.textContent || '')
    .replace(/\u200b/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * @param {string} a
 * @param {string} b
 */
function fencePlainAligns(a, b) {
  if (a === b) return true;
  if (a.endsWith('\n') && a.slice(0, -1) === b) return true;
  if (b.endsWith('\n') && b.slice(0, -1) === a) return true;
  return false;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @returns {{ from: number, to: number }[]}
 */
function getCodeBlockRanges(view) {
  const ranges = [];
  if (!view || !view.dom) return ranges;
  const blocks = view.dom.querySelectorAll('.mda-cm-code-block');
  for (let i = 0; i < blocks.length; i++) {
    const from = parseInt(blocks[i].getAttribute('data-mda-block-from') || '', 10);
    const to = parseInt(blocks[i].getAttribute('data-mda-block-to') || '', 10);
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
      ranges.push({ from: from, to: to });
    }
  }
  return ranges;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function clearCodeFindHighlights(view) {
  if (!view || !view.dom) return;
  const inputs = view.dom.querySelectorAll('.mda-cm-code-input');
  for (let i = 0; i < inputs.length; i++) clearContainerFindMarks(inputs[i]);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ start: number, end: number }[]} matches
 * @param {number} activeIndex
 */
function applyCodeFindHighlights(view, matches, activeIndex) {
  if (!view || !view.dom) return;
  clearCodeFindHighlights(view);
  if (!matches || !matches.length) return;

  const doc = view.state.doc.toString();
  const blocks = view.dom.querySelectorAll('.mda-cm-code-block');
  /** @type {Map<HTMLElement, { visStart: number, visEnd: number, cls: string }[]>} */
  const inputRanges = new Map();

  for (let bi = 0; bi < blocks.length; bi++) {
    const root = blocks[bi];
    const blockFrom = parseInt(root.getAttribute('data-mda-block-from') || '', 10);
    const blockTo = parseInt(root.getAttribute('data-mda-block-to') || '', 10);
    if (!Number.isFinite(blockFrom) || !Number.isFinite(blockTo) || blockTo <= blockFrom) {
      continue;
    }
    const blockText = doc.slice(blockFrom, blockTo);
    const body = getFenceBodyDocRange(blockFrom, blockText);
    if (!body) continue;

    const codeInput = root.querySelector('.mda-cm-code-input');
    if (!codeInput) continue;

    const plain = getCodeInputPlainText(codeInput);
    if (!fencePlainAligns(plain, body.code)) continue;

    const useLogical = !!(codeInput.querySelector && codeInput.querySelector('br'));
    const indexFn = useLogical ? indexLogicalTextNodes : indexTextNodes;
    const plainLen = indexFn(codeInput).reduce(function (sum, n) {
      return sum + (n.globalEnd - n.globalStart);
    }, 0);
    const codeLen = body.code.length;
    const lenOk = plainLen === codeLen || plainLen === codeLen + 1 || plainLen === codeLen - 1;

    for (let mi = 0; mi < matches.length; mi++) {
      const m = matches[mi];
      if (m.end <= m.start) continue;
      if (m.end <= body.bodyFrom || m.start >= body.bodyTo) continue;

      const matchFrom = Math.max(m.start, body.bodyFrom);
      const matchTo = Math.min(m.end, body.bodyTo);
      const visStart = matchFrom - body.bodyFrom;
      const visEnd = matchTo - body.bodyFrom;
      if (visEnd <= visStart) continue;
      if (visEnd > codeLen || (lenOk && visEnd > plainLen)) continue;

      const slice = body.code.slice(visStart, visEnd);
      const docSlice = doc.slice(matchFrom, matchTo);
      if (slice !== docSlice) continue;

      const isActive = mi === activeIndex;
      const cls = isActive ? FIND_ACTIVE_CLS : FIND_MARK_CLS;
      if (!inputRanges.has(codeInput)) inputRanges.set(codeInput, []);
      inputRanges.get(codeInput).push({ visStart: visStart, visEnd: visEnd, cls: cls });
    }
  }

  inputRanges.forEach(function (ranges, input) {
    applyVisibleHighlightsInContainer(input, ranges);
  });
}

module.exports = {
  applyCodeFindHighlights: applyCodeFindHighlights,
  clearCodeFindHighlights: clearCodeFindHighlights,
  getCodeBlockRanges: getCodeBlockRanges,
  getFenceBodyDocRange: getFenceBodyDocRange,
  getCodeInputPlainText: getCodeInputPlainText,
};

/**
 * CM6 大纲滚动高亮：
 * 1. 视口内最靠上的标题（出现在上半区时直接高亮）；
 * 2. 否则取已滚过视口顶缘的最近标题（小阈值，非 20%）。
 */
'use strict';

/**
 * @param {import('@codemirror/state').Text} doc
 * @param {number} lineNum 1-based
 * @returns {number}
 */
function headingProbePos(doc, lineNum) {
  const line = doc.line(lineNum);
  const m = line.text.match(/^#{1,6}\s+/);
  if (m) {
    const probe = line.from + m[0].length;
    if (probe < line.to) return probe;
  }
  return line.from;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} lineNum 1-based
 * @returns {boolean}
 */
function isHeadingRenderedInViewport(view, lineNum) {
  const doc = view.state.doc;
  if (lineNum < 1 || lineNum > doc.lines) return false;
  try {
    const probe = headingProbePos(doc, lineNum);
    const dom = view.domAtPos(probe, 1);
    let node = dom.node;
    if (node.nodeType === 3) node = node.parentElement;
    const cmLine = node && node.closest ? node.closest('.cm-line') : null;
    const scroller = view.scrollDOM;
    if (!cmLine || !scroller.contains(cmLine)) return false;
    const rect = cmLine.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    return rect.bottom > sr.top + 1 && rect.top < sr.bottom - 1;
  } catch (_) {
    return false;
  }
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} lineNum 1-based
 * @returns {number|null} 文档坐标（与 scrollTop 同系）
 */
function getHeadingDocTop(view, lineNum) {
  const doc = view.state.doc;
  if (lineNum < 1 || lineNum > doc.lines) return null;
  const probe = headingProbePos(doc, lineNum);
  const scroller = view.scrollDOM;

  let blockTop;
  try {
    blockTop = view.lineBlockAt(probe).top;
  } catch (_) {
    return null;
  }

  try {
    const dom = view.domAtPos(probe, 1);
    let node = dom.node;
    if (node.nodeType === 3) node = node.parentElement;
    const cmLine = node && node.closest ? node.closest('.cm-line') : null;
    if (cmLine && scroller.contains(cmLine)) {
      const rect = cmLine.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      if (rect.bottom > sr.top + 1 && rect.top < sr.bottom - 1) {
        return scroller.scrollTop + (rect.top - sr.top);
      }
    }
  } catch (_) {}

  return blockTop;
}

/**
 * @param {{ line: number, docTop: number, inViewport: boolean }[]} entries 按 line 升序
 * @param {number} scrollTop
 * @param {number} clientH
 * @returns {number|null}
 */
function pickOutlineActiveFromEntries(entries, scrollTop, clientH) {
  if (!entries.length) return null;

  const visibleBand = Math.max(80, clientH * 0.6);
  let topmostVisible = null;
  let topmostDocTop = Infinity;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.inViewport) continue;
    if (e.docTop < topmostDocTop) {
      topmostDocTop = e.docTop;
      topmostVisible = e.line;
    }
  }

  if (topmostVisible != null && topmostDocTop - scrollTop <= visibleBand) {
    return topmostVisible;
  }

  const passTop = scrollTop + Math.min(64, Math.max(16, clientH * 0.08));
  let active = entries[0].line;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.docTop <= passTop + 0.5) active = e.line;
    else if (e.inViewport) break;
  }
  return active;
}

/**
 * @param {number[]} headingLines 1-based 升序
 * @param {number} line
 * @returns {number}
 */
function headingAtOrBefore(headingLines, line) {
  let active = headingLines[0];
  for (let i = 0; i < headingLines.length; i++) {
    if (headingLines[i] <= line) active = headingLines[i];
    else break;
  }
  return active;
}

/**
 * @param {import('@codemirror/state').Text | { line: (n: number) => { text: string }, lines: number }} doc
 * @param {number} lineNum 1-based
 */
function isHeadingDocLine(doc, lineNum) {
  if (!doc || lineNum < 1 || lineNum > doc.lines) return false;
  return /^\s{0,3}#{1,6}(?:\s|$)/.test(doc.line(lineNum).text);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 * @returns {number|null} 1-based 标题行号
 */
function getHeadingLineAtPos(view, pos) {
  if (!view || pos == null) return null;
  const doc = view.state.doc;
  if (pos < 0 || pos > doc.length) return null;
  const line = doc.lineAt(pos);
  if (!isHeadingDocLine(doc, line.number)) return null;
  return line.number;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number[]} headingLines 1-based 升序
 * @returns {number|null}
 */
function getOutlineActiveLine(view, headingLines) {
  if (!headingLines || !headingLines.length) return null;

  const scroller = view.scrollDOM;
  const scrollTop = scroller.scrollTop;
  const clientH = scroller.clientHeight;
  const scrollH = scroller.scrollHeight;

  if (scrollTop <= 4) return headingLines[0];
  if (scrollTop + clientH >= scrollH - 8) {
    return headingLines[headingLines.length - 1];
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const headingSet = new Set(headingLines);
  const entries = [];

  // 优先：扫描视口内标题 cm-line（纯文本行，posAtCoords 可靠）
  const domTopByLine = new Map();
  const nodes = scroller.querySelectorAll(
    '.cm-line.mda-cm-h1-line, .cm-line.mda-cm-h2-line, .cm-line.mda-cm-h3-line, ' +
    '.cm-line.mda-cm-h4-line, .cm-line.mda-cm-h5-line, .cm-line.mda-cm-h6-line'
  );
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const rect = el.getBoundingClientRect();
    if (rect.bottom <= scrollerRect.top + 1) continue;
    if (rect.top >= scrollerRect.bottom - 1) continue;
    const y = rect.top + Math.min(8, Math.max(2, rect.height * 0.3));
    const pos = view.posAtCoords({ x: rect.left + 8, y: y }, false);
    if (pos == null) continue;
    const lineNum = view.state.doc.lineAt(pos).number;
    if (!headingSet.has(lineNum)) continue;
    const docTop = scrollTop + (rect.top - scrollerRect.top);
    const prev = domTopByLine.get(lineNum);
    if (prev == null || docTop < prev) domTopByLine.set(lineNum, docTop);
  }

  for (let i = 0; i < headingLines.length; i++) {
    const lineNum = headingLines[i];
    const domTop = domTopByLine.get(lineNum);
    const docTop = domTop != null ? domTop : getHeadingDocTop(view, lineNum);
    if (docTop == null) continue;
    entries.push({
      line: lineNum,
      docTop: docTop,
      inViewport: domTop != null || isHeadingRenderedInViewport(view, lineNum),
    });
  }

  if (!entries.length) return headingLines[0];
  return pickOutlineActiveFromEntries(entries, scrollTop, clientH);
}

module.exports = {
  getOutlineActiveLine: getOutlineActiveLine,
  getHeadingDocTop: getHeadingDocTop,
  isHeadingRenderedInViewport: isHeadingRenderedInViewport,
  headingProbePos: headingProbePos,
  headingAtOrBefore: headingAtOrBefore,
  isHeadingDocLine: isHeadingDocLine,
  getHeadingLineAtPos: getHeadingLineAtPos,
  pickOutlineActiveFromEntries: pickOutlineActiveFromEntries,
};

/**
 * M8-C5：块级公式选中态（内存 + DOM；撤销可恢复）。
 */
'use strict';

const {
  setSelectedBlock,
  getSelectedBlockOfKind,
  clearSelectedBlock,
} = require('./block-selection');

/**
 * @param {{ from: number, to: number, source: string } | null} block
 */
function setSelectedMathBlock(block) {
  if (!block) {
    clearSelectedBlock();
    return;
  }
  setSelectedBlock({
    kind: 'math',
    from: block.from,
    to: block.to,
    source: block.source || '',
  });
}

/**
 * @returns {{ from: number, to: number, source: string } | null}
 */
function getSelectedMathBlock() {
  const mem = getSelectedBlockOfKind('math');
  if (mem) {
    return { from: mem.from, to: mem.to, source: mem.source };
  }
  const el = document.querySelector('.mda-cm-math-block.mda-cm-block-selected');
  if (!el) return null;
  const from = parseInt(el.getAttribute('data-mda-block-from') || '', 10);
  const to = parseInt(el.getAttribute('data-mda-block-to') || '', 10);
  if (!(from >= 0) || !(to > from)) return null;
  const source = el.getAttribute('data-mda-block-source') || '';
  return { from: from, to: to, source: source };
}

function clearSelectedMathBlock() {
  const mem = getSelectedBlockOfKind('math');
  if (mem) clearSelectedBlock();
  const nodes = document.querySelectorAll('.mda-cm-math-block.mda-cm-block-selected');
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].classList.remove('mda-cm-block-selected');
  }
  const frames = document.querySelectorAll('.mda-cm-math-frame.mda-cm-media-selected');
  for (let j = 0; j < frames.length; j++) {
    frames[j].classList.remove('mda-cm-media-selected');
  }
}

module.exports = {
  setSelectedMathBlock: setSelectedMathBlock,
  getSelectedMathBlock: getSelectedMathBlock,
  clearSelectedMathBlock: clearSelectedMathBlock,
};

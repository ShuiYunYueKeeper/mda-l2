/**
 * M8-C4：围栏代码块选中态（内存 + DOM，供快捷键删除；撤销可恢复）。
 */
'use strict';

const {
  setSelectedBlock,
  getSelectedBlockOfKind,
  clearSelectedBlock,
} = require('./block-selection');

/**
 * @param {{ from: number, to: number, source: string, lang?: string, code?: string } | null} block
 */
function setSelectedCodeBlock(block) {
  if (!block) {
    clearSelectedBlock();
    return;
  }
  setSelectedBlock({
    kind: 'code',
    from: block.from,
    to: block.to,
    source: block.source || '',
  });
}

/**
 * @returns {{ from: number, to: number, source: string, lang?: string, code?: string } | null}
 */
function getSelectedCodeBlock() {
  const mem = getSelectedBlockOfKind('code');
  if (mem) {
    return { from: mem.from, to: mem.to, source: mem.source };
  }
  const el = document.querySelector('.mda-cm-code-block.mda-cm-block-selected');
  if (!el) return null;
  const from = parseInt(el.getAttribute('data-mda-block-from') || '', 10);
  const to = parseInt(el.getAttribute('data-mda-block-to') || '', 10);
  if (!(from >= 0) || !(to > from)) return null;
  const source = el.getAttribute('data-mda-block-source') || '';
  return { from: from, to: to, source: source };
}

function clearSelectedCodeBlock() {
  const mem = getSelectedBlockOfKind('code');
  if (mem) clearSelectedBlock();
  const nodes = document.querySelectorAll('.mda-cm-code-block.mda-cm-block-selected');
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].classList.remove('mda-cm-block-selected');
  }
}

module.exports = {
  setSelectedCodeBlock: setSelectedCodeBlock,
  getSelectedCodeBlock: getSelectedCodeBlock,
  clearSelectedCodeBlock: clearSelectedCodeBlock,
};

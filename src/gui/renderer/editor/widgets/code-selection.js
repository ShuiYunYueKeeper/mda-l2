/**
 * M8-C4：围栏代码块选中态（DOM 查询，供快捷键删除）。
 */
'use strict';

/**
 * @returns {{ from: number, to: number, source: string, lang?: string, code?: string } | null}
 */
function getSelectedCodeBlock() {
  const el = document.querySelector('.mda-cm-code-block.mda-cm-block-selected');
  if (!el) return null;
  const from = parseInt(el.getAttribute('data-mda-block-from') || '', 10);
  const to = parseInt(el.getAttribute('data-mda-block-to') || '', 10);
  if (!(from >= 0) || !(to > from)) return null;
  const source = el.getAttribute('data-mda-block-source') || '';
  return { from: from, to: to, source: source };
}

function clearSelectedCodeBlock() {
  const nodes = document.querySelectorAll('.mda-cm-code-block.mda-cm-block-selected');
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].classList.remove('mda-cm-block-selected');
  }
}

module.exports = {
  getSelectedCodeBlock: getSelectedCodeBlock,
  clearSelectedCodeBlock: clearSelectedCodeBlock,
};

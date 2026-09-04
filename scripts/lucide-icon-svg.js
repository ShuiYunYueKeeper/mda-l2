/**
 * Lucide IconNode → 内联 SVG 字符串（24×24 描边，ISC）。
 */
'use strict';

const SVG_ATTRS = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

/**
 * @param {import('lucide').IconNode} node
 * @returns {string}
 */
function serializeNode(node) {
  const tag = node[0];
  const attrs = node[1] || {};
  const children = node[2];
  const attrStr = Object.keys(attrs)
    .map(function (k) {
      return k + '="' + String(attrs[k]).replace(/"/g, '&quot;') + '"';
    })
    .join(' ');
  if (!children || !children.length) {
    return '<' + tag + (attrStr ? ' ' + attrStr : '') + '/>';
  }
  return (
    '<' +
    tag +
    (attrStr ? ' ' + attrStr : '') +
    '>' +
    children.map(serializeNode).join('') +
    '</' +
    tag +
    '>'
  );
}

/**
 * @param {import('lucide').IconNode[]} iconNode
 * @returns {string}
 */
function iconSvg(iconNode) {
  const rootAttrs = Object.keys(SVG_ATTRS)
    .map(function (k) {
      return k + '="' + SVG_ATTRS[k] + '"';
    })
    .join(' ');
  return '<svg ' + rootAttrs + '>' + iconNode.map(serializeNode).join('') + '</svg>';
}

module.exports = {
  iconSvg: iconSvg,
};
